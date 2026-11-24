# Impostazioni da far funzionare

Elenco generato il 24 novembre 2026: chiavi delle Impostazioni (`src/ui/settings/index.json`) che nessuna parte dell'app legge fuori dalle Impostazioni, quindi oggi cambiano solo il controllo. 107 su 161. Ogni voce va fatta funzionare come su Search per Mac (comportamento nello studio 01-06 e nel sorgente Mac, chiave in `Prefs.swift`), con una prova che cambia la voce e controlla l'effetto, oppure tolta se ha senso solo sul Mac (iCloud, Handoff, Apple Passwords...), scrivendolo qui.

## A. Finestra, colonna e aspetto (window, column)

| Gruppo | Chiave | Voce | Stato |
|---|---|---|---|
| themes | `home.theme` | Home background | da fare |
| themes | `home.theme.image` | Home background | da fare |
| themes | `home.tuning` | Home background | da fare |
| themes | `home.shuffle` | Home background | da fare |
| theme | `pages.dusk` | Darken pages that stay light | fatto: con Oriel scuro le pagine chiare sono rovesciate con un filtro e le immagini raddrizzate, misurando il fondo (window/dusk.ts); prova settings_a_motion.py |
| theme | `inspector.chrome` | Chrome's colors in the Web Inspector | tolta: i DevTools sono già quelli di Chrome (catalog.ts) |
| theme | `inspector.dark` | Keep the Web Inspector dark | da fare: Oriel non apre ancora i DevTools (nessun comando Web Inspector); il tema scuro si imposta quando ci saranno |
| window | `sidebar.position` | Tabs | fatto: colonna a destra, scheda della pagina a sinistra, stanza laterale dal lato opposto; prova settings_a_column.py |
| window | `sidebar.hides` | Hide the column until the pointer reaches the edge | fatto: la colonna riposa piegata, esce a 10 dal bordo dopo 0,05 s, Ctrl+S la tiene fuori; prova settings_a_column.py |
| window | `sidebar.slides` | Slide the column in and out | fatto: fuori con ease-out 0,26, dentro con ease-in 0,22 (senza: molle 0,14/0,86 e 0,13/1,0, ora anche al rientro); prova settings_a_column.py |
| window | `sidebar.foldIcons` | ⌘S makes the column icons only | fatto: Ctrl+S passa a solo icone e torna ai titoli, mai piegata; prova settings_a_column.py |
| window | `fold.loadingLine` | A loading line with the tabs hidden | fatto: piegata, una linea di 2 lungo la cima della pagina mentre carica, lontana dagli angoli; prova settings_a_column.py |
| window | `toolbar.left` | Back, forward and reload on the left | fatto (acceso di predefinito, scelta dell'utente): porte all'inizio della striscia; prova ui_strip.py |
| window | `tabs.compact` | Shorter tab bar | fatto: striscia di 36 con le schede in alto, la colonna resta 52; prova settings_a_column.py |
| window | `window.glass` | Glass | tolta per ora: Mica e Acrylic di Windows riempirebbero anche il margine trasparente della finestra disegnata da Oriel |
| window | `window.glass.style` | Glass style | tolta: Liquid Glass è di macOS 26 |
| window | `window.glass.clear` | Transparency | tolta con Glass (stesso motivo) |
| window | `window.glass.grain` | Grain | tolta con Glass (stesso motivo) |
| tablook | `tabs.liquid` | Liquid Glass tab | tolta: Liquid Glass è di macOS 26 |
| tablook | `sidebar.doorsUp` | Buttons at the top | fatto: i pulsanti del piede salgono accanto alle porte quando ci stanno (keptWidth ≤ beyondHelm); prova settings_a_tabs.py |
| tablook | `helm.back.hidden` | Back, forward and reload | fatto: ogni porta sparisce solo se tolta qui, colonna e striscia; prova settings_a_tabs.py |
| tablook | `helm.forward.hidden` | Back, forward and reload | fatto (come sopra) |
| tablook | `helm.reload.hidden` | Back, forward and reload | fatto (come sopra) |
| tablook | `foot.extensions.hidden` | Buttons under the column | fatto: il puzzle diventa largo 0 e trasparente, resta l'aggancio dei popup, i fissati restano; prova settings_a_tabs.py |
| tablook | `foot.bookmarks.hidden` | Buttons under the column | da fare: non c'è ancora il pulsante dei preferiti nel piede |
| tablook | `foot.profile.hidden` | Buttons under the column | da fare: non ci sono ancora i profili |
| tablook | `sidebar.player` | What's playing in other tabs | fatto: la scheda più recente che suona fuori vista, con pausa e riprendi (Player.swift); prova settings_a_tabs.py |
| tablook | `tabs.pinCounts` | Show counts on pins | fatto: il numero in testa al titolo, rosso sull'angolo dell'icona, niente se dorme; prova settings_a_tabs.py |
| tablook | `tabs.give` | Tabs give when pressed | fatto: la scheda premuta cede a 0,97 e torna; prova settings_a_tabs.py |
| tablook | `bookmarks.side` | Show the bookmarks bar in the sidebar | da fare: manca la barra dei preferiti (modulo dati) |
| tablook | `bookmarks.iconsOnly` | Show icons only on the bookmarks bar | da fare: manca la barra dei preferiti (modulo dati) |
| motion | `motion.light` | Save power in Low Power Mode | fatto: col risparmio energetico di Windows glide e settle diventano ease-out 0,16 e le schede dormono entro 10 minuti; prova settings_a_motion.py |
| motion | `motion.instant` | Reduce animations | fatto: ogni transizione subito, nella finestra e sopra la pagina; prova settings_a_motion.py |
| tabbar | `tabs.shortcuts` | Show tab numbers while ⌘ is held | fatto: tenendo Ctrl i numeri di Ctrl+1-9 sulle schede (9 l'ultima); prova settings_a_tabs.py |
| tabbar | `tabs.clickAddressOnly` | Clicking the tab you're on edits its address only | da fare: il campo non mostra ancora la scheda del sito sotto l'indirizzo (modulo campo), quindi oggi non cambia niente |
| window | `splitView` | Split View | niente da fare: è una nota, Split View è sempre attiva (modulo finestra) |

Voce nuova di Oriel, non del Mac: `window.buttons` (Themes › Window buttons, Inline predefinito o Classic), scelta dalla tavola `tavole/pulsanti-finestra.html`; prova window_buttons.py.

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
