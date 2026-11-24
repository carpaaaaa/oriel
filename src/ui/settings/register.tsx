// The settings module's places: its pages in a tab (oriel://settings,
// oriel://downloads), its panels over the page (the site's question, the
// downloads card), and the downloads button at the column's foot.
// Owned by the settings module.

import { registerOutlet, registerPage, registerPanel } from '../lib/registry'
import { SettingsPage } from './Settings'
import { DownloadsDoor, DownloadsFloat, DownloadsPage } from './Downloads'
import { PermissionQuestion } from './Permission'
import { UpdatePopup } from './UpdatePopup'
import { DefaultOffer } from './DefaultOffer'
import './settings.css'

registerPage('settings', SettingsPage)
registerPage('downloads', DownloadsPage)
registerPanel('settings.permission', PermissionQuestion)
registerPanel('settings.downloads', DownloadsFloat)
registerPanel('settings.update', UpdatePopup)
registerPanel('settings.default', DefaultOffer)
registerOutlet('sidebar.foot', DownloadsDoor)
