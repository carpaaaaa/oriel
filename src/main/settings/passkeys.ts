// Offer passkeys (Settings › Passwords, studio/06 §1.7 #112; Passkeys.swift):
// on, a site's passkey request goes to Windows Hello as Chromium sends it;
// off, pages are told there is no passkey to offer, as Search's WKWebView
// is when the setting is off. Read by each page as it starts
// (preload/page/internal.ts), so it holds for pages opened after the change.

import { ipcMain } from 'electron'
import { model } from '../model/model'


ipcMain.on('oriel:passkeys', event => {
  try { event.returnValue = model.pref<boolean>('passkeys') !== false } catch { event.returnValue = true }
})
