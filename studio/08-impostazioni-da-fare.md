# Impostazioni da far funzionare

Elenco generato il 24 novembre 2026: chiavi delle Impostazioni (`src/ui/settings/index.json`) che nessuna parte dell'app legge fuori dalle Impostazioni, quindi oggi cambiano solo il controllo. 107 su 161. Ogni voce va fatta funzionare come su Search per Mac (comportamento nello studio 01-06 e nel sorgente Mac, chiave in `Prefs.swift`), con una prova che cambia la voce e controlla l'effetto, oppure tolta se ha senso solo sul Mac (iCloud, Handoff, Apple Passwords...), scrivendolo qui.

## A. Finestra, colonna e aspetto (window, column)

| Gruppo | Chiave | Voce | Stato |
|---|---|---|---|
| themes | `home.theme` | Home background | da fare |
| themes | `home.theme.image` | Home background | da fare |
| themes | `home.tuning` | Home background | da fare |
| themes | `home.shuffle` | Home background | da fare |
| theme | `pages.dusk` | Darken pages that stay light | da fare |
| theme | `inspector.chrome` | Chrome's colors in the Web Inspector | da fare |
| theme | `inspector.dark` | Keep the Web Inspector dark | da fare |
| window | `sidebar.position` | Tabs | da fare |
| window | `sidebar.hides` | Hide the column until the pointer reaches the edge | da fare |
| window | `sidebar.slides` | Slide the column in and out | da fare |
| window | `sidebar.foldIcons` | ⌘S makes the column icons only | da fare |
| window | `fold.loadingLine` | A loading line with the tabs hidden | da fare |
| window | `toolbar.left` | Back, forward and reload on the left | da fare |
| window | `tabs.compact` | Shorter tab bar | da fare |
| window | `window.glass` | Glass | da fare |
| window | `window.glass.style` | Glass style | da fare |
| window | `window.glass.clear` | Transparency | da fare |
| window | `window.glass.grain` | Grain | da fare |
| tablook | `tabs.liquid` | Liquid Glass tab | da fare |
| tablook | `sidebar.doorsUp` | Buttons at the top | da fare |
| tablook | `helm.back.hidden` | Back, forward and reload | da fare |
| tablook | `helm.forward.hidden` | Back, forward and reload | da fare |
| tablook | `helm.reload.hidden` | Back, forward and reload | da fare |
| tablook | `foot.extensions.hidden` | Buttons under the column | da fare |
| tablook | `foot.bookmarks.hidden` | Buttons under the column | da fare |
| tablook | `foot.profile.hidden` | Buttons under the column | da fare |
| tablook | `sidebar.player` | What's playing in other tabs | da fare |
| tablook | `tabs.pinCounts` | Show counts on pins | da fare |
| tablook | `tabs.give` | Tabs give when pressed | da fare |
| tablook | `bookmarks.side` | Show the bookmarks bar in the sidebar | da fare |
| tablook | `bookmarks.iconsOnly` | Show icons only on the bookmarks bar | da fare |
| motion | `motion.light` | Save power in Low Power Mode | da fare |
| motion | `motion.instant` | Reduce animations | da fare |
| tabbar | `tabs.shortcuts` | Show tab numbers while ⌘ is held | da fare |
| tabbar | `tabs.clickAddressOnly` | Clicking the tab you're on edits its address only | da fare |
| window | `splitView` | Split View | da fare |

## B. Schede, spazi, pin, link e app (tabs model)

