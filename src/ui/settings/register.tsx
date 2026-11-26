// The settings module's places: its pages in a tab (oriel://settings,
// oriel://downloads), its panels over the page (the site's question, the
// downloads card), and the downloads button at the column's foot or at
// the end of the tab strip.
// Owned by the settings module.

import { lazy } from 'solid-js'
import { registerOutlet, registerPage, registerPanel } from '../lib/registry'
import { DownloadsDoor, DownloadsFloat, DownloadsPage } from './Downloads'
import { PermissionQuestion } from './Permission'
import { UpdatePopup } from './UpdatePopup'
import { DefaultOffer } from './DefaultOffer'
import { StarAsk } from './StarAsk'
import './settings.css'

// Pages load when a tab shows them: the window's own interface never draws one.
registerPage('settings', lazy(() => import('./Settings').then(m => ({ default: m.SettingsPage }))))
// Keyboard & Mouse › Shortcuts, under its group in Settings.tsx.
registerPage('settings.shortcuts', lazy(() => import('./Shortcuts').then(m => ({ default: m.ShortcutsEditor }))))
registerPage('downloads', DownloadsPage)
registerPanel('settings.permission', PermissionQuestion)
registerPanel('settings.downloads', DownloadsFloat)
registerPanel('settings.update', UpdatePopup)
registerPanel('settings.default', DefaultOffer)
registerPanel('settings.star', StarAsk)
registerOutlet('sidebar.foot', () => <DownloadsDoor where="foot" />)
registerOutlet('strip.end', () => <DownloadsDoor where="strip" />)
