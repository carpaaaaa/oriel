// Windows Hello, then the Windows password, before a saved password is
// filled, shown or copied (Vault.prove, studio/05 §2.5 and §2.11). In the
// process, through koffi, with no native module to build:
//
//  1. UserConsentVerifier.CheckAvailabilityAsync (WinRT statics);
//  2. when available, IUserConsentVerifierInterop::
//     RequestVerificationForWindowAsync with Oriel's window, so the Hello
//     dialog is owned by it and stays in front (Windows 11; on Windows 10
//     the statics' RequestVerificationAsync);
//  3. when Hello can't ask (no device, not set up, turned off by policy):
//     the Windows password, in the system's own credential dialog owned by
//     Oriel's window (CredUIPromptForWindowsCredentials), checked with
//     LogonUser, as Chrome does on Windows.
//
// The asynchronous operations are polled from here, never waited on, and the
// credential dialog runs on a worker thread: the app keeps answering while
// either is up. Interface ids are the Windows SDK's (UserConsentVerifierInterop.h,
// windows.security.credentials.ui.h).

import type { BaseWindow } from 'electron'

/** What happened, step by step, for the tests and the log. */
export interface HelloTrace {
  steps: string[]
  availability?: number
  result?: number
  password?: number
  verdict: 'verified' | 'refused' | 'unavailable' | 'error' | 'timeout'
}

const IID = {
  IUnknown: '00000000-0000-0000-C000-000000000046',
  IAsyncInfo: '00000036-0000-0000-C000-000000000046',
  statics: 'AF4F3F91-564C-4DDC-B8B5-973447627C65',
  interop: '39E050C3-4E74-441A-8DC0-B81104DF949C',
  asyncResult: 'FD596FFD-2318-558F-9DBE-D21DF43764A5',
}

/** UserConsentVerifierAvailability */
const Available = 0
/** UserConsentVerificationResult */
const Verified = 0, DeviceNotPresent = 1, NotConfiguredForUser = 2, DisabledByPolicy = 3
const cannotAsk = new Set([DeviceNotPresent, NotConfiguredForUser, DisabledByPolicy])

/** A GUID as Windows lays it out in memory. */
function guid(text: string): Buffer {
  const hex = text.replace(/[{}-]/g, '')
  const b = Buffer.alloc(16)
  b.writeUInt32LE(parseInt(hex.slice(0, 8), 16), 0)
  b.writeUInt16LE(parseInt(hex.slice(8, 12), 16), 4)
  b.writeUInt16LE(parseInt(hex.slice(12, 16), 16), 6)
  Buffer.from(hex.slice(16), 'hex').copy(b, 8)
  return b
}

const failed = (hr: number) => hr < 0
const hex = (hr: number) => '0x' + (hr >>> 0).toString(16).padStart(8, '0')
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

let api: ReturnType<typeof load> | null = null

