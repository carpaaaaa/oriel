// Brings the Chocolatey package to a release: its version, release notes link
// and the installers' SHA-256 from the release's SHA256SUMS.txt.
//
//   node packaging/chocolatey/update.mjs 0.1.12

import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const version = process.argv[2]
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) { console.error('Usage: node packaging/chocolatey/update.mjs <version>'); process.exit(1) }
const here = path.dirname(fileURLToPath(import.meta.url))

const sums = await (await fetch(`https://github.com/carpaaaaa/oriel/releases/download/v${version}/SHA256SUMS.txt`)).text()
const hash = name => {
  const m = new RegExp(`^([0-9a-f]{64})\\s+${name.replace(/\./g, '\\.')}$`, 'm').exec(sums)
  if (!m) { console.error(`${name} isn't in SHA256SUMS.txt of v${version}`); process.exit(1) }
  return m[1]
}

const edit = async (file, f) => { const p = path.join(here, file); await writeFile(p, f(await readFile(p, 'utf8'))) }
await edit('oriel.nuspec', s => s.replace(/<version>[^<]*<\/version>/, `<version>${version}</version>`).replace(/releases\/tag\/v[\d.]+/, `releases/tag/v${version}`))
await edit('tools/chocolateyinstall.ps1', s => s
  .replace(/\$version = '[^']*'/, `$version = '${version}'`)
  .replace(/(x64\.exe"; Checksum = ')[0-9a-f]{64}/, `$1${hash(`Oriel-Setup-${version}-x64.exe`)}`)
  .replace(/(arm64\.exe"; Checksum = ')[0-9a-f]{64}/, `$1${hash(`Oriel-Setup-${version}-arm64.exe`)}`))
console.log(`Chocolatey package at ${version}`)