| Gruppo | Chiave | Voce | Stato |
|---|---|---|---|
| browser | `mail.webmail` | Email links open in | da fare |
| browser | `sync.folder` | Sync with your other Macs | da fare |
| browser | `handoff` | Handoff to your iPhone and iPad | da fare |
| browser | `icloud.sync` | Sync with iCloud | da fare |
| browser | `quit.confirm` | Confirm before quitting | da fare |
| newtabs | `tabs.swipeBackCloses` | Swipe back closes a tab a link opened | da fare |
| newtabs | `home.grid` | Show the Home bookmarks on a new tab | da fare |
| newtabs | `tabs.undoReopens` | ⌘Z reopens a closed tab | da fare |
| newtabs | `tabs.popupWindows` | Open sized pop-ups in small windows | da fare |
| memory | `tabs.close.after` | Close tabs you leave alone | da fare |
| tabwindows | `tabs.mirror` | Same tabs in every window | da fare |
| links | `links.little` | Open links from other apps in a small window | da fare |
| links | `links.little.tabs` | Go to a tab that has the page | da fare |
| spaces | `profiles.oneWindow` | Profiles in one window | da fare |
| spaces | `spaces.links` | Send links to a space | da fare |
| spaces | `spaces.links.rules` | Send links to a space | da fare |
| spaces | `links.ask` | Ask which space for links from other apps | da fare |
| spaces | `links.ask.last` | Ask which space for links from other apps | da fare |
| pins | `pins.commandNewTab` | ⌘-click on a pin opens a new tab | da fare |
| anywhere | `launcher.on` | Open the address field from any app | da fare |
| anywhere | `launcher.key` | Open the address field from any app | da fare |
| anywhere | `launcher.little` | Open in a small window | da fare |
| newtabs | `tabs.groups` | Tab groups | da fare |
| links | `panel.sites` | Websites in the side panel | da fare |
| memory | `tabs.keepAwake` | Keep selected sites awake | da fare |
| spaces | `spaces.gradient` | A space's colour or gradient | da fare |
| pins | `pins.shared` | Pins in every space | da fare |
| pins | `pins.numberBack` | A pin's number again goes back | da fare |
| links | `links.show` | Show where links go | da fare |

## C. Pagine, video, lettura, blocco, mouse (pages, net, media)

| Gruppo | Chiave | Voce | Stato |
|---|---|---|---|
| reading | `reader.twins` | Read the site's own Markdown | da fare |
| reading | `reader.follows` | Reading mode follows light and dark | da fare |
| video | `float.style` | The floating video | da fare |
| video | `float.leave` | Float the video on its own | da fare |
| video | `float.away` | Float the video on its own | da fare |
| video | `float.minimize` | Minimize the floating video | da fare |
| video | `media.click` | Videos wait for a click | da fare |
| video | `fullscreen.escapeTwice` | Press Esc twice to leave full screen | da fare |
| video | `fullscreen.keepsWindow` | Keep the window in use during full screen | da fare |
| pages | `translate.target` | Translation language | da fare |
| pages | `pages.capture` | Capture pages | da fare |
| pages | `sites.styles` | Your own style for a site | da fare |
| pages | `pages.120.mode` | Pages at 120 Hz | da fare |
| pages | `pages.120` | Pages at 120 Hz | da fare |
| blocking | `shield` | Block ads and trackers | da fare |
| blocking | `sites.keep` | Prevent cross-site tracking | da fare |
| blocking | `privacy.clickIDs` | Remove click trackers from links | da fare |
| blocking | `privacy.gpc` | Tell sites not to sell or share your data | da fare |
| blocking | `privacy.httpsFirst` | Try HTTPS first | da fare |
| mouse | `links.peek` | Peek at a link | da fare |
| mouse | `links.peekClick` | Peek at a link | da fare |
| mouse | `links.peek.stays` | Peek stays with its tab | da fare |
| mouse | `links.optionSplit` | ⌥-click a link opens it in Split View | da fare |
| mouse | `autoscroll` | Scroll with the middle button | da fare |
| mouse | `wheel.smooth` | Smooth scrolling with a mouse wheel | da fare |
| mouse | `pages.bounce` | Bounce at the top and bottom | da fare |
| mouse | `swipe.history` | Hold a swipe to pick from history | da fare |
| developer | `agents` | Let coding agents use Search | da fare |
| pages | `autocorrect` | Correct spelling as you type | da fare |
| pages | `inlinePredictions` | Show inline predictions | da fare |
| pages | `translate.pages` | Translate pages on this Mac | da fare |
| mouse | `switcher.keys` | Keys in the tab switcher | da fare |
| video | `float.flicks` | Flick the floating video to a corner | da fare |

## D. Altro (password, moduli, estensioni, ricerca, aggiornamenti, novità)

| Gruppo | Chiave | Voce | Stato |
|---|---|---|---|
| passwords | `passkeys` | Offer passkeys | da fare |
| apple | `passwords.apple` | Passwords from Apple's Passwords app | da fare |
| forms | `contacts.fill` | Fill in your contact details | da fare |
| updates | `update.install` | Install updates on its own | da fare |
| news | `optin.joined` | News by email | da fare |
| news | `optin.iphoneBeta` | Search for iPhone beta | da fare |
| extensions | `extensions.sites` | Where an extension runs | da fare |
| extensions | `extensions.safariApps` | From Safari apps | da fare |
| search | `search.sites` | Search a site from the address field | da fare |
