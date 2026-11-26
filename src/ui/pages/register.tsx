// Oriel's other pages that the settings module draws: oriel://passwords
// (over the data module's commands) and oriel://release-notes (What's New).
// Owned by the settings module.

import { lazy } from 'solid-js'
import { registerPage } from '../lib/registry'
import './pages.css'

registerPage('passwords', lazy(() => import('./Passwords').then(m => ({ default: m.PasswordsPage }))))
registerPage('release-notes', lazy(() => import('./ReleaseNotes').then(m => ({ default: m.ReleaseNotesPage }))))