function load() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const koffi = require('koffi')
  // A worker thread runs the credential dialog on koffi's own stack: give it
  // a real one (128 KiB by default), before the first call.
  try { koffi.config({ ...koffi.config(), async_stack_size: 4 * 1024 * 1024 }) } catch {}
  const combase = koffi.load('combase.dll')
  const credui = koffi.load('credui.dll')
  const advapi = koffi.load('advapi32.dll')
  const kernel = koffi.load('kernel32.dll')
  const ole = koffi.load('ole32.dll')
  const user32 = koffi.load('user32.dll')
  const out = (t: string) => koffi.out(koffi.pointer(t))
  const io = (t: string) => koffi.inout(koffi.pointer(t))

  const RoInitialize = combase.func('__stdcall', 'RoInitialize', 'int32', ['int32'])
  const WindowsCreateString = combase.func('__stdcall', 'WindowsCreateString', 'int32', ['str16', 'uint32', out('void *')])
  const WindowsDeleteString = combase.func('__stdcall', 'WindowsDeleteString', 'int32', ['void *'])
  const RoGetActivationFactory = combase.func('__stdcall', 'RoGetActivationFactory', 'int32', ['void *', 'void *', out('void *')])

  const proto = (name: string, result: string, args: unknown[]) => koffi.proto('__stdcall', name, result, args)
  const P = {
    release: proto('SearchRelease', 'uint32', ['void *']),
    query: proto('SearchQueryInterface', 'int32', ['void *', 'void *', out('void *')]),
    checkAvailability: proto('SearchCheckAvailabilityAsync', 'int32', ['void *', out('void *')]),
    requestStatics: proto('SearchRequestVerificationAsync', 'int32', ['void *', 'void *', out('void *')]),
    requestForWindow: proto('SearchRequestVerificationForWindowAsync', 'int32', ['void *', 'void *', 'void *', 'void *', out('void *')]),
    getInt: proto('SearchGetInt32', 'int32', ['void *', out('int32')]),
    cancel: proto('SearchCancel', 'int32', ['void *']),
  }

  const CREDUI_INFOW = koffi.struct('SEARCH_CREDUI_INFOW', {
    cbSize: 'uint32', hwndParent: 'void *', pszMessageText: 'str16', pszCaptionText: 'str16', hbmBanner: 'void *',
  })
  const CredUIPromptForWindowsCredentialsW = credui.func('__stdcall', 'CredUIPromptForWindowsCredentialsW', 'uint32', [
    koffi.pointer(CREDUI_INFOW), 'uint32', io('uint32'), 'void *', 'uint32', out('void *'), out('uint32'), 'void *', 'uint32'])
  const CredUnPackAuthenticationBufferW = credui.func('__stdcall', 'CredUnPackAuthenticationBufferW', 'bool', [
    'uint32', 'void *', 'uint32', 'void *', io('uint32'), 'void *', io('uint32'), 'void *', io('uint32')])
  const CredUIParseUserNameW = credui.func('__stdcall', 'CredUIParseUserNameW', 'uint32', ['void *', 'void *', 'uint32', 'void *', 'uint32'])
  const LogonUserW = advapi.func('__stdcall', 'LogonUserW', 'bool', ['void *', 'void *', 'void *', 'uint32', 'uint32', out('void *')])
  const CloseHandle = kernel.func('__stdcall', 'CloseHandle', 'bool', ['void *'])
  // Exported by kernel32 on every Windows we know; without it the buffer is freed unzeroed.
  let RtlZeroMemory: ((p: unknown, n: number) => void) | null = null
  try { RtlZeroMemory = kernel.func('__stdcall', 'RtlZeroMemory', 'void', ['void *', 'uintptr_t']) } catch {}
  const CoTaskMemFree = ole.func('__stdcall', 'CoTaskMemFree', 'void', ['void *'])
  const GetLastError = kernel.func('__stdcall', 'GetLastError', 'uint32', [])

  const EnumWindowsProc = koffi.proto('__stdcall', 'SearchEnumWindowsProc', 'bool', ['void *', 'intptr_t'])
  const EnumWindows = user32.func('__stdcall', 'EnumWindows', 'bool', [koffi.pointer(EnumWindowsProc), 'intptr_t'])
  const GetWindow = user32.func('__stdcall', 'GetWindow', 'void *', ['void *', 'uint32'])
  const IsWindowVisible = user32.func('__stdcall', 'IsWindowVisible', 'bool', ['void *'])
  const PostMessageW = user32.func('__stdcall', 'PostMessageW', 'bool', ['void *', 'uint32', 'uintptr_t', 'intptr_t'])
  const GetWindowThreadProcessId = user32.func('__stdcall', 'GetWindowThreadProcessId', 'uint32', ['void *', out('uint32')])
  const GetClassNameW = user32.func('__stdcall', 'GetClassNameW', 'int', ['void *', 'void *', 'int'])

  /** One method of a COM interface, by its place in the vtable. */
  const method = (obj: unknown, index: number, p: unknown) => {
    const vtable = koffi.decode(obj, 'void *')
    return koffi.decode(koffi.decode(vtable, index * koffi.sizeof('void *'), 'void *'), p)
  }
  const release = (obj: unknown) => { if (obj) method(obj, 2, P.release)(obj) }
  const address = (p: unknown) => (p ? koffi.address(p) : 0n)

  return {
    koffi, RoInitialize, WindowsCreateString, WindowsDeleteString, RoGetActivationFactory, P, method, release, address,
    CREDUI_INFOW, CredUIPromptForWindowsCredentialsW, CredUnPackAuthenticationBufferW, CredUIParseUserNameW,
    LogonUserW, CloseHandle, RtlZeroMemory, CoTaskMemFree, GetLastError,
    EnumWindowsProc, EnumWindows, GetWindow, IsWindowVisible, PostMessageW, GetWindowThreadProcessId, GetClassNameW,
  }
}

