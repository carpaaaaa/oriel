// SHA-256 of each installer in a folder, one per line as "<hash>  <name>"
// (the format sha256sum writes and winget, Scoop and Chocolatey read), for
// SHA256SUMS.txt on every release.
//
//   node scripts/checksums.mjs dist > dist/SHA256SUMS.txt

import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'

const folder = process.argv[2] ?? 'dist'
const names = (await readdir(folder)).filter(n => /^Oriel-(Setup|Portable)-.*\.exe$/.test(n)).sort()
if (!names.length) { console.error(`No Oriel installers in ${folder}`); process.exit(1) }
for (const name of names) {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(path.join(folder, name))) hash.update(chunk)
  console.log(`${hash.digest('hex')}  ${name}`)
}
