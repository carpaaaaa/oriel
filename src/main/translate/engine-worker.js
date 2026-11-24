// The translation engine's own thread (studio/03 §6.3 "eseguire in un
// Worker"): Bergamot (Firefox Translations' Marian in WebAssembly, MPL-2.0)
// and the language detector, away from the main process's loop. This file
// is read as text and run with worker_threads' eval; it gets the engine's
// glue and its .wasm bytes from the main process, so nothing is read from
// inside the app's package here. Owned by the translate module.
/* eslint-disable */
const { parentPort, workerData } = require('node:worker_threads')
const { readFileSync } = require('node:fs')
const vm = require('node:vm')

// The engine's matrix products, from inside its own .wasm (no native gemm
// outside Firefox), under the names Bergamot asks for.
const GEMM = {
  int8_prepare_a: 'int8PrepareAFallback',
  int8_prepare_b: 'int8PrepareBFallback',
  int8_prepare_b_from_transposed: 'int8PrepareBFromTransposedFallback',
  int8_prepare_b_from_quantized_transposed: 'int8PrepareBFromQuantizedTransposedFallback',
  int8_prepare_bias: 'int8PrepareBiasFallback',
  int8_multiply_and_add_bias: 'int8MultiplyAndAddBiasFallback',
  int8_select_columns_of_b: 'int8SelectColumnsOfBFallback',
}

let engine = null // { M, service }
const models = new Map() // "it-en" -> TranslationModel
let detector = null

function start() {
  if (engine) return engine
  return (engine = new Promise((resolve, reject) => {
    const Module = {
      instantiateWasm(info, accept) {
        const gemm = {}
        for (const [name, fallback] of Object.entries(GEMM)) gemm[name] = (...a) => Module.asm[fallback](...a)
        WebAssembly.instantiate(workerData.wasm, { ...info, wasm_gemm: gemm }).then(r => accept(r.instance), reject)
        return {}
      },
      onRuntimeInitialized() { resolve({ M: Module, service: new Module.BlockingService({ cacheSize: 0 }) }) },
      onAbort(what) { reject(new Error('engine stopped: ' + what)) },
      print() {},
      printErr() {},
    }
    globalThis.Module = Module
    vm.runInThisContext(workerData.glue, { filename: 'bergamot-translator-worker.js' })
  }))
}

function memory(M, path, align) {
  const bytes = readFileSync(path)
  const m = new M.AlignedMemory(bytes.byteLength, align)
  m.getByteArrayView().set(bytes)
  return m
}

const ops = {
  async load({ key, model, lex, vocabs, precision }) {
    const { M } = await start()
    if (models.has(key)) return true
    const list = new M.AlignedMemoryList()
    for (const v of vocabs) list.push_back(memory(M, v, 64))
    // Firefox's settings for these models (TranslationsEngine), alignment on
    // so HTML can find its way back into the translated sentence.
    const config = [
      'beam-size: 1', 'normalize: 1.0', 'word-penalty: 0', 'cpu-threads: 0', `gemm-precision: ${precision}`,
      'skip-cost: true', 'alignment: soft', 'quiet: true', 'quiet-translation: true', 'max-length-break: 128',
      'mini-batch-words: 1024', 'workspace: 128', 'max-length-factor: 2.0',
    ].join('\n') + '\n'
    models.set(key, new M.TranslationModel(config, memory(M, model, 256), memory(M, lex, 64), list, null))
    return true
  },
  free({ key }) {
    const m = models.get(key)
    if (m) { models.delete(key); m.delete() }
    return true
  },
  loaded() { return [...models.keys()] },
  /** keys: one model, or two to go through English. */
  async translate({ keys, texts, html }) {
    const { M, service } = await start()
    const chosen = keys.map(k => {
      const m = models.get(k)
      if (!m) throw new Error('no model ' + k)
      return m
    })
    const input = new M.VectorString()
    const options = new M.VectorResponseOptions()
    for (const t of texts) {
      input.push_back(t)
      options.push_back({ qualityScores: false, alignment: !!html, html: !!html })
    }
    const responses = chosen.length > 1
      ? service.translateViaPivoting(chosen[0], chosen[1], input, options)
      : service.translate(chosen[0], input, options)
    const out = texts.map((_, i) => responses.get(i).getTranslatedText())
    responses.delete(); input.delete(); options.delete()
    return out
  },
  /** Each text's language: [code, reliable, score]. */
  async detect({ texts }) {
    detector ??= import(workerData.detector).then(m => m.eld)
    const eld = await detector
    return texts.map(t => {
      const r = eld.detect(t)
      const scores = r.getScores()
      return [r.language || '', !!(r.language && r.isReliable()), scores[r.language] ?? 0]
    })
  },
}

parentPort.on('message', async ({ id, op, args }) => {
  try {
    parentPort.postMessage({ id, result: await ops[op](args || {}) })
  } catch (error) {
    parentPort.postMessage({ id, error: String((error && error.message) || error) })
  }
})