function hstring(a: NonNullable<typeof api>, text: string): unknown {
  const h = [null]
  const hr = a.WindowsCreateString(text, text.length, h)
  if (failed(hr)) throw new Error(`WindowsCreateString ${hex(hr)}`)
  return h[0]
}

/** An IAsyncOperation<int-like> polled until it ends: its result, or null
 * for an error, a cancel or the time running out. */
async function finish(a: NonNullable<typeof api>, op: unknown, within: number, trace: HelloTrace, what: string): Promise<number | null> {
  const info = [null]
  let hr = a.method(op, 0, a.P.query)(op, guid(IID.IAsyncInfo), info)
  if (failed(hr)) { trace.steps.push(`${what}: no IAsyncInfo ${hex(hr)}`); return null }
  try {
    const end = Date.now() + within
    for (;;) {
      const status = [0]
      hr = a.method(info[0], 7, a.P.getInt)(info[0], status)
      if (failed(hr)) { trace.steps.push(`${what}: status ${hex(hr)}`); return null }
      if (status[0] === 1) break // Completed
      if (status[0] === 2 || status[0] === 3) { trace.steps.push(`${what}: ${status[0] === 2 ? 'canceled' : 'error'}`); return null }
      if (Date.now() > end) {
        a.method(info[0], 9, a.P.cancel)(info[0])
        trace.steps.push(`${what}: timed out`)
        trace.verdict = 'timeout'
        return null
      }
      await sleep(40)
    }
    const value = [0]
    hr = a.method(op, 8, a.P.getInt)(op, value)
    if (failed(hr)) { trace.steps.push(`${what}: results ${hex(hr)}`); return null }
    return value[0]
  } finally { a.release(info[0]) }
}

/** Windows Hello, owned by `win`. null: it can't ask here (go to the
 * password); true or false: what the person said. */
async function hello(a: NonNullable<typeof api>, reason: string, hwnd: unknown, within: number, trace: HelloTrace): Promise<boolean | null> {
  a.RoInitialize(0) // the UI thread is already in an apartment: S_FALSE or RPC_E_CHANGED_MODE
  const cls = hstring(a, 'Windows.Security.Credentials.UI.UserConsentVerifier')
  const message = hstring(a, reason)
  const held: unknown[] = []
  try {
    const statics = [null]
    let hr = a.RoGetActivationFactory(cls, guid(IID.statics), statics)
    trace.steps.push(`factory ${hex(hr)}`)
    if (failed(hr)) return null
    held.push(statics[0])
    const check = [null]
    hr = a.method(statics[0], 6, a.P.checkAvailability)(statics[0], check)
    if (failed(hr)) { trace.steps.push(`availability call ${hex(hr)}`); return null }
    held.push(check[0])
    const availability = await finish(a, check[0], 15_000, trace, 'availability')
    trace.availability = availability ?? undefined
    trace.steps.push(`availability ${availability}`)
    if (availability !== Available) return null
    // Owned by the window, so it stays in front of it (Windows 11).
    const interop = [null]
    let op: unknown = null
    hr = a.RoGetActivationFactory(cls, guid(IID.interop), interop)
    if (!failed(hr)) {
      held.push(interop[0])
      const started = [null]
      hr = a.method(interop[0], 6, a.P.requestForWindow)(interop[0], hwnd, message, guid(IID.asyncResult), started)
      trace.steps.push(`request for window ${hex(hr)}`)
      if (!failed(hr)) op = started[0]
    }
    if (!op) {
      const started = [null]
      hr = a.method(statics[0], 7, a.P.requestStatics)(statics[0], message, started)
      trace.steps.push(`request ${hex(hr)}`)
      if (failed(hr)) return null
      op = started[0]
    }
    held.push(op)
    const result = await finish(a, op, within, trace, 'verification')
    trace.result = result ?? undefined
    trace.steps.push(`result ${result}`)
    if (result === Verified) return true
    if (result != null && cannotAsk.has(result)) return null
    return false
  } finally {
    for (const o of held.reverse()) a.release(o)
    a.WindowsDeleteString(message)
    a.WindowsDeleteString(cls)
  }
}

