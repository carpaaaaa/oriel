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
| reading | `reader.twins` | Read the site's own Markdown | fatto: copia Markdown dello stesso sito, renderer che fa escape (test/settings_c_reading.py) |
| reading | `reader.follows` | Reading mode follows light and dark | fatto: chiaro/scuro con la finestra, selettore nell'angolo, `reader.look` (settings_c_reading) |
| video | `float.style` | The floating video | fatto: finestra di Oriel (la vista si sposta) o PiP di Chromium (settings_c_video; PiP solo con ORIEL_PIP=1) |
| video | `float.leave` | Float the video on its own | fatto: esce cambiando scheda, solo video sentito su siti di video (settings_c_video) |
| video | `float.away` | Float the video on its own | vicino: esce quando nessuna finestra di Oriel ha il fuoco; manca il controllo "ancora visibile su un altro schermo" (settings_c_video) |
| video | `float.minimize` | Minimize the floating video | fatto: pulsante che lo rimpicciolisce a 220 e lo riporta (settings_c_video) |
| video | `media.click` | Videos wait for a click | fatto: play() della pagina rifiutato senza clic, autoplay fermo (settings_c_video); solo frame principale |
| video | `fullscreen.escapeTwice` | Press Esc twice to leave full screen | vicino: Electron esce dallo schermo intero della pagina prima di ogni aggancio, quindi il primo Esc viene annullato rimettendo la pagina a schermo intero, col promemoria; finestra (F11) come sul Mac (settings_c_video) |
| video | `fullscreen.keepsWindow` | Keep the window in use during full screen | tolta: Windows non ha un desktop proprio per l'app a schermo intero (già in catalog.ts) |
| pages | `translate.target` | Translation language | tolta: nessun motore di traduzione sul dispositivo (già in catalog.ts) |
| pages | `pages.capture` | Capture pages | fatto: area, elemento o pagina intera, copiata e salvata come PNG nei download (settings_c_peek) |
| pages | `sites.styles` | Your own style for a site | fatto: Edit Site Style… (view.style), CSS per sito in styles.json, spento non si indossa (settings_c_peek) |
| pages | `pages.120.mode` | Pages at 120 Hz | tolta: Chromium disegna già alla frequenza dello schermo (già in catalog.ts) |
| pages | `pages.120` | Pages at 120 Hz | tolta: come sopra, chiave vecchia |
| blocking | `shield` | Block ads and trackers | fatto: lista corta di Search come terze parti (rete, ordine 100), CSS cosmetico, YouTube; pausa per sito `shield.paused` (settings_c_blocking); CSS e script YouTube solo nel frame principale |
| blocking | `sites.keep` | Prevent cross-site tracking | vicino: niente ITP in Chromium; acceso toglie Cookie e Set-Cookie alle richieste di terze parti (settings_c_blocking); `document.cookie` nei frame e la card Storage Access mancano |
| blocking | `privacy.clickIDs` | Remove click trackers from links | fatto: gclid, fbclid… tolti prima del caricamento, utm_ restano, mai su indirizzi firmati (settings_c_blocking) |
| blocking | `privacy.gpc` | Tell sites not to sell or share your data | fatto: Sec-GPC: 1 e navigator.globalPrivacyControl (settings_c_blocking) |
| blocking | `privacy.httpsFirst` | Try HTTPS first | fatto: http provato in https, ritorno silenzioso a http, locali esclusi (settings_c_blocking) |
| mouse | `links.peek` | Peek at a link | fatto: pannello sopra la pagina, Esc o clic fuori lo chiude, Ctrl+O lo tiene come scheda senza ricaricare (settings_c_peek) |
| mouse | `links.peekClick` | Peek at a link | fatto: Shift, Alt+Shift, Ctrl+Alt (settings_c_peek) |
| mouse | `links.peek.stays` | Peek stays with its tab | fatto: nascosto con suono in pausa su un'altra scheda, torna al ritorno (settings_c_peek) |
| mouse | `links.optionSplit` | ⌥-click a link opens it in Split View | fatto: Alt-clic apre in Split View; spento segue il link come un clic (settings_c_mouse) |
| mouse | `autoscroll` | Scroll with the middle button | fatto: script del Mac col segno; quello nativo di Chromium spento (settings_c_mouse) |
| mouse | `wheel.smooth` | Smooth scrolling with a mouse wheel | vicino: animazione di scorrimento di Chromium, vale per le pagine create dopo il cambio (settings_c_mouse) |
| mouse | `pages.bounce` | Bounce at the top and bottom | vicino: spento ferma l'elasticità (overscroll-behavior), acceso la lascia a Chromium; non verificabile a occhio sul Mac (settings_c_mouse) |
| mouse | `swipe.history` | Hold a swipe to pick from history | tolta: Windows non dice a un'app inizio e fine di uno swipe del touchpad |
| developer | `agents` | Let coding agents use Search | tolta per ora: il ponte per gli agenti (MCP su pipe locale, consenso, Stop) è da costruire; la riga torna con lui |
| pages | `autocorrect` | Correct spelling as you type | vicino: correttore ortografico di Chromium per tutte le pagine (sottolinea e suggerisce, non corregge da solo) (settings_c_mouse) |
| pages | `inlinePredictions` | Show inline predictions | tolta: Chromium non ha predizioni in linea (già in catalog.ts) |
| pages | `translate.pages` | Translate pages on this Mac | tolta: nessuna traduzione sul dispositivo (già in catalog.ts, note.translate) |
| mouse | `switcher.keys` | Keys in the tab switcher | fatto: Ctrl+W, Ctrl+R, Ctrl+M sulla carta del selettore (settings_c_mouse); Ctrl+O no, Oriel non ha finestrelle |
| video | `float.flicks` | Flick the floating video to a corner | fatto: due dita sul touchpad lo lanciano nell'angolo (settings_c_video) |

