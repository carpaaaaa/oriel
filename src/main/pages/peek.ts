// Peek at a link (studio/01 §10.19-§10.22; Peek.swift). Filled in below.

import type { WebContents } from 'electron'
import type { WindowRecord } from '../model/model'

export function peekOf(_wc: WebContents): boolean { return false }
export function openPeek(_win: WindowRecord, _from: string, _url: string): void {}