const promise = <T>(f: { async: (...args: unknown[]) => void }, ...args: unknown[]) =>
  new Promise<T>((done, fail) => f.async(...args, (err: unknown, res: T) => (err ? fail(err) : done(res))))

/** The Windows password, in the system's credential dialog owned by the
 * window, run on a worker thread; checked with LogonUser; three tries. */
async function windowsPassword(a: NonNullable<typeof api>, reason: string, hwnd: unknown, caption: string, within: number, trace: HelloTrace): Promise<boolean> {
  const CREDUIWIN_ENUMERATE_CURRENT_USER = 0x200, ERROR_CANCELLED = 1223, ERROR_LOGON_FAILURE = 1326
  let authError = 0
  for (let attempt = 0; attempt < 3; attempt++) {
    const info = { cbSize: a.koffi.sizeof(a.CREDUI_INFOW), hwndParent: hwnd, pszMessageText: reason, pszCaptionText: caption, hbmBanner: null }
    const pkg = [0], buffer = [null], size = [0]
    trace.steps.push('password dialog asked')
    const asked = promise<number>(a.CredUIPromptForWindowsCredentialsW, info, authError, pkg, null, 0, buffer, size, null, CREDUIWIN_ENUMERATE_CURRENT_USER)
    // Not left up for ever: past the time, closed wherever it is, as a Cancel.
    let timer: ReturnType<typeof setTimeout> | undefined
    const late = new Promise<'late'>(done => { timer = setTimeout(() => done('late'), within) })
    let code = await Promise.race([asked, late])
    if (code === 'late') {
      const shut = closeDialogs(hwnd ? [a.address(hwnd)] : [])
      trace.steps.push(`password dialog timed out, closed ${JSON.stringify(shut.closed)} of ${JSON.stringify(shut.seen)}`)
      trace.verdict = 'timeout'
      code = await Promise.race([asked, new Promise<'late'>(done => setTimeout(() => done('late'), 5000))])
      if (code === 'late') { trace.steps.push('password dialog never came back'); return false }
    } else clearTimeout(timer)
    trace.password = code
    trace.steps.push(`password dialog ${code}`)
    if (code === ERROR_CANCELLED) return false
    if (code !== 0 || !buffer[0]) return false
    const user = Buffer.alloc(1026), domain = Buffer.alloc(1026), password = Buffer.alloc(1026)
    const parsedUser = Buffer.alloc(1026), parsedDomain = Buffer.alloc(1026)
    try {
      const ok = a.CredUnPackAuthenticationBufferW(0, buffer[0], size[0], user, [513], domain, [513], password, [513])
      if (!ok) { trace.steps.push(`unpack ${a.GetLastError()}`); return false }
      let u: Buffer = user, d: Buffer = domain
      if (a.CredUIParseUserNameW(user, parsedUser, 513, parsedDomain, 513) === 0) { u = parsedUser; d = parsedDomain }
      const token = [null]
      const valid = await promise<boolean>(a.LogonUserW, u, d, password, 2 /* interactive */, 0, token)
      if (valid) { a.CloseHandle(token[0]); trace.steps.push('password verified'); return true }
      trace.steps.push(`logon refused ${a.GetLastError()}`)
      authError = ERROR_LOGON_FAILURE
    } finally {
      password.fill(0)
      try { a.RtlZeroMemory?.(buffer[0], size[0]) } catch {}
      a.CoTaskMemFree(buffer[0])
    }
  }
  return false
}

/** The proof under way or last made, step by step as it goes. */
export let current: HelloTrace | null = null

