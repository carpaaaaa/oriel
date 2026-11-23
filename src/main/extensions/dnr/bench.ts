// Timing the matcher with many rules (studio/04 §8.4: "hundreds of thousands
// of rules without slowing navigation"). Real rule files (uBlock Origin
// Lite's) topped up with made-up rules of the same shapes, then a mix of
// requests that hit and miss.

import fs from 'node:fs'
import { compileRule, type CompiledRule } from './compile'
import { RuleIndex, Req } from './matcher'
import type { Rule } from './types'

const WORDS = ['ads', 'banner', 'track', 'pixel', 'analytics', 'collect', 'promo', 'sponsor', 'widget', 'beacon', 'metrics', 'tag', 'event', 'impression', 'click', 'stats', 'log', 'prebid', 'vast', 'video']
const SITES = ['www.google.com', 'www.youtube.com', 'en.wikipedia.org', 'www.amazon.com', 'www.reddit.com', 'news.ycombinator.com', 'github.com', 'www.nytimes.com', 'www.bbc.co.uk', 'cdn.jsdelivr.net', 'fonts.gstatic.com', 'i.ytimg.com', 'static.xx.fbcdn.net', 'www.corriere.it', 'www.repubblica.it']
const TYPES = ['script', 'image', 'xmlhttprequest', 'sub_frame', 'stylesheet', 'font', 'media', 'ping']

function rng(seed: number): () => number {
  let s = seed >>> 0
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32 }
}

export function benchMatcher(options: { files: string[]; total: number; requests: number }): Record<string, unknown> {
  const rand = rng(42)
  const pick = <T>(a: T[]) => a[Math.floor(rand() * a.length)]
  const heap0 = process.memoryUsage().heapUsed
  let t = performance.now()
  const raw: Rule[] = []
  const domains: string[] = []
  for (const f of options.files) {
    for (const r of JSON.parse(fs.readFileSync(f, 'utf8')) as Rule[]) {
      raw.push(r)
      for (const d of r.condition?.requestDomains ?? []) if (domains.length < 200000) domains.push(d)
    }
  }
  const real = raw.length
  // Made-up rules in the shapes filter lists use most.
  let id = 1e7
  while (raw.length < options.total) {
    const d = domains.length ? pick(domains) : `ad${raw.length}.example`
    const w = pick(WORDS)
    const n = raw.length % 5
    raw.push(
      n === 0 ? { id: id++, priority: 1, action: { type: 'block' }, condition: { urlFilter: `||${raw.length}-${d}^` } }
      : n === 1 ? { id: id++, action: { type: 'block' }, condition: { urlFilter: `/${w}${raw.length % 997}/`, resourceTypes: ['script', 'image'], domainType: 'thirdParty' } }
      : n === 2 ? { id: id++, action: { type: 'block' }, condition: { urlFilter: `||${d}/${w}/*/${raw.length}.js`, initiatorDomains: [pick(SITES).replace(/^www\./, '')] } }
      : n === 3 ? { id: id++, priority: 2, action: { type: 'allow' }, condition: { urlFilter: `||x${raw.length}.${d}/${w}^`, resourceTypes: ['xmlhttprequest'] } }
      : { id: id++, action: { type: 'block' }, condition: { requestDomains: [`${raw.length}.${d}`], resourceTypes: ['sub_frame'] } },
    )
  }
  const readMs = performance.now() - t

  t = performance.now()
  const compiled: CompiledRule[] = []
  let invalid = 0
  for (const r of raw) { try { compiled.push(compileRule(r, 'bench', 'static')) } catch { invalid++ } }
  const compileMs = performance.now() - t
  t = performance.now()
  const main = compiled.filter(r => r.type !== 'modifyHeaders' && !r.responseHeaders && !r.excludedResponseHeaders)
  const index = new RuleIndex(main)
  const indexMs = performance.now() - t
  const heapMB = (process.memoryUsage().heapUsed - heap0) / 1e6

  // Requests: half to ordinary sites, half to domains the rules name.
  const reqs: { url: string; type: string; initiator: string }[] = []
  for (let i = 0; i < options.requests; i++) {
    const site = pick(SITES)
    const host = i % 2 === 0 ? pick(SITES) : (domains.length ? pick(domains) : 'tracker.example')
    const path = `/${pick(WORDS)}/${Math.floor(rand() * 1e6).toString(36)}/${pick(['main.js', 'img.png', 'collect?v=1&tid=UA-1234', 'frame.html', 'style.css'])}`
    reqs.push({ url: `https://${host}${path}`, type: pick(TYPES), initiator: site })
  }
  // Warm up, then time each request on its own and all together.
  for (const r of reqs.slice(0, 2000)) index.best(new Req(r.url, r.type, 'GET', 1, r.initiator, r.initiator))
  const times: number[] = []
  let hits = 0
  const cpu0 = process.cpuUsage()
  const all0 = performance.now()
  for (const r of reqs) {
    const s = performance.now()
    if (index.best(new Req(r.url, r.type, 'GET', 1, r.initiator, r.initiator))) hits++
    times.push(performance.now() - s)
  }
  const allMs = performance.now() - all0
  const cpu = process.cpuUsage(cpu0)
  times.sort((a, b) => a - b)
  const us = (ms: number) => Math.round(ms * 1000 * 10) / 10
  return {
    rules: compiled.length,
    realRules: real,
    invalid,
    readMs: Math.round(readMs),
    compileMs: Math.round(compileMs),
    indexMs: Math.round(indexMs),
    heapMB: Math.round(heapMB),
    requests: reqs.length,
    hits,
    meanUs: us(allMs / reqs.length),
    /** CPU time per request: steadier than the clock on a busy machine. */
    cpuUs: Math.round((cpu.user + cpu.system) / reqs.length * 10) / 10,
    p50Us: us(times[Math.floor(times.length * 0.5)]),
    p99Us: us(times[Math.floor(times.length * 0.99)]),
    maxUs: us(times[times.length - 1]),
    index: index.stats(),
  }
}
