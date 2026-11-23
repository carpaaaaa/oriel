// Windows' DPAPI, as the user, to open the key a Chromium browser keeps in
// its Local State (os_crypt.encrypted_key, "DPAPI" + blob): CryptUnprotectData
// through koffi, no prompt, no elevation (studio/05 §1.13, studio/07 §2.2).
// Called only on Windows, only after the person said yes in the panel.
//
// This opens the classic v10 key and nothing else. App-Bound Encryption
// (os_crypt.app_bound_encrypted_key, v20 values) is never touched: the only
// ways into it are the browser's elevation service, injecting into the
// browser or impersonating it, which is what password stealers do.
//
// A test world on a Mac or Linux has no DPAPI: its made-up profiles carry a
// key marked as a test's, opened only there.

import { probe } from '../paths'

const testMark = Buffer.from('SEARCHTESTDPAPI:')

let api: { unprotect(blob: Buffer): Buffer | null } | null = null

function windowsAPI() {
  // Loaded only here, on Windows.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi')
  const crypt32 = koffi.load('crypt32.dll')
  const kernel32 = koffi.load('kernel32.dll')
  const DATA_BLOB = koffi.struct('SEARCH_DATA_BLOB', { cbData: 'uint32_t', pbData: 'void *' })
  const CryptUnprotectData = crypt32.func('__stdcall', 'CryptUnprotectData', 'bool',
    [koffi.pointer(DATA_BLOB), 'void *', 'void *', 'void *', 'void *', 'uint32_t', koffi.out(koffi.pointer(DATA_BLOB))])
  const LocalFree = kernel32.func('__stdcall', 'LocalFree', 'void *', ['void *'])
  const CRYPTPROTECT_UI_FORBIDDEN = 0x1
  return {
    unprotect(blob: Buffer): Buffer | null {
      const out = { cbData: 0, pbData: null as unknown }
      const ok = CryptUnprotectData({ cbData: blob.length, pbData: blob }, null, null, null, null, CRYPTPROTECT_UI_FORBIDDEN, out)
      if (!ok || !out.pbData) return null
      try {
        const bytes = koffi.decode(out.pbData, 'uint8_t', out.cbData) as number[]
        return Buffer.from(bytes)
      } finally {
        LocalFree(out.pbData)
      }
    },
  }
}

/** How many times a key was asked of Windows, for the tests: counting what
 * a browser holds never does (Import.swift keyAsks, 05 §1.1 point 1). */
export let keyAsks = 0

export function unprotect(blob: Buffer): Buffer | null {
  keyAsks++
  if (process.platform === 'win32') {
    try { return (api ??= windowsAPI()).unprotect(blob) } catch { return null }
  }
  if (probe && blob.subarray(0, testMark.length).equals(testMark)) return Buffer.from(blob.subarray(testMark.length))
  return null
}

/** DPAPI is there to ask: Windows, or a test world's stand-in. */
export const available = () => process.platform === 'win32' || !!probe
