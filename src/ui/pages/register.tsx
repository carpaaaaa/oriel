// Oriel's other pages that the settings module draws: oriel://passwords
// (over the data module's commands) and oriel://release-notes (What's New).
// Owned by the settings module.

import { registerPage } from '../lib/registry'
import { PasswordsPage } from './Passwords'
import { ReleaseNotesPage } from './ReleaseNotes'
import './pages.css'

registerPage('passwords', PasswordsPage)
registerPage('release-notes', ReleaseNotesPage)