/** Proof by Windows Hello, else the Windows password, over `win`. */
export async function windowsProof(reason: string, win: BaseWindow | null, caption: string, options: { within?: number } = {}): Promise<HelloTrace> {
  const trace: HelloTrace = { steps: [], verdict: 'error' }
  current = trace
  try {
    const a = (api ??= load())
    const hwnd = win ? a.koffi.decode(win.getNativeWindowHandle(), 'void *') : null
    const said = await hello(a, reason, hwnd, options.within ?? 120_000, trace)
    if (said === true) { trace.verdict = 'verified'; return trace }
    if (said === false) { if (trace.verdict !== 'timeout') trace.verdict = 'refused'; return trace }
    trace.steps.push('to the password')
    const timedOut = () => trace.verdict === 'timeout'
    const ok = await windowsPassword(a, reason, hwnd, caption, options.within ?? 180_000, trace)
    trace.verdict = ok ? 'verified' : timedOut() ? 'timeout' : trace.password === 1223 ? 'refused' : trace.password ? 'unavailable' : 'refused'
  } catch (e) {
    trace.steps.push(`error ${String((e as Error)?.message ?? e)}`)
    trace.verdict = 'error'
  }
  return trace
}

/** The system's credential dialog, in this process or the broker's. */
const credentialClass = /^Credential Dialog Xaml Host$/

/** Closes the credential dialog: windows owned by one of Oriel's windows,
 * other windows of this process that aren't Oriel's own, and the system's
 * credential dialog wherever it runs. What was closed and what was seen
 * (class@pid), for the trace. */
function closeDialogs(owners: bigint[], ours: bigint[] = owners, sameProcess = false): { closed: string[]; seen: string[] } {
  const a = (api ??= load())
  const mine = new Set(ours), owning = new Set(owners)
  const found: unknown[] = [], closed: string[] = [], seen: string[] = []
  const each = a.koffi.register((hwnd: unknown) => {
    if (!a.IsWindowVisible(hwnd)) return true
    const pid = [0]
    a.GetWindowThreadProcessId(hwnd, pid)
    const name = Buffer.alloc(512)
    const cls = name.subarray(0, a.GetClassNameW(hwnd, name, 256) * 2).toString('utf16le')
    const owned = owning.has(a.address(a.GetWindow(hwnd, 4 /* GW_OWNER */)))
    const here = pid[0] === process.pid
    if (here || owned || credentialClass.test(cls) || /Credential|Consent/i.test(cls)) seen.push(`${cls}@${pid[0]}${owned ? ' owned' : ''}`)
    if (mine.has(a.address(hwnd))) return true
    // Another app's credential dialog is never touched, outside a test world.
    const credential = credentialClass.test(cls) && (here || owned || sameProcess)
    if (owned || credential || (sameProcess && here)) { found.push(hwnd); closed.push(cls) }
    return true
  }, a.koffi.pointer(a.EnumWindowsProc))
  try { a.EnumWindows(each, 0) } finally { a.koffi.unregister(each) }
  for (const hwnd of found) a.PostMessageW(hwnd, 0x0010 /* WM_CLOSE */, 0, 0)
  return { closed, seen }
}

/** A test world's stand-in for a person pressing Cancel. */
export function closeOwnedDialogs(ours: BaseWindow[]): { closed: string[]; seen: string[] } {
  const a = (api ??= load())
  const hwnds = ours.map(w => a.address(a.koffi.decode(w.getNativeWindowHandle(), 'void *')))
  return closeDialogs(hwnds, hwnds, true)
}

/** Whether the factories answer, the one that owns the dialog by window
 * included, for a test on a machine with no Hello to ask: HRESULTs. */
export function factories(): { statics: string; interop: string } {
  const a = (api ??= load())
  a.RoInitialize(0)
  const cls = hstring(a, 'Windows.Security.Credentials.UI.UserConsentVerifier')
  try {
    const out = { statics: '', interop: '' }
    for (const which of ['statics', 'interop'] as const) {
      const f = [null]
      const hr = a.RoGetActivationFactory(cls, guid(IID[which]), f)
      out[which] = hex(hr)
      if (!failed(hr)) a.release(f[0])
    }
    return out
  } finally { a.WindowsDeleteString(cls) }
}
