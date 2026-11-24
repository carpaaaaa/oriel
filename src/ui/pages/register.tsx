// Oriel's other pages that the settings module draws: oriel://passwords
// (over the data module's commands). Owned by the settings module.

import { registerPage } from '../lib/registry'
import { PasswordsPage } from './Passwords'
import './pages.css'

registerPage('passwords', PasswordsPage)