## D. Altro (password, moduli, estensioni, ricerca, aggiornamenti, novità)

| Gruppo | Chiave | Voce | Stato |
|---|---|---|---|
| passwords | `passkeys` | Offer passkeys | fatto: acceso, le passkey sono quelle di Chromium (Windows Hello); spento, la pagina sente che non ci sono passkey né autenticatore (`main/settings/passkeys.ts`, `preload/page/internal.ts`); prova `test/settings_d_passkeys.py` |
| apple | `passwords.apple` | Passwords from Apple's Passwords app | tolta: l'app Password di Apple e il suo helper esistono solo sul Mac |
| forms | `contacts.fill` | Fill in your contact details | tolta: legge la scheda "La mia scheda" di Contatti del Mac; su Windows non c'è un equivalente affidabile |
| updates | `update.install` | Install updates on its own | fatto: `electron-updater` sulle GitHub Releases del repo, controllo all'avvio e ogni ora, acceso scarica e installa all'uscita (o con Relaunch now), spento dice e aspetta Install, riacceso con un aggiornamento in attesa lo scarica subito; popup al primo avvio con Update and Restart e X (`updates.dismissed`), poi sezione Update prima nelle Impostazioni (`main/settings/updater.ts`); prove `test/settings_d_updates.py`, `test/settings_d_popup.py` |
| news | `optin.joined` | News by email | tolta: è la lista email di Office Commun per Search su Mac. Al suo posto What's New: dopo un aggiornamento, una volta, le note di ogni versione dalle GitHub Releases (`oriel://release-notes`, Settings › About › What's New…); prova `test/settings_d_whatsnew.py` |
| news | `optin.iphoneBeta` | Search for iPhone beta | tolta: la beta di Search per iPhone non riguarda Oriel |
| extensions | `extensions.sites` | Where an extension runs | tolta per ora (nota della ricerca): in Electron Chromium inietta i content script come dice il manifesto e non c'è un permesso di sito da cambiare mentre gira; da rifare nel modulo estensioni quando ci sarà "Runs on" |
| extensions | `extensions.safariApps` | From Safari apps | tolta: le estensioni dentro le app di Safari esistono solo sul Mac |
| search | `search.sites` | Search a site from the address field | già attiva (nota "sempre lì"): la fa il modulo campo (`field/engines.ts` siteMatch); prova `test/settings_d_search.py` |
