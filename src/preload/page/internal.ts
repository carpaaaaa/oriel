// The bridge Oriel's own pages (oriel://...) get: only on those pages, never
// on a website (studio/02 §8.8). The main process checks again that every
// command comes from an Oriel page's main frame. Owned by the settings module.

import { contextBridge, ipcRenderer } from 'electron'

if (location.protocol === 'oriel:' && window === window.top) {
  contextBridge.exposeInMainWorld('oriel', {
    cmd: (command: unknown) => ipcRenderer.invoke('oriel:command', command),
    on: (listener: (update: { kind: string; value: unknown }) => void) => {
      const wrapped = (_e: unknown, update: { kind: string; value: unknown }) => listener(update)
      ipcRenderer.on('oriel:update', wrapped)
      return () => { ipcRenderer.off('oriel:update', wrapped) }
    },
    platform: process.platform,
  })
}

// Offer passkeys, off (Settings › Passwords; main/settings/passkeys.ts): a
// site asking for a passkey hears there is none, and that no authenticator
// is there to make one; passwords from navigator.credentials still pass.
if (/^https?:$/.test(location.protocol) && window === window.top) {
  let offered = true
  try { offered = ipcRenderer.sendSync('oriel:passkeys') !== false } catch {}
  if (!offered) {
    try {
      contextBridge.executeInMainWorld({
        func: () => {
          const no = () => Promise.reject(new DOMException('Passkeys are off in Settings.', 'NotAllowedError'))
          const c = navigator.credentials as CredentialsContainer | undefined
          if (c) {
            const get = c.get.bind(c), create = c.create.bind(c)
            Object.defineProperty(c, 'get', { value: (o?: CredentialRequestOptions) => (o && 'publicKey' in o ? no() : get(o)), configurable: true })
            Object.defineProperty(c, 'create', { value: (o?: CredentialCreationOptions) => (o && 'publicKey' in o ? no() : create(o)), configurable: true })
          }
          const P = (window as unknown as { PublicKeyCredential?: Record<string, unknown> }).PublicKeyCredential
          if (P) {
            Object.defineProperty(P, 'isUserVerifyingPlatformAuthenticatorAvailable', { value: () => Promise.resolve(false), configurable: true })
            Object.defineProperty(P, 'isConditionalMediationAvailable', { value: () => Promise.resolve(false), configurable: true })
          }
        },
      })
    } catch {}
  }
}

export {}
