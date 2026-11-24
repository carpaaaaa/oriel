// The settings module's places: its pages in a tab (oriel://settings,
// oriel://downloads), its panels over the page (the site's question, the
// downloads card), and the downloads button at the column's foot.
// Owned by the settings module.

import { registerOutlet, registerPage, registerPanel } from '../lib/registry'
import { SettingsPage } from './Settings'
import { DownloadsDoor, DownloadsFloat, DownloadsPage } from './Downloads'
import { PermissionQuestion } from './Permission'
import { UpdatePopup } from './UpdatePopup'
import { ShortcutsEditor } from './Shortcuts'
import './settings.css'

registerPage('settings', SettingsPage)
// Keyboard & Mouse › Shortcuts, under its group in Settings.tsx.
registerPage('settings.shortcuts', ShortcutsEditor)
registerPage('downloads', DownloadsPage)
registerPanel('settings.permission', PermissionQuestion)
registerPanel('settings.downloads', DownloadsFloat)
registerPanel('settings.update', UpdatePopup)
registerOutlet('sidebar.foot', DownloadsDoor)
