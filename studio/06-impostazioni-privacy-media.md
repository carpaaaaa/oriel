# 06 · Impostazioni, privacy, permessi, download, notifiche, media, aggiornamenti

Studio del sorgente Mac di Search 1.0.19 (commit `4dbc44e`, `ref/search-mac`) per rifarlo identico su Windows (Electron/Chromium). Solo lettura: niente codice, niente build.

## 0. Convenzioni

- Identificatori, chiavi e testi dell'interfaccia sono in inglese e copiati esatti dal sorgente.
- Alcuni testi originali contengono il trattino lungo o il trattino medio. In questo documento quei caratteri sono scritti come `\u2014` (lungo) e `\u2013` (medio): nel porting va rimesso il carattere originale, se si vuole il testo identico.
- "Chiave" = riga nelle impostazioni (`UserDefaults`, dominio `com.officecommun.search`, vedi §6). Sul Mac un test usa un dominio a parte (`com.officecommun.search.test`).
- "Off finché lo accendi" = default spento, il comportamento non cambia finché l'utente non lo attiva (nel codice: "Off unless asked for").
- Riferimenti nella forma `File.swift:riga` (cartella `Sources/Search/`).
- Consiglio di metodo: l'intero inventario vive in un solo file, `SettingsIndex.swift`. Conviene estrarlo con uno script in un JSON (id, group, icon, title, detail, more, keys, words, kind, parent, findOnly) e far disegnare la finestra Windows da quel JSON: è l'unico modo per avere testi identici al carattere, compresi i testi `(i)` non riportati qui per esteso.

---

## 1. Inventario completo delle impostazioni

### 1.0 La finestra Impostazioni (struttura e comportamento)

**Dove vive.** Impostazioni è una pagina interna in una scheda, indirizzo `search://settings/<sezione>` (es. `search://settings/privacy`), una sola per finestra; `⌘,` (comando `app.settings`, "Settings…") la apre sulla sezione ricordata in `settings.page` (`Browser.swift:214`, `Browser.swift:555`, `InternalPages.swift`). Nomi vecchi accettati nell'indirizzo: `downloads` → General, `shortcuts` e `mouse` → Keyboard & Mouse (`Settings.swift:83`). Esiste anche una variante "card" 720×540 con angoli 16, bordo hairline, ombra e pulsante chiudi "Done   esc", usata solo fuori dalla scheda (anteprime) (`Settings.swift:142`).

**Layout (scheda).**
- Colonna sinistra ("rail") larga 196 pt, sfondo `wash` al 45%, padding 8: titolo "Settings" (13 semibold), campo "Find a setting" (alto 28, angoli 8, icona lente 11, suggerimento "⌘F" a destra finché è vuoto, poi una x per svuotare; Esc svuota), poi le sezioni in 3 blocchi separati da una hairline (`Settings.swift:164`).
  - Blocco 1: General, Appearance, Themes, Tabs, Browsing, Spaces & Pins.
  - Blocco 2: Passwords, Privacy, (AI solo se `AI.shipped`, che in 1.0.19 è `false`, `AI.swift:19`), Extensions, Keyboard & Mouse.
  - Blocco 3: About.
  - Ogni riga di sezione: alta 30, icona SF 12 medium larga 16, testo 13 (medium se scelta); la scelta ha una "pillola" bianca con ombra che scivola da una sezione all'altra (spring 0.45/0.72; ease 0.2 in Low Power; nessuna animazione con Reduce Motion). Mentre si cerca, accanto a ogni sezione c'è il numero di risultati in una capsula; le sezioni a zero sono al 40% di opacità.
- Hairline verticale di 1 pt, poi il contenuto: intestazione con icona (15) e titolo della sezione (17 semibold), oppure `Settings matching “<testo>”` durante la ricerca. Contenuto in una colonna larga al massimo 600 pt, centrata, padding orizzontale 24, gruppi spaziati 22. Ogni sezione apre dalla cima (una scroll view per sezione).
- Ogni gruppo: intestazione piccola maiuscola (10.5 semibold, tracking 0.5, inchiostro al 62%) con icona, poi una "Card" (angoli 11, bordo hairline). Le righe sono separate da hairline da bordo a bordo (in Impostazioni `ruleInset` = 0).
- Riga (`SettingRow`, `Settings.swift:1270`): icona SF 12 medium in una piastrella 26×26 (angoli 7, sfondo `wash`), titolo 13, eventuale (i) 10.5 che apre/chiude il testo "more" sotto, riga di dettaglio 11.5 `muted` (max 2 righe), controllo a destra; i controlli "wide" vanno sotto le parole con rientro 38. Padding 14 orizzontale, 10 verticale. Testo sotto la riga e liste annidate partono a 52 pt (`textInset`).
- Controlli condivisi (tutti disegnati a mano, non quelli di sistema):
  - `Switch` 30×18, capsula nera (`ink`) se acceso, `faint` se spento, pallino `ground` con ombra (`Settings.swift:1598`).
  - `Pill` capsula: testo 11.5, padding 10×5; "filled" = sfondo `ink` e testo `ground`, altrimenti bordo hairline e hover (`Settings.swift:1676`).
  - `Segmented` binario grigio con il segmento scelto in bianco che scivola (`Settings.swift:1541`).
  - `Pictures` miniature 76×50 con anello di 2 pt attorno alla scelta e nome sotto (`Settings.swift:1353`).
  - `Ticks` checkbox di sistema affiancate (`Settings.swift:1584`).
  - `Steps` capsula con − valore +; clic sul valore = torna al valore "home" (`Settings.swift:1619`).
  - `Always` capsulina grigia "Always on" (`Settings.swift:1339`).
  - Menu a tendina: `Picker` stile menu, etichetta nascosta, larghezza adattata.
- **Righe dipendenti.** Una riga con `parent` compare in sezione solo quando conta (`SettingsIndex.applies`, `SettingsIndex.swift:764`); nella ricerca compare comunque, al 50% e disabilitata, con al posto del dettaglio la frase di `needs` (`SettingsIndex.swift:796`), es. "Only with the tabs down a side".
- **Ricerca** (`SettingsIndex.find`, `SettingsIndex.swift:746`): ogni parola digitata (minuscolo) deve comparire come sottostringa in titolo + dettaglio + more + titolo gruppo + titolo sezione + `words` + `keys`. Risultati ordinati per sezione e gruppo; raggruppati con un'intestazione cliccabile `PAGINA  ›  GRUPPO` (maiuscolo, freccia), che apre la sezione, scorre alla prima riga e la illumina (sfondo `hover`) per 1,4 s. Le righe "note" (sempre attive) vanno in fondo sotto "Always on, nothing to set". Nessun risultato: "No setting called that. Try other words, like dark, tabs or video".
- **Tasti nei testi.** I titoli e dettagli che nominano scorciatoie passano da `ShortcutStore.relabel`, quindi mostrano il tasto scelto dall'utente se l'ha cambiato (`Settings.swift:392`).
- Cambiando sezione si salva `settings.page` e si aggiorna l'indirizzo della scheda (`Browser.swift:10167`).

**Windows (Electron).** Pagina interna servita da un protocollo proprio (`protocol.handle('search', …)`) dentro la stessa `WebContentsView` della scheda, oppure vista React dentro il guscio. Font: SF Pro non è licenziabile su Windows; le icone sono tutte SF Symbols, anch'esse non usabili fuori dalle piattaforme Apple. Servono un font sostitutivo e un set di icone ridisegnato (rischio principale per "identica", vedi §8).

### 1.1 General

**Gruppo "Your browser"** (icona `globe.desk`)

| # | id | Etichetta | Riga sotto (detail) | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se | Effetto e note Windows |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | general.default | Open links from other apps | Make Search the browser Mail, Slack and the rest send links to (diventa "Search is the default browser on this Mac" quando lo è) | no | Pill "Make default" (filled); se già default: spunta | nessuna (sistema) | n/a | n/a | sempre | Chiede a macOS di diventare il browser predefinito; esito "Links now open here" o "macOS didn't change it". **Mac**: su Windows registrare `Capabilities`/`RegisteredApplications`/ProgId e aprire `ms-settings:defaultapps?registeredAppUser=Search`; Windows non permette di farlo da codice. |
| 2 | mail.webmail | Email links open in | Write in Gmail or another webmail, in a tab, instead of your mail app | sì | menu: Your mail app, (divisore), Gmail, Outlook.com, Fastmail, Proton Mail | `mail.webmail` | `none` | sì | sempre | I `mailto:` aprono la pagina di composizione della webmail in una scheda accanto (`Webmail.swift`). Portabile 1:1. |
| 3 | mail.default | Make Search open email links | So links from other apps open your webmail too (varianti: "Email links from other apps open here", "Email links from other apps go to <app> now") | sì | Pill "Make default" o spunta | nessuna | n/a | n/a | `mail.webmail != none` | Gestore `mailto`. **Mac**: su Windows stesso giro delle app predefinite (protocollo `mailto`). |
| 4 | general.import | Bring things over | Bookmarks, history, passwords and extensions from another browser | sì | Pill "Bring Things Over…" | nessuna | n/a | n/a | sempre | Apre `search://import`. |
| 5 | sync | Sync with your other Macs | Spaces, pins, bookmarks and settings, through a folder you choose (acceso: riepilogo cartella · altri Mac · quando) | sì | Switch (acceso = chiede la cartella) | `sync.folder` | spento | sì | sempre; disabilitato (40%) se iCloud è acceso | Sync via cartella condivisa (`Sync.swift`). Portabile; il testo dice "Macs" e cita iCloud Drive. Opportunità: con lo stesso formato file Mac e Windows potrebbero sincronizzarsi via Dropbox. |
| 6 | handoff | Handoff to your iPhone and iPad | The page in front comes up in their app switcher, as Safari's does | sì | Switch | `handoff` | spento per chi aveva già Search; acceso per installazione nuova all'uscita dal welcome | dipende | sempre | **Solo Apple** (NSUserActivity). Nessun equivalente Windows. |
| 7 | icloud | Sync with iCloud | Open tabs, pins, spaces, bookmarks and a few settings, with your iPhone (o lo stato: "Signed in to iCloud · synced …", "Needs a build of Search signed for iCloud", "Turn off Sync with your other Macs first", "Not signed in to iCloud: System Settings › Apple Account") | sì | Switch | `icloud.sync` (+ `icloud.off`, `icloud.default`) | come Handoff | dipende | sempre; bloccato se build senza iCloud o sync cartella attivo | **Solo Apple** (CloudKit cifrato end to end). Su Windows non c'è CloudKit nativo. |
| 8 | icloud.erase | Delete Search's data from iCloud | For every device. What is on each one stays, and sync turns off here | no | Pill "Delete…" → avviso "Delete Search's data from iCloud?" / "Open tabs, pins, spaces, bookmarks and settings leave iCloud for every device. What is on each device stays. Sync with iCloud turns off here and on your other devices." / Delete, Cancel | nessuna | n/a | n/a | iCloud acceso | **Solo Apple**. |
| 9 | quit.confirm | Confirm before quitting | Ask before ⌘Q or Quit Search closes the browser | no | Switch | `quit.confirm` | spento | sì | sempre | Avviso "Quit Search?" / "Your windows and tabs will close." / Quit, Cancel (Cancel predefinito) (`Links.swift:41`). Windows: su `before-quit`/chiusura finestra; "⌘Q" diventa "Ctrl+Q" o Alt+F4. |

**Gruppo "Downloads"** (icona `arrow.down.circle`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se | Effetto e note Windows |
|---|---|---|---|---|---|---|---|---|---|---|
| 10 | downloads.folder | Save to | il percorso, con `~` al posto della home | no | Pill "Change…" → pannello cartella con pulsante "Use this folder" | `downloads` (percorso) | `~/Downloads` | n/a | sempre | Windows: `app.getPath('downloads')`, `dialog.showOpenDialog({properties:['openDirectory','createDirectory']})`, `buttonLabel: 'Use this folder'`. |
| 11 | downloads.ask | Ask where to save each file | A save sheet for every download | no | Switch | `downloads.ask` | spento | sì | sempre | `dialog.showSaveDialog` per ogni download. |
| 12 | downloads.button | Always show the downloads button | Off, it shows only while a file comes in | no | Switch | `downloads.button` | spento | sì | sempre | Bottone sempre visibile (vedi §3.2). |
| 13 | downloads.open | Open Downloads | From its button, ⇧⌘J and History › Downloads | sì | menu: In a tab, Floating by the button, In the side panel | `downloads.open` | `tab` | n/a | sempre | Dove si apre l'elenco (§3.2). |

### 1.2 Appearance

**Gruppo "Light and dark"** (icona `circle.lefthalf.filled`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se | Effetto e note Windows |
|---|---|---|---|---|---|---|---|---|---|---|
| 14 | look | Appearance | Light, dark, or whatever the Mac is doing. Pages follow it too | no | Pictures (wide): Light, Dark, Auto | `look` (`light`/`dark`/`system`) | `system` | n/a | sempre | `nativeTheme.themeSource = 'light'/'dark'/'system'` (le pagine seguono `prefers-color-scheme`). |
| 15 | pages.dusk | Darken pages that stay light | Pages with no dark look of their own are darkened too | sì | Switch | `pages.dusk` | spento | sì | `look != light` | Scurisce le pagine chiare (`Dusk.swift`). Windows: CSS/filtri iniettati; Chromium ha anche `--enable-features=WebContentsForceDark` (non identico). |
| 16 | inspector.chrome | Chrome's colors in the Web Inspector | A flat tab strip, and DevTools' colors for the row and the code | sì | Switch | `inspector.chrome` | spento | sì | sempre | **Mac**: su Windows l'ispettore è già DevTools di Chrome; la riga resta per identità ma non ha effetto reale. |
| 17 | inspector.dark | Keep the Web Inspector dark | The tools stay dark while Search is light | sì | Switch | `inspector.dark` | spento | sì | `look != dark` | DevTools: tema scuro indipendente (preferenza `uiTheme` di DevTools). |

**Gruppo "Window"** (icona `macwindow`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se | Effetto e note Windows |
|---|---|---|---|---|---|---|---|---|---|---|
| 18 | tabs.layout | Tabs | Across the top of the window, down a side as a column, or as icons only | sì | Pictures (wide): Top, Left, Right, Icons only | `sidebar`, `sidebar.position`, `sidebar.icons` | installazione nuova: colonna a sinistra; già installato: in alto (`SidebarDefault`) | n/a | sempre | Su Windows ogni installazione è nuova: colonna a sinistra. |
| 19 | sidebar.hides | Hide the column until the pointer reaches the edge | The page takes the whole window; ⌘S keeps the tabs out | no | Switch | `sidebar.hides` | spento | sì | `sidebar` | |
| 20 | sidebar.slides | Slide the column in and out | A gentler slide when ⌘S or the window's edge brings the column out or puts it away | sì | Switch | `sidebar.slides` | spento | sì | `sidebar` | |
| 21 | sidebar.foldIcons | ⌘S makes the column icons only | The tabs stay in sight as a narrow column of icons; ⌘S again brings the titles back | sì | Switch | `sidebar.foldIcons` | spento | sì | `sidebar` e non `sidebar.hides` | |
| 22 | fold.loadingLine | A loading line with the tabs hidden | Folded away with ⌘S, a thin line along the page's top while it loads | sì | Switch | `fold.loadingLine` | spento | sì | sempre | |
| 23 | layout.cards | The page as a card | A little room around the page, with rounded corners | sì | Pictures (wide): As a card, Edge to edge | `layout.cards` | acceso | n/a | `sidebar` | |
| 24 | layout.cardsFullScreen | Keep the card in full screen | Off, the page goes edge to edge when the window fills the screen | no | Switch | `layout.cardsFullScreen` | spento | sì | `sidebar` e card | |
| 25 | toolbar.left | Back, forward and reload on the left | Beside the window's buttons, before the tabs | no | Switch | `toolbar.left` | spento | sì | schede in alto | Su Windows i "window's buttons" sono a destra: decidere la resa. |
| 26 | tabs.compact | Shorter tab bar | Only a few points above and below the tabs, for more of the page | no | Switch | `tabs.compact` | spento | sì | schede in alto | |
| 27 | address.shown | Always show the address bar | The page's full address, to type in | no | Switch | `address.shown` | spento | sì | sempre | |
| 28 | address.width | Address width | Before the tabs across the top | no | Segmented: Small, Medium (220/340 pt) | `address.width` | `small` | n/a | barra indirizzo e schede in alto | |
| 29 | window.glass | Glass | What is behind the window shows through the tabs and the frame, blurred | sì | Switch | `window.glass` | spento | sì | sempre | **Mac** (vibrancy). Windows 11: `backgroundMaterial: 'acrylic'` (o `mica`); Windows 10 nulla di equivalente. |
| 30 | window.glass.style | Glass style | Frosted, or the Mac's Liquid Glass | no | Segmented: Frosted, Liquid | `window.glass.style` | `frosted` | n/a | vetro acceso e macOS 26 | **Mac**: Liquid Glass non esiste su Windows. Riga da nascondere (come fa il Mac prima di macOS 26). |
| 31 | window.glass.clear | Transparency | From the space's colour on the glass to clear glass | no | Slider 0..1 largo 160 | `window.glass.clear` | 0.5 | n/a | vetro acceso e spazi spenti | |
| 32 | window.glass.grain | Grain | A still noise over the glass | no | Slider 0..1 largo 160 | `window.glass.grain` | 0.2 | n/a | vetro acceso e spazi spenti | |

Solo nella ricerca: `note.split` "Split View" / "Always there: ⌥-click a tab, drag a tab onto a page, or press ⌥⌘N".

**Gruppo "Tabs"** (icona `textformat.size`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se | Effetto e note Windows |
|---|---|---|---|---|---|---|---|---|---|---|
| 33 | tabs.liquid | Liquid Glass tab | The tab you're on under a pane of Liquid Glass that glides, stretches and settles | sì | Switch | `tabs.liquid` | spento | sì | macOS 26 e non colonna a icone | **Mac**: da simulare con shader/CSS o nascondere. |
| 34 | sidebar.roomy | Roomier tabs | Taller rows and larger titles in the column | no | Switch | `sidebar.roomy` | spento | sì | colonna con titoli | Righe 36 invece di 28, titoli 14 invece di 12.5. |
| 35 | sidebar.doorsUp | Buttons at the top | Bookmarks, extensions and downloads beside back, forward and reload, when they fit | no | Switch | `sidebar.doorsUp` | spento | sì | colonna con titoli | |
| 36 | helm.shown | Back, forward and reload | Untick any you reach with the keys: the tabs get the room | sì | Ticks (wide): Back, Forward, Reload | `helm.back.hidden`, `helm.forward.hidden`, `helm.reload.hidden` | tutti visibili | n/a | sempre | |
| 37 | foot.shown | Buttons under the column | Untick extensions, bookmarks or your profile to hide its button | sì | Ticks (wide): Extensions, Bookmarks, Profile | `foot.extensions.hidden`, `foot.bookmarks.hidden`, `foot.profile.hidden` | tutti visibili | n/a | sempre | |
| 38 | sidebar.foldButton | Sidebar button | Beside the window's buttons, to hide the sidebar as ⌘S does | sì | Switch | `sidebar.foldButton` | spento | sì | colonna con titoli | |
| 39 | sidebar.narrowIcons | Narrow to icons | Pulled narrower than 200 points, the sidebar becomes a strip of site icons and its buttons | sì | Switch (spegnerlo azzera `sidebar.narrowed`) | `sidebar.narrowIcons` | spento | sì | colonna con titoli | |
| 40 | sidebar.player | What's playing in other tabs | At the foot of the sidebar, to pause it, play it again or go to it | sì | Switch | `sidebar.player` | spento | sì | colonna con titoli | Riga "player" (§3.5). |
| 41 | glyph | Tabs show | A letter or the site's icon | sì | Segmented: Letters, Site icons | `glyph` | `letters` | n/a | sempre | |
| 42 | tabs.highContrast | High contrast text | Tab titles in black or white, instead of soft grey | no | Switch | `tabs.highContrast` | spento | sì | sempre | |
| 43 | tabs.reading | Show how far you've read | The tab you're on fills with grey as you scroll down | no | Switch | `tabs.reading` | spento | sì | sempre | |
| 44 | tabs.pinCounts | Show counts on pins | A pinned page's unread count, from its title, as a badge on its icon | no | Switch | `tabs.pinCounts` | spento | sì | sempre | |
| 45 | tabs.give | Tabs give when pressed | A tab sinks a little under the pointer, as in Arc | no | Switch | `tabs.give` | spento | sì | sempre | |
| 46 | bookmarks.bar | Show the bookmarks bar | Your bookmarks in a row above the page | no | Switch | `bookmarks.bar` | spento | sì | sempre | |
| 47 | bookmarks.side | Show the bookmarks bar in the sidebar | At the top of the sidebar in every space, instead of above the page | sì | Switch | `bookmarks.side` | spento | sì | colonna e barra segnalibri | |
| 48 | bookmarks.iconsOnly | Show icons only on the bookmarks bar | Each bookmark as its site's icon, its name on hover | sì | Switch | `bookmarks.iconsOnly` | spento | sì | barra segnalibri non nella colonna | |

**Gruppo "Motion"** (icona `wind`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se | Effetto e note Windows |
|---|---|---|---|---|---|---|---|---|---|---|
| 49 | motion.light | Save power in Low Power Mode | Simpler motion while saving power or running hot; idle tabs sleep sooner in Low Power Mode | sì | Switch | `motion.light` | spento | sì | sempre | **Mac** (Low Power Mode, stato termico). Windows: "Risparmio energia" non è esposto da Electron; `powerMonitor.isOnBatteryPower()` e `'on-battery'` come approssimazione. |
| 50 | motion.instant | Reduce animations | Switching tabs, spaces and panels happens at once, without sliding or fading | sì | Switch | `motion.instant` | spento | sì | sempre | Indipendente da "Reduce Motion" di sistema; su Windows il corrispettivo di sistema è "Effetti di animazione" (`prefers-reduced-motion`). |

### 1.3 Themes

**Gruppo "Home background"** (icona `photo.artframe`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiavi | Default | Off finché lo accendi |
|---|---|---|---|---|---|---|---|---|
| 51 | home.theme | Home background | Paint the blank tab: a wall, stickers, a colour, a gradient or your own picture | sì | pagina intera "wide" (`ThemesPage.swift`) | `home.theme`, `home.theme.image`, `home.tuning`, `home.shuffle` | `off` | sì |

Contenuto del controllo (`ThemesPage.swift`): anteprima 480×300 con la finestra in piccolo e "Search or enter address"; segmented di sistema Off, Wall painting, Stickers, Solid colour, Gradient, Image. Off: "The blank tab stays plain.". Wall: griglia 3 colonne di miniature 160×100 (Open Road, Desert Highway, Coastal Cliffs, Mountain Lake, Rice Terraces, Northern Lights, Saturn Rise, Moonscape, City at Night, Monsoon Forest). Stickers: Space, Road Trip, Ocean, Jungle, Street Food, Retro Tech, Weather, Music, Wonders, Search. Solid: dischi di colore + `ColorPicker` "Colour". Gradient: preset (dusk, sea, peach, mint, mono) + "From", "To", slider "Angle" 0..360°. Image: Pill "Choose Image…", "Remove", nota "A copy is kept inside Search." (copia in `Theme/`). Per Wall e Stickers la checkbox "Shuffle: a different one each day". Slider "Intensity", "Density", "Scale" (0..100%).

### 1.4 Tabs

**Gruppo "New tabs"** (icona `plus.square`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se |
|---|---|---|---|---|---|---|---|---|---|
| 52 | tabs.newPlace | New tab position | Where a link or ⌘T's new tab goes in the row | sì | menu: After current; Top (colonna) o Leftmost (in alto); Bottom o Rightmost | `tabs.newPlace` (`next`/`top`/`end`) | `next` | n/a | sempre |
| 53 | tabs.frontBeside | Links opened in front go beside their page | A link that opens a new tab lands right after the tab it came from | sì | Switch | `tabs.frontBeside` | spento | sì | `tabs.newPlace == next` |
| 54 | tabs.newAfterLast | Leave a new tab when the last tab closes | Otherwise you land on a pinned tab | no | Switch | `tabs.newAfterLast` | spento | sì | sempre |
| 55 | tabs.closeGoesBack | Closing a tab goes back to the one before | Otherwise you land on the tab beside it | sì | Switch | `tabs.closeGoesBack` | spento | sì | sempre |
| 56 | tabs.swipeBackCloses | Swipe back closes a tab a link opened | Back to the tab you were on, as Safari and Arc do | sì | Switch | `tabs.swipeBackCloses` | spento | sì | sempre |
| 57 | home.grid | Show the Home bookmarks on a new tab | The sites of your bookmark folder called Home, under the address field | sì | Switch | `home.grid` | spento | sì | sempre |
| 58 | tabs.undoReopens | ⌘Z reopens a closed tab | Right after closing it, as ⇧⌘T would bring it back | sì | Switch | `tabs.undoReopens` | spento | sì | sempre |
| 59 | tabs.switcherBehindFirst | ⌃Tab goes to a link opened behind | Otherwise a quick ⌃Tab goes back to the tab you were on before | sì | Switch | `tabs.switcherBehindFirst` | spento | sì | sempre |
| 60 | tabs.switcherLeavesOutPins | The ⌃Tab switcher leaves out pinned tabs | Otherwise pinned tabs appear alongside regular tabs | sì | Switch | `tabs.switcherLeavesOutPins` | spento | sì | sempre |
| 61 | tabs.lazy | Load background tabs when you go to them | A link opened behind the page waits until you go to its tab | sì | Switch | `tabs.lazy` | spento | sì | sempre |
| 62 | tabs.popupWindows | Open sized pop-ups in small windows | A site asking for a window at its own size gets one, not a tab | sì | Switch | `tabs.popupWindows` | spento | sì | sempre |

Solo nella ricerca: `note.groups` "Tab groups" / "Always there: right-click a tab › Add to New Group".

**Gruppo "Memory"** (icona `moon.zzz`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiavi | Default | Off finché lo accendi |
|---|---|---|---|---|---|---|---|---|
| 63 | tabs.sleep | Sleep tabs you aren't using | A resting tab lets its page go and comes back where you left it | sì | Segmented wide (max 340): Never, Later, Normal, Sooner + riga sotto 11 pt: "Every tab keeps its page, however long you leave it." oppure "After two hours away, a tab rests and wakes when you go back to it." / "After half an hour away, …" / "After ten minutes away, …" | `tabs.sleep` (bool), `tabs.sleep.pace` (`later`/`normal`/`sooner`) | acceso, Normal (30 min; Later 2 h; Sooner 10 min) | n/a |
| 64 | tabs.sleep.dim | Dim sleeping tabs | A resting tab's title and icon fade until you go to it | no | Switch | `tabs.sleep.dim` | spento | sì |
| 65 | tabs.close.after | Close tabs you leave alone | Pinned, named and grouped tabs stay. ⇧⌘T brings one back | sì | menu: Never, After 12 hours, After a day, After a week, After a month | `tabs.close.after` (ore: 0/12/24/168/720) | 0 (Never) | sì |

Windows: lo "sleep" equivale a scartare la `WebContents` (chiuderla e ricrearla), Chromium non ha un "discard" esposto da Electron. Solo nella ricerca: `note.awake` "Keep selected sites awake" / "Always there: Keep This Site Awake, on the site's card".

**Gruppo "In the tab bar"** (icona `number`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi |
|---|---|---|---|---|---|---|---|---|
| 66 | tabs.shortcuts | Show tab numbers while ⌘ is held (diventa "Show tab numbers while ⌃ is held" con spazi e ⌘1\u2013⌘9 sugli spazi) | Which tab each ⌘1\u20139 selects | no | Switch | `tabs.shortcuts` | spento | sì |
| 67 | tabs.address | Show the address on the tab you're on | Its site in place of its title; the title comes back under the pointer | sì | Switch | `tabs.address` | acceso | n/a |
| 68 | tabs.clickAddressOnly | Clicking the tab you're on edits its address only | Without the site card under it | sì | Switch | `tabs.clickAddressOnly` | spento | sì |

**Gruppo "Windows"** (icona `macwindow.on.rectangle`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi |
|---|---|---|---|---|---|---|---|---|
| 69 | tabs.mirror | Same tabs in every window | Each window lists the same open tabs in a space, as it lists the same pins | sì | Switch | `tabs.mirror` | spento | sì |

### 1.5 Browsing

**Gruppo "Searching"** (icona `magnifyingglass`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiavi | Default | Off finché lo accendi |
|---|---|---|---|---|---|---|---|---|
| 70 | search.engine | Search with | Where words that aren't an address go (Custom: "Words go to <host>" o "An http or https address with %s where the words go. Until then, Google") | no | menu: Google, DuckDuckGo, Bing, Ecosia, Startpage, Kagi, Brave Search, Qwant, Custom; con Custom compare un campo sotto, segnaposto `https://example.com/search?q=%s` | `search.engine`, `search.custom` | `google` | n/a |
| 71 | search.shift | Shift-Return searches with | Off: Shift-Return does what Return does (scelto: "Shift-Return sends what you typed to <engine>") | sì | menu: Off, (divisore), motori; Custom con campo | `search.shift` (assente = Off), `search.shiftCustom` | Off | sì |
| 72 | search.suggest | Suggestions from your search engine | What you type is sent to <engine> as you type (motore custom: "A custom engine has no suggestions to give, so nothing is sent") | sì | Switch | `search.suggest` | spento | sì |
| 73 | search.keywords | Site shortcuts | A word before your search sends it to that site: "yt cats" | no | Pill "Add"; durante la scrittura "Cancel" e "Save" (filled); editor con campo "word" (corsivo) → campo "address with %s for the words, e.g. youtube.com/results?search_query=%s"; elenco cliccabile per modificare ("Click to change") con x per togliere | `search.keywords` (JSON `[Keyword]`) | vuoto | n/a |

Messaggi di validazione del 73: "Type a word, like yt, then the site's search address with %s where the words you type go", "<word> will search <name>", "A word to type first, like yt", "One word, with no spaces in it", "<kw> already goes to <name>", "An http or https address with %s once, where the words go" (`Keyword.swift:63`). Sotto il 73 compare "Home page" (vedi §1.10) se un'estensione chiede di sostituire la nuova scheda. Solo nella ricerca: `note.sitesearch` "Search a site from the address field" / "Always there: type red, then Tab, and search Reddit".

**Gruppo "Links"** (icona `link`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se |
|---|---|---|---|---|---|---|---|---|---|
| 74 | links.little | Open links from other apps in a small window | To read and close, or keep with Open in Search (⌘O); a tab's menu opens one too | no | Switch | `links.little` | acceso per installazione nuova, spento per chi aveva già Search | n/a | sempre |
| 75 | links.little.tabs | Go to a tab that has the page | A link to a page already open in a tab goes to that tab, not a small window | no | Switch | `links.little.tabs` | spento | sì | `links.little` |

Solo nella ricerca: `note.panel` "Websites in the side panel" / "Always there: View › Side Panel, or right-click a tab"; `note.links` "Show where links go" / "Always there: a link's address at the bottom of the page".

**Gruppo "Reading mode"** (icona `doc.plaintext`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi |
|---|---|---|---|---|---|---|---|---|
| 76 | reader.twins | Read the site's own Markdown | When a page has a Markdown copy, reading mode shows that | sì | Switch | `reader.twins` | spento | sì |
| 77 | reader.follows | Reading mode follows light and dark | In a dark window the article is light on dark | sì | Switch | `reader.follows` | spento | sì |

**Gruppo "Video"** (icona `play.rectangle`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiavi | Default | Off finché lo accendi | Effetto e note Windows |
|---|---|---|---|---|---|---|---|---|---|
| 78 | float.style | The floating video | Search's own window, or macOS's picture in picture | sì | Segmented: Search's window, Picture in picture | `float.style` (`search`/`system`) | `search` | n/a | Windows: PiP di Chromium (`requestPictureInPicture` lanciato con gesto utente). §3.5 |
| 79 | float.own | Float the video on its own | A playing video comes out when you leave its tab, or Search | sì | Segmented wide (max 340): Never, Switching tabs, Tabs or apps | `float.leave`, `float.away` | Switching tabs (`float.leave` acceso, `float.away` spento) | n/a | |
| 80 | float.minimize | Minimize the floating video | A button tucks the floating video small. The same button brings it back | no | Switch | `float.minimize` | spento | sì | |
| 81 | media.click | Videos wait for a click | Videos don't start by themselves, even without sound | no | Switch | `media.click` | spento | sì | Windows: Chromium non blocca l'autoplay muto per policy: serve uno script (§3.5). |
| 82 | fullscreen.escapeTwice | Press Esc twice to leave full screen | The first press shows a reminder, as in Arc | no | Switch | `fullscreen.escapeTwice` | spento | sì | |
| 83 | fullscreen.keepsWindow | Keep the window in use during full screen | Its tabs stay in reach on its own desktop while a video plays on another | no | Switch | `fullscreen.keepsWindow` | spento | sì | **Mac** (Spaces di macOS). Su Windows non c'è un desktop per l'app a schermo intero. |

Solo nella ricerca: `note.flick` "Flick the floating video to a corner" / "Always there: two fingers send it to the corner they point at" (chiave `float.flicks`, default acceso).

**Gruppo "Pages"** (icona `doc.richtext`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiavi | Default | Off finché lo accendi | Effetto e note Windows |
|---|---|---|---|---|---|---|---|---|---|
| 84 | translate.target | Translation language | Pages are translated on this Mac | no | menu "System Default" + lingue (prima di macOS 15: testo "Requires macOS 15") | `translate.target` (vuoto = lingua di sistema) | vuoto | n/a | **Mac** (framework Translation di Apple, sul dispositivo). Electron non ha traduzione: serve un motore locale (es. Bergamot/Firefox Translations in WASM). |
| 85 | pageZoom | Page zoom | Where every site starts. ⌘+ and ⌘− are kept for each site | no | Steps: 50% … 300% a passi del 5%; clic sul numero = 100% | `pageZoom` | 1.0 | n/a | Electron: zoom per host già condiviso tra schede, ma non persistito: salvarlo noi (`zoom.<host>`). |
| 86 | pages.capture | Capture pages | Capture… in the View menu copies an area, an element or the whole page | sì | Switch | `pages.capture` | spento | sì | `webContents.capturePage`, pagina intera via CDP `Page.captureScreenshot`. |
| 87 | sites.styles | Your own style for a site | Edit Site Style… in the View menu puts CSS of yours on the site you're on | sì | Switch | `sites.styles` (stili in `styles.json`) | spento | sì | `webContents.insertCSS`. |
| 88 | pages.120 | Pages at 120 Hz | Smoother scrolling on screens that can. On power spares the battery | sì | Segmented: Never, On power, Always | `pages.120.mode` (legacy `pages.120` bool) | On power | n/a | **Mac** (WebKit limita a 60 fps). Chromium disegna già alla frequenza dello schermo: la riga non ha un effetto reale facile (tenerla per identità o toglierla, da decidere). |

Sotto il 88, se ci sono lingue "sempre tradotte", l'elenco `TranslateLanguageList`: righe "Always translate <lingua>" / "Pages in <lingua> are translated as they open" con Pill "Remove" (chiave `translate.always`). Solo nella ricerca: `autocorrect` "Correct spelling as you type" / "Now in Edit › Spelling and Grammar, as in Safari"; `inlinePredictions` "Show inline predictions" / "The grey rest of a word as you type; in Edit › Spelling and Grammar"; `note.translate` "Translate pages on this Mac" / "Always there: right-click a page › Translate Page".

### 1.6 Spaces & Pins

**Gruppo "Coming from Arc?"** (icona `arrow.down.forward.square`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Note |
|---|---|---|---|---|---|---|
| 89 | arc.setup | Set Up Like Arc | Tabs on the left, spaces, pinned rows, and Arc's habits, like closing tabs after 12 hours | sì | Pill "Set Up" (filled); dopo: "Undo"; se già così: capsula "Set up" | Accende solo ciò che è spento: schede a sinistra, Spaces, pinned rows, pins keep their site, floating new tab, chiusura dopo 12 ore, video che fluttua cambiando scheda, swipe back chiude, Shift-click peek. Messaggio "Turned on: …" o "Already set up like Arc"; Undo "Put back as it was" (`SettingsIndex.swift:924`). |
| 90 | arc.import | Bring Arc's spaces and pins over | Your spaces, pinned tabs and folders, read from Arc on this Mac (senza Arc: "Arc isn't on this Mac. Bring Things Over can read an export") | no | Pill "Bring Over…" (disabilitato al 40% senza Arc) | Arc esiste anche su Windows: percorso del suo `StorableSidebar.json` diverso. |

**Gruppo "Spaces and profiles"** (icona `rectangle.3.group`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiavi | Default | Off finché lo accendi | Visibile se |
|---|---|---|---|---|---|---|---|---|---|
| 91 | spaces | Spaces | Separate sets of tabs, switched with ⌃1\u2013⌃9 or a swipe | sì | Switch | `spaces` | spento | sì | sempre |
| 92 | spaces.commandNumbers | ⌘1\u2013⌘9 switch spaces | Tabs move to ⌃1\u2013⌃9, as in Arc | sì | Switch | `spaces.commandNumbers` | spento | sì | sempre (non è nella lista `applies`) |
| 93 | spaces.buttons | One button per space | Every space beside the bookmarks, one click away | sì | Switch | `spaces.buttons` | spento | sì | spazi accesi |
| 94 | profiles | Profiles | Spaces with their own sign-ins, history and bookmarks | sì | Pill "New Profile…" + elenco profili sotto (`ProfileList`: "Profiles" + dettaglio, righe "<nome>" o "<nome> \u2014 this window", Pill "Open", "Rename…", "Delete…" rosso) | `profiles.json` | n/a | n/a | sempre |
| 95 | profiles.oneWindow | Profiles in one window | Every profile's spaces in one window, switched in place | sì | Switch | `profiles.oneWindow` | spento | sì | più di un profilo |
| 96 | spaces.links | Send links to a space | Links to sites you choose open in their space, with its sign-ins | sì | Switch + elenco regole sotto (`SpaceRouteList`: righe sito "Opens in <spazio>" con "Remove", campo + menu "Space" + "Add") | `spaces.links`, `spaces.links.rules` | spento | sì | spazi accesi |
| 97 | links.ask | Ask which space for links from other apps | Choose the space a link from another app opens in, before it loads | sì | Switch | `links.ask`, `links.ask.last` | spento | sì | spazi accesi |

Solo nella ricerca: `note.spaceGradient` "A space's colour or gradient" / "Always there with Spaces: the space's menu › Colour…, one colour or a gradient".

**Gruppo "Pins"** (icona `pin`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiavi | Default | Off finché lo accendi | Visibile se |
|---|---|---|---|---|---|---|---|---|---|
| 98 | pins.keep | Pins keep their site | Links elsewhere open over the pin, and ⌘W takes it back home | sì | Switch (unisce due chiavi) | `pins.home`, `pins.peek` | acceso se nessuna delle due è mai stata scritta | n/a | sempre |
| 99 | pins.list | Pinned rows | Pins as rows under the squares, and Clear over the rest | sì | Switch | `pins.list` | spento | sì | colonna |
| 100 | pins.folders | Folders in pinned rows | Pinned rows in folders, folders in folders, as in Arc | sì | Switch | `pins.folders` | spento | sì | colonna e pinned rows |
| 101 | pins.commandNewTab | ⌘-click on a pin opens a new tab | Opens a tab at the pin's site, or moves a wandered page to loose tabs | sì | Switch | `pins.commandNewTab` | spento | sì | sempre |

Solo nella ricerca: `note.sharedpins` "Pins in every space" / "Always there with Spaces: right-click a pin › Keep in Every Space"; `note.pinback` "A pin's number again goes back" / "Always there: press a pin's ⌘ number again to go back".

**Gruppo "Opening and starting"** (icona `command`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se |
|---|---|---|---|---|---|---|---|---|---|
| 102 | newtab.floating | New tab in a floating field | ⌘T raises the address field over the page, as in Arc | sì | Switch | `newtab.floating` | spento | sì | sempre |
| 103 | field.window | The field in the middle of the window | ⌘T's and ⌘L's field over a page, centred on the window and higher up | sì | Switch | `field.window` | spento | sì | sempre |
| 104 | newtab.recent | Recent places in the new tab | Before you type, ⌘T's field lists the last three places you went | sì | Switch | `newtab.recent` | spento | sì | campo flottante |
| 105 | newtab.arc | ⌘T finds your open tabs | As you type, an open tab or a pin that matches is picked, and Return goes to it | sì | Switch | `newtab.arc` | spento | sì | campo flottante |
| 106 | commandbar | Address bar commands | "settings" or "new tab" alone in the address field goes there | sì | Switch | `commandbar` | spento | sì | sempre |
| 107 | start.fresh | Start with a fresh window | Pins, groups and named tabs come back; last time's others don't | no | Switch | `start.fresh` | spento | sì | sempre |

### 1.7 Passwords

| # | id | Gruppo | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se | Note Windows |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 108 | passwords.open | Your passwords (`key`) | Your passwords | In the macOS keychain, shown with Touch ID | no | Pill "Open…" → `search://passwords` | nessuna | n/a | n/a | sempre | **Mac**: keychain e Touch ID → Credential Manager/DPAPI e Windows Hello. |
| 109 | passwords.save | Your passwords | Offer to save passwords | Asked once per site, never again for a site you refuse (se un gestore estensione ha preso il salvataggio: "<nome> does the saving; it asked Search not to offer") | no | Switch | `passwords.save` | acceso | n/a | sempre | |
| 110 | passwords.fill | Your passwords | Fill in sign-ins | Click a sign-in box and your accounts for the site hang from it | no | Switch | `passwords.fill` | acceso | n/a | sempre | |
| 111 | passwords.fill.prove | Your passwords | Ask for Touch ID before filling | Or your Mac's password, before a saved password goes into a page | sì | Switch | `passwords.fill.prove` | spento | sì | `passwords.fill` | **Mac**: Windows Hello (`UserConsentVerifier`) via modulo nativo. |
| 112 | passkeys | Your passwords | Offer passkeys | Touch ID or an iCloud passkey, on sites that offer one (o "Needs an Apple entitlement this build doesn't have", "macOS was told no: System Settings › Privacy & Security › Passkeys") | no | Switch | `passkeys` (+ `passkeys.for`, `passkeys.entitled` scritte a ogni avvio) | acceso nelle build firmate con l'entitlement | n/a | sempre | Chromium su Windows fa WebAuthn con Windows Hello da solo: niente entitlement. Sotto, se esistono: riga "Sites never asked" / "<n> sites told to stop offering" con Pill "Forget" → "Every site can ask again". |
| 113 | passwords.apple | Apple Passwords (`lock.rectangle.stack`) | Passwords from Apple's Passwords app | Your Passwords app's accounts and verification codes under their box. Unofficial | sì | Switch + scheda di collegamento (`ApplePasswordsCard`: "Connect…", codice a 6 cifre "Enter the code your Mac shows", "Connected", "Disconnect") | `passwords.apple` | spento | sì | sempre | **Mac**. Su Windows "iCloud per Windows" ha un helper di native messaging per l'estensione Chrome di iCloud Passwords: tecnicamente possibile ma non ufficiale e da verificare. |
| 114 | contacts.fill | Filling in forms (`character.cursor.ibeam`) | Fill in your contact details | Your card in Contacts under name, email, phone and address boxes | sì | Switch (accendendo chiede a macOS il permesso Contatti; errori annunciati: "Search may not read Contacts: System Settings › Privacy & Security › Contacts", "No card of yours in Contacts: pick yours there, then Card › Make This My Card") | `contacts.fill` | spento | sì | sempre | **Mac** (Contatti, "My Card"). Nessun equivalente Windows affidabile. |

### 1.8 Privacy

**Gruppo "Blocking"** (icona `shield`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Note Windows (dettagli in §2) |
|---|---|---|---|---|---|---|---|---|---|
| 115 | shield | Block ads and trackers | Third parties whose only job is to watch, and YouTube's ads (se la lista non compila: il messaggio d'errore) | sì | Switch; se c'è un problema, riga sotto "<errore>" / "Nothing is being blocked until this clears. Try again, or restart Search" con Pill "Try again" | `shield` | acceso | n/a | Ricostruire la lista corta di Search (non EasyList). |
| 116 | sites.keep | Prevent cross-site tracking | As in Safari. Private tabs keep it on | sì | Switch **invertito**: acceso = protezione attiva = chiave `false` | `sites.keep` (true = protezione spenta) | protezione accesa | n/a | ITP non esiste in Chromium: blocco cookie di terze parti + Storage Access. |
| 117 | privacy.clickIDs | Remove click trackers from links | gclid, fbclid and the like go before the page loads. Private tabs always | sì | Switch | `privacy.clickIDs` | acceso | n/a | Sul Mac la riga esiste solo da macOS 27. Windows: sempre offerta. |
| 118 | privacy.gpc | Tell sites not to sell or share your data | Global Privacy Control, with every request. Private tabs always | sì | Switch | `privacy.gpc` | acceso | n/a | Sul Mac solo se WebKit lo supporta. Windows: header `Sec-GPC: 1`. |
| 119 | privacy.httpsFirst | Try HTTPS first | An http:// page loads over HTTPS where the site has it | sì | Switch | `privacy.httpsFirst` | spento | sì | Sul Mac da macOS 15.2. Windows: redirect + ritorno silenzioso a http. |

Testi (i) del gruppo, copiati perché sono il comportamento:
- shield: "On YouTube, the ads announced in the player's own data are taken out before the video starts. Turn it off for one site in its card: click the tab you're on."
- sites.keep: "On, as in Safari, a site you mostly reach from a tracker's link (YouTube from Google, GitHub from a sign-in button) can lose its saved preferences, and in time its sign-in, after a week of browsing without a click or typing on it. Off, sites you rarely open keep their sign-ins, and trackers inside other sites can follow you across them again, as in Chrome."
- privacy.clickIDs: "The IDs an ad network adds to a link so the site can tell whose click it was. Campaign tags (utm_) stay, as in Safari."
- privacy.gpc: "Sends Sec-GPC: 1, which some laws make a site honour."
- privacy.httpsFirst: "Where it hasn't, the page loads as asked. Local addresses (localhost, .test, .local, IP addresses) are left as they are."

**Gruppo "Site permissions"** (icona `checkmark.shield`)

| # | id | Etichetta | Riga sotto | Controllo | Chiave | Default |
|---|---|---|---|---|---|---|
| 120 | notifications.ask | Let sites ask to send notifications | Only a site you allow reaches your Mac's notifications | Switch | `notifications.ask` | acceso |
| 121 | privacy.forget | Camera, microphone, location and notifications | What each site was allowed or refused | Pill "Forget choices" (cancella tutte le chiavi `capture.*` e `nofloat.*`, annuncio "Camera, microphone, location and notification choices forgotten") | nessuna propria | n/a |

Sotto il 121, in sezione (non nella ricerca):
- `PermissionSites` (`Settings.swift:1709`): se esistono scelte salvate, testo "Reset asks again next time. Devices already in use keep running.", campo "Find a site", menu "Filter by permission" (All permissions, Camera, Microphone, Location, Notifications). Righe per origine: origine, "1 permission"/"<n> permissions", chevron; aperta, una riga per permesso con il titolo (Camera, Microphone, Location, Notifications) e lo stato (Allow, Refuse, "Different answers; refusal applies", "Saved <x> · May differ from current permission", più " · Notifications are off" se il 120 è spento) e Pill "Reset" o "Remove record". Nessun risultato: "No matching sites".
- `PopupSiteList` (`BlockedPopups.swift:239`): una riga per sito autorizzato ai pop-up, "<sito>" / "Can open pop-ups without a click", Pill "Remove".

**Gruppo "Clear"** (icona `trash`)

| # | id | Etichetta | Riga sotto | Controllo | Effetto |
|---|---|---|---|---|---|
| 122 | clear.history | History | Every address you have been to | Pill "Clear" | Subito, senza conferma: storia di tutti gli spazi del profilo, schede archiviate, scelte "link chooser" degli spazi, icone dei siti, motori imparati (`search-sites.json`), indirizzi d'origine dei download (i file restano). Annuncio "History cleared" (`Browser.swift:1924`). |
| 123 | clear.cookies | Cookies and sign-ins | Signs you out of every site | Pill "Sign out of everything" | Subito: tutti i dati dei siti di tutti gli store del profilo. "Signed out of everything" (`Browser.swift:1889`). Electron: `session.clearStorageData()` per ogni partizione del profilo. |
| 124 | clear.cache | Cache | Only what was fetched to draw pages | Pill "Clear" | Cache HTTP, memoria, appcache, Cache Storage dei service worker (i worker restano). "Cache cleared" (`Browser.swift:1905`). Electron: `session.clearCache()` + `clearStorageData({storages:['cachestorage']})`. |

**Gruppo "Proxy"** (icona `network`, disegnato senza Card, `Settings.swift:358`, `Proxy.swift:318`)

Non è nell'indice di ricerca. Contenuto:
- Riga "Send everything through a proxy", dettaglio "Off: Search follows the Mac's own network settings." (con proxy attivo: lungo testo su cosa passa, `Proxy.swift:324`), menu largo 180: "Off, or the Mac's own", "HTTP", "SOCKS5".
- Con proxy scelto: campi (stile bordato) "Host, such as 127.0.0.1", "Port, such as 7890", "User name, if the proxy asks for one", campo segreto "Password, if the proxy asks for one"; nota HTTP "HTTP proxies are reached with CONNECT, so the proxy has to allow tunnelling." o SOCKS "SOCKS5, as an SSH tunnel or a local client offers."; con nome utente, avviso sulle credenziali in chiaro.
- Errori: "Enter a host name or IP address on its own, without a scheme, a port or a path.", "Enter a port from 1 to 65535.".
- Pill "Apply" (filled, disabilitato se non valido) → "Proxy turned off." oppure "Proxy applied. Reload a page to fetch it through the proxy." oppure l'errore del portachiavi.
- Chiave `network.proxy` (JSON: mode, host, port, username); password nel portachiavi. Default: Off. Off finché lo accendi: sì.

### 1.9 AI

Sezione presente nel codice (`AISettings`, chiavi `ai`, `ai.provider`, `ai.models`) ma nascosta: `AI.shipped = false`. Non va riprodotta per avere una 1.0.19 identica.

### 1.10 Extensions

Disegnata da `ExtensionsPage` (`ExtensionsUI.swift:6`), non dall'indice. Sotto macOS 15.4: solo "Chrome extensions" / "Need macOS 15.4 or later \u2014 the version whose WebKit can run them.". Altrimenti, in ordine: "Add from the Chrome Web Store" con Pill "Open the Store", campo "Paste a link to an extension, or its id", Pill "Add" (filled), riga "Or find it in the store and press Add to Search on its page."; card "From another browser" / "What Chrome, Arc, Brave and the others added from the Chrome Web Store \u2014 installed fresh from the store, you say yes to each one" con "Bring them over…"; elenco installate (vuoto: "No extensions yet.") con, per ognuna, accesso ai siti (menu: All Sites It Asks For, Only Sites I Name, Only When I Click It; campo "Add a site, like example.com" + "Add"), "Allow in Private Tabs" (o "Private Tabs Aren't Supported"); nota sulle schede private; "Load an unpacked extension" con "Choose…"; "From Safari apps" con Switch (chiave `extensions.safariApps`, spento) ed elenco ("No Safari extensions in your apps.", "Added", "Add"). Solo nella ricerca: `extensions.sites` "Where an extension runs" e `extensions.safariApps` "From Safari apps" / "Off unless you turn it on, at the foot of Settings › Extensions" (quest'ultima **Mac**: non esiste su Windows).

Riga "Home page" (`HomePageLine`, `ExtensionsUI.swift:500`), mostrata sotto "Site shortcuts" solo se un'estensione chiede la nuova scheda: menu "Search's own" + estensioni; dettagli "New tabs show <nome>'s page, since you let it replace them" / "New tabs open blank. <nome> asked to show its page instead" / "New tabs open blank. <n> extensions asked to show their page instead". Chiavi `extensions.newtab.<id>`.

Su Electron il supporto estensioni è molto più ridotto (niente MV3 completo): area di un altro studio, qui solo per l'inventario.

### 1.11 Keyboard & Mouse

**Gruppo "Mouse and trackpad"** (icona `computermouse`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiavi | Default | Off finché lo accendi | Visibile se | Note Windows |
|---|---|---|---|---|---|---|---|---|---|---|
| 125 | links.peek | Peek at a link | Its page opens in a panel over the one you're reading | sì ("Escape puts it away; the other button keeps it as a tab.") | menu: Off, Shift-click, Option-Shift-click, Option-Command-click | `links.peek`, `links.peekClick` | Shift-click | n/a | sempre | Nomi dei tasti: Option → Alt, Command → Ctrl su Windows. |
| 126 | links.peek.stays | Peek stays with its tab | Another tab hides it, with its video and sound paused, and coming back shows it | no | Switch | `links.peek.stays` | spento | sì | peek su link o pin attivo | |
| 127 | links.optionSplit | ⌥-click a link opens it in Split View | Its page beside the one you're reading, as Open Link in Split View | sì | Switch | `links.optionSplit` | spento | sì | sempre | Alt-clic su Windows. |
| 128 | autoscroll | Scroll with the middle button | Click the wheel, then move the mouse to scroll, as on Windows | no | Switch | `autoscroll` | spento | sì | sempre | Su Windows Chromium lo sa fare (feature Blink `MiddleClickAutoscroll`, da verificare in Electron). |
| 129 | wheel.smooth | Smooth scrolling with a mouse wheel | Each notch of the wheel glides over a few frames, as in Chrome, instead of jumping | sì | Switch | `wheel.smooth` | spento | sì | sempre | Chromium su Windows ha già lo scorrimento morbido; lo spento richiede `--disable-smooth-scrolling` (al riavvio). |
| 130 | pages.bounce | Bounce at the top and bottom | A page stretches a little past its ends and springs back, as in Safari | no | Switch | `pages.bounce` | spento | sì | sempre | Chromium: `ElasticOverscroll` su Windows (touchpad), da verificare. |
| 131 | swipe.history | Hold a swipe to pick from history | Keep your fingers down after a swipe back to pick a page | sì | Switch | `swipe.history` | acceso | n/a | sempre | **Mac** (gesti trackpad). Su Windows i gesti touchpad di precisione arrivano come scroll orizzontale: da ricostruire. |

Solo nella ricerca: `note.switcher` "Keys in the tab switcher" / "Always there: ⌃W, ⌃R, ⌃M and ⌃O while ⌃Tab is up".

**Gruppo "From any app"** (icona `macwindow.on.rectangle`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Visibile se | Note Windows |
|---|---|---|---|---|---|---|---|---|---|---|
| 132 | launcher.on | Open the address field from any app | A key of your own raises it over the app you're in, as Spotlight does | sì | Switch | `launcher.on` | spento | sì | sempre | `globalShortcut.register`. |
| 133 | launcher.key | Key | Press it in any app to bring the address field up | no | casella tasto (`LauncherKeyBox`): "None", "Type a shortcut", Pill "Use ⇧⌘Space" (suggerito: Shift+Command+Space), aiuto "Click, then press the key. ⌫ takes it away", errori "Add ⌘, ⌥ or ⌃", "Can't be used", "Used by macOS" | `launcher.key` (JSON) | nessuno | n/a | `launcher.on` | Il suggerito va cambiato su Windows (Alt+Space è del sistema e di PowerToys Run). |
| 134 | launcher.little | Open in a small window | Return opens the page in a small window over the app you're in, not in Search's window | sì | Switch | `launcher.little` | spento | sì | sempre (non è in `applies`) | |

**Gruppo "Shortcuts"** (icona `command`, `ShortcutsPage.swift`). Non nell'indice. Campo "Search commands or keys", sezioni con didascalia, una riga per comando del menu con la casella del tasto (clic e premi), menu contestuale "Clear Shortcut" e "Reset to Default", riga numeri delle schede con nota ("The ninth is the last. …"), Pill "Reset All to Defaults". Vuoto: "No command called that, or on that key". Comandi nascosti se la funzione è spenta (spazi, profili, AI, Darken, archivio, Capture, stili). Chiave `shortcuts` (JSON solo dei tasti cambiati).

### 1.12 About

Intestazione: logo (alto 34) + "Search" (15 semibold) + "by Office Commun · version <x>" (12 muted) (`Settings.swift:1152`).

**Gruppo "Updates"** (icona `arrow.triangle.2.circlepath`)

| # | id | Etichetta | Riga sotto | Controllo | Chiave | Default |
|---|---|---|---|---|---|---|
| 135 | updates.version | "Updates"; durante: "Search <v> is downloading…", "Search <v> is ready", "Search <v> is out" | "Checked <tempo relativo>, every hour on its own" o "Checked every hour on its own"; con una versione nuova: le note della release, o "Quietly, in the background. Nothing you have set is touched" / "It's there the next time you open Search" / "Open the disk image, the same as the first time" / "Checked and put in place when you press Install" | Pill "Check now" ("Checking…"), poi anello che gira, "Relaunch now" (filled), "Download" ("Downloading…") (filled), "Install" (filled). Nessuna novità: annuncio "This is the latest one" | `update.checked` (data) | n/a |
| 136 | updates.auto | Install updates on its own | Off, Search tells you and waits for Install | Switch (riaccenderlo con un aggiornamento in attesa lo installa subito) | `update.install` | acceso |
| 137 | about.feedback | Found something wrong? | Opens a draft with the version already in it | Pill "Send Feedback" | nessuna | n/a |
| 138 | about.notes | What's new | Every version's notes, newest first | Pill "What's New…" → `search://release-notes` | nessuna | n/a |

**Gruppo "News by email"** (icona `envelope.open`)

| # | id | Etichetta | Riga sotto | Controllo | Chiave |
|---|---|---|---|---|---|
| 139 | news.updates | News by email | Rare emails: useful new features and big updates, nothing else | wide: campo email (segnaposto "you@example.com"), Pill "Join" ("Joining…", "Try again"), suggerimento "Did you mean …?", errori, piccolo testo "Unsubscribe anytime. Your email is used for nothing else." + link "Privacy"; dopo: spunta "You're on the list." + "Add another address" | `optin.joined` (solo bool) |
| 140 | news.iphone | Search for iPhone beta | Ask for the iPhone beta, sent to your email | come sopra, pulsante "Ask", "You've asked for the beta.", "Ask for another address" | `optin.iphoneBeta` (solo bool) |

Invio: un solo POST HTTPS a `https://searchbrowser.app/api/mac-list` o `/ios-beta`, corpo JSON `{email, source:"app-settings", arch:"apple"/"intel"}`, sessione effimera senza cookie, User-Agent "Search", Accept-Language "en"; risposte 200 ok, 400 email non valida, 429 troppi tentativi (`OptIn.swift:111`). Errori: "That doesn't look like an email address.", "Too many tries just now. Wait a few minutes.", "Couldn't reach searchbrowser.app. Try again in a moment.". Su Windows il valore `arch` e la lista lato server vanno concordati (il server oggi conosce solo `apple`/`intel` e una lista "mac").

**Gruppo "Developer"** (icona `hammer`)

| # | id | Etichetta | Riga sotto | (i) | Controllo | Chiave | Default | Off finché lo accendi | Note |
|---|---|---|---|---|---|---|---|---|---|
| 141 | bench | Let a script drive Search | A local socket for testing; its tabs never take over | sì | Switch | `bench` + segno nel portachiavi (`Bench.Consent`) | spento | sì | Se la chiave è `true` ma manca il segno, all'avvio torna spenta. Socket Unix `bench.sock` → su Windows named pipe. |
| 142 | agents | Let coding agents use Search | Claude Code or Codex can ask to browse in tabs of its own, while you watch | sì | Switch + elenco agenti ricordati (`RememberedAgents`: firmatario, ultimo uso, scadenza, Pill "Forget") | `agents` + segno `com.officecommun.search.agents` nel portachiavi | spento | sì | Accendere o spegnere dimentica tutti gli agenti ricordati. |

### 1.13 Conteggi

- Righe nell'indice: **158**. Di queste **142** sono righe visibili nelle sezioni e **16** solo nella ricerca (14 note "Always on" + `autocorrect` e `inlinePredictions`, spostate nel menu Edit › Spelling and Grammar).
- Delle 142 righe: **125** sono impostazioni salvate, **17** sono azioni o moduli (Make default ×2, Bring things over, Delete…, Set Up Like Arc, Bring Over…, New Profile…, Open…, Forget choices, i tre Clear, Updates, Send Feedback, What's New…, i due moduli email).
- Fuori dall'indice: gruppo Proxy (1 impostazione composta), pagina Shortcuts (tutti i tasti), pagina Extensions, liste dinamiche (permessi per sito, siti pop-up, profili, regole spazi, lingue sempre tradotte, agenti ricordati, "Sites never asked", Home page).
- "Off finché lo accendi": **87** righe dell'indice + Proxy + "From Safari apps" (+ `autocorrect` segue il sistema; `inlinePredictions` spento).
- Accese di default: `layout.cards`, Back/Forward/Reload e i tre bottoni del piede visibili, `tabs.sleep` (Normal), `tabs.address`, `links.little` (nuove installazioni), `float.leave`, `pins.home`+`pins.peek`, `passwords.save`, `passwords.fill`, `passkeys`, `shield`, protezione tracciamento (`sites.keep=false`), `privacy.clickIDs`, `privacy.gpc`, `notifications.ask`, `links.peek` (Shift-click), `swipe.history`, `update.install`, `pages.120.mode=onPower`, colonna a sinistra (nuove installazioni), iCloud e Handoff (nuove installazioni, all'uscita dal welcome).

### 1.14 Impostazioni che dipendono dal Mac

Classificate per il porting:
- **Nessun equivalente Windows** (da nascondere o ridefinire): `handoff`, `icloud`, `icloud.erase`, `window.glass.style` (Liquid), `tabs.liquid`, `fullscreen.keepsWindow`, `contacts.fill`, `extensions.safariApps`, `passwords.apple` (salvo esperimento con iCloud per Windows), `translate.target` (serve un motore di traduzione locale portato a mano).
- **Equivalente parziale** (comportamento diverso): `general.default` e `mail.default` (Windows apre solo le Impostazioni di sistema), `window.glass` (Acrylic/Mica, solo Windows 11), `motion.light` (Low Power Mode), `passwords.open` e `passwords.fill.prove` (Windows Hello invece di Touch ID), `inspector.chrome`/`inspector.dark` (DevTools è già Chrome), `pages.120` (Chromium va già a frequenza piena), `sites.keep` (niente ITP), `swipe.history`, `pages.bounce`, `wheel.smooth`, `autocorrect`/`inlinePredictions` (correttore di Chromium; niente predizioni in linea), `launcher.key` (tasto suggerito), `spaces.commandNumbers` e tutti i testi con ⌘ ⌥ ⌃ (vedi rischio tasti), `bench`/`agents` (socket e firma del chiamante), `privacy.clickIDs`/`privacy.gpc`/`privacy.httpsFirst` (su Mac sono funzioni WebKit, su Windows vanno scritte).
- **Testi da adattare**: molte righe nominano "Mac", "macOS", "System Settings ›", "Touch ID", "Finder", "Dock", "Spotlight", "Safari". Serve una decisione unica: testo identico o testo corretto per Windows. Consiglio: tabella di sostituzione centralizzata (Mac → PC, System Settings → Windows Settings, Finder → File Explorer, ⌘ → Ctrl, ⌥ → Alt), applicata al JSON estratto.

### 1.15 Preferenze nascoste (solo chiave, nessuna riga)

| Chiave | Tipo e default | Scopo |
|---|---|---|
| `settings.page` | stringa, `general` | Ultima sezione di Impostazioni aperta. |
| `sidebar.width` | numero, 232 (176..440) | Larghezza colonna. |
| `sidebar.narrowed` | bool | Colonna lasciata come striscia di icone. |
| `sidepanel.width` | numero, 380 (300..640) | Larghezza pannello laterale. |
| `panel.site` | stringa | Ultimo sito nel pannello laterale. |
| `float.frame`, `little.frame` | rettangolo | Posizione della finestra video flottante e della finestrella. |
| `float.flicks` | bool, acceso | Lancio del video in un angolo (nota "always on"). |
| `links.show` | bool, acceso | Indirizzo del link in basso (nota "always on"). |
| `tabs.awakeSites` | array di host | Siti tenuti svegli (dalla scheda del sito). |
| `privacy.popupSites` | array di domini registrabili | Siti autorizzati ai pop-up. |
| `shield.paused` | array di host senza www | Siti dove il blocco è spento. |
| `dusk.sites` | dizionario host → bool | Scelte "Darken This Site" contrarie alla misura. |
| `dusk.mode` | stringa, `colours` | Modo di scurimento. |
| `reader.look` | stringa | Ultima scelta chiaro/scuro del lettore. |
| `translate.always` | array di lingue | Lingue tradotte all'apertura. |
| `links.ask.last` | array | Ultime scelte di spazio per i link esterni. |
| `spaces.links.rules` | array | Regole sito → spazio. |
| `space.current`, `space.current.<id>` | UUID | Spazio corrente per finestra/profilo. |
| `spaces.orderKept`, `spaces.erasing`, `history.spacesSeeded` | vari | Gestione spazi. |
| `sitestyle.width`, `sitestyle.height` | numeri | Dimensione dell'editor stili. |
| `update.checked` | data | Ultimo controllo aggiornamenti. |
| `optin.joined`, `optin.iphoneBeta` | bool | Iscrizioni email (mai l'indirizzo). |
| `iphoneask.dismissed`, `iphoneask.newtab.since` | vari | Inviti alla beta iPhone. |
| `passwords.apple.offered`, `passwords.apple.offer.unanswered`, `passwords.apple.offer.never` | vari | Offerta Apple Passwords. |
| `network.proxy` | JSON | Proxy (password nel portachiavi). |
| `sync.folder`, `icloud.sync`, `icloud.off`, `icloud.default` | vari | Stato sync. |
| `welcomed` | bool | Welcome completato. |
| `sidebar.settled` | bool | Migrazione del default colonna già fatta. |
| `passkeys.for`, `passkeys.entitled` | bool | Tipo di build sotto cui è stata scelta la passkey. |
| `carried`, `manner`, `inspector`, `mind.*` | legacy | Migrazione da "Office Browser", vecchie chiavi rimosse all'avvio. |
| `shortcuts` | JSON | Tasti cambiati. |
| `import.records` | JSON | Cosa è arrivato da quale browser. |
| `extensions.*` (`extensions.granted.<id>`, `extensions.private.<id>`, `extensions.newtab.<id>`, `extensions.settings.<id>`, `extensions.kept.<id>`, `extensions.workers`, `extensions.checked`, `extensions.retry`, `extensions.failures`, `extensions.forgetting`, `extensions.credentialedFetch`) | vari | Stato estensioni. |
| `ai.told.<provider>` | bool | Sezione AI nascosta. |
| `sleep.after`, `close.after` | numeri | Solo per test e misure. |
| `test.youtubeHosts`, `test.redditHosts`, `test.claudeHosts`, `suggest.testURL` | vari | Solo in un mondo di test. |
| `WebAutomaticSpellingCorrectionEnabled`, `NSAutomaticInlinePredictionEnabled` | bool, in `UserDefaults.standard` | Letti da WebKit/AppKit per autocorrezione e predizioni. |

### 1.16 Preferenze per sito

Tutte nello stesso file di impostazioni:
- `capture.<origine>|<tipo>` → bool (true consentito, false rifiutato). `<origine>` = `scheme://host[:porta]` (porta omessa se standard). `<tipo>`: `0` camera, `1` microfono, `2` camera e microfono (valori raw di `WKMediaCaptureType`), `location`, `notifications`. Per i media si scrivono entrambe le grafie con e senza porta standard (`CaptureChoices.swift:32`). Un'estensione è salvata come `chrome-extension://<id>`.
- `autoplay.<host>` → true se il sito può suonare da solo ("Play Sound by Itself"); spento = chiave rimossa (`Tab.swift:216`).
- `zoom.<host>` → zoom del sito; al valore di partenza la chiave viene rimossa (`Tab.swift:570`).
- `nofloat.<host>` → "Don't Float Videos Here" (`Float.swift:1022`).
- `shield.paused`, `dusk.sites`, `tabs.awakeSites`, `privacy.popupSites` (vedi sopra).
- In memoria soltanto (mai su disco): certificati client scelti (per avvio), certificati non validi accettati (per avvio, `Dialogs.excused`), pop-up consentiti in una scheda privata, siti dove un `print()` è stato annullato due volte.

### 1.17 Default per installazioni nuove e migrazioni

- `SyncDefault.settle` (`SyncDefault.swift`), `SidebarDefault.settle` (`Prefs.swift:102`), `Preferences.settleLittleLinks` (`Prefs.swift:845`): alla prima esecuzione si decide "nuova installazione" o "già usato" guardando tracce (`welcomed`, `glyph`, `passkeys.for`, file `session.json`/`windows.json`/`pins.json`…). Nuova: colonna a sinistra, link esterni in finestrella, iCloud e Handoff accesi all'uscita dal welcome. Su Windows ogni installazione è nuova: applicare direttamente quei default (tranne iCloud/Handoff).
- Lettura "a caldo" del file impostazioni (`Prefs.swift:1502`): una modifica esterna (es. `defaults write`) aggiorna subito solo le impostazioni d'aspetto (look, tema home, layout colonna, larghezze, card, barra indirizzo, vetro, liquid, bounce, glyph, give, click address, instant motion, numeri schede, ⌘ sugli spazi, segnalibri, bottone download). Privacy, sicurezza, password ed estensioni valgono solo al riavvio. Windows: `fs.watch` sul JSON, stessa lista bianca.
- Chiavi scritte solo quando cambiate: un default non scrive nulla, così un default nuovo in futuro arriva a chi non ha mai toccato la riga.

---

## 2. Privacy e blocco

### 2.1 Shield (blocco annunci e tracker)

Mac (`Shield.swift`): una `WKContentRuleList` compilata all'avvio (identificatore `office-shield-<sha256 del JSON>`, le vecchie vengono rimosse), applicata da WebKit prima di ogni richiesta. Regole, nell'ordine:
1. Blocco di 52 domini di terze parti (solo `load-type: third-party`), filtro `^https?://([^/]+\.)?<dominio>[:/]` (`Shield.swift:113`): doubleclick.net, googlesyndication.com, googleadservices.com, googletagservices.com, google-analytics.com, googletagmanager.com, adservice.google.com, amazon-adsystem.com, adnxs.com, adsrvr.org, criteo.com, criteo.net, taboola.com, outbrain.com, rubiconproject.com, pubmatic.com, openx.net, casalemedia.com, smartadserver.com, sharethrough.com, indexww.com, bidswitch.net, 33across.com, teads.tv, moatads.com, adroll.com, scorecardresearch.com, quantserve.com, chartbeat.com, hotjar.com, mouseflow.com, fullstory.com, clarity.ms, mixpanel.com, amplitude.com, segment.com, segment.io, branch.io, appsflyer.com, adjust.com, analytics.tiktok.com, connect.facebook.net, ads-twitter.com, analytics.twitter.com, intergient.com, btloader.com, ad-delivery.net, mentorsticks.com, dns-finder.com, confiant-integrations.net, cloudflareinsights.com.
2. CSS `display:none` ovunque per gli slot pubblicitari (`Shield.swift:141`): `.adsbygoogle`, `ins.adsbygoogle`, `[id^="google_ads_"]`, `[id^="div-gpt-ad"]`, `[id^="taboola-"]`, `#taboola-below-article`, iframe con src doubleclick/googlesyndication/amazon-adsystem, `.ad-slot`, `.ad-slot-container`, `.top-banner-ad-container`, `.ad-leaderboard`, `.ad-billboard`, `.ad-giga`, `.ad-mpu`, `.ad-mrec`, `.ad-unit`, `.adunit`, `.adslot`, `.dfp-ad`, `.gpt-ad`, `.w_ad`.
3. Regole YouTube (§2.2).
4. CSS per sito (`Shield.swift:153`): as.com ed elpais.com `.ad`; theguardian.com `.top-fronts-banner-ad-container`; independent.co.uk e the-independent.com `#billboard-wrapper`; cnn.com `.ad-slot-header__wrapper`; albumoftheyear.org `.headerAd, .homePageAdSquare`.
5. Reddit (`*reddit.com`): `shreddit-ad-post`, `shreddit-comments-page-ad`, `shreddit-sidebar-ad`, `shreddit-dynamic-ad-link`, `comment-tree-ad`, `.promotedlink`.

Comportamento: acceso di default; pausa per sito (host senza www) dalla scheda del sito, la pagina si ricarica; mai nelle schede private come opzione per sito (la pausa non si salva lì); il primo caricamento all'avvio aspetta la lista al massimo 1 s; un errore di compilazione appare in Impostazioni con "Try again". Nessun contatore, nessuna icona.

Windows:
- Electron permette **un solo** listener per evento `webRequest` per sessione: Shield, click ID, HTTPS first, GPC e YouTube vanno in un unico dispatcher per sessione (e per ogni partizione di spazio/profilo/privata).
- Blocco: `session.webRequest.onBeforeRequest` con le stesse regex; "terza parte" = dominio registrabile della richiesta diverso da quello del frame principale (`details.frame`/`webContents.getURL()`), con lista dei suffissi pubblici (`tldts` o `psl`). Non usare EasyList intera né `@ghostery/adblocker-electron`: il comportamento non sarebbe più identico.
- CSS: iniettato a inizio documento in ogni frame (preload con `nodeIntegrationInSubFrames: true` che aggiunge uno `<style>`, il mondo isolato non è soggetto alla CSP della pagina) oppure `webContents.insertCSS` per il frame principale. La pausa per sito si decide alla navigazione, come sul Mac.
- Il "trouble" di compilazione non esiste più: mantenere la riga d'errore per identità solo se serve.

### 2.2 YouTube

Mac (`YouTubeAds.swift`), solo su youtube.com, www, m., music., youtube-nocookie.com, www.youtube-nocookie.com e solo con Shield acceso e non in pausa:
- Regole di rete: blocco su YouTube di `/api/stats/ads`, `/pagead/`, `/ptracking`, `/get_midroll_info`, `/youtubei/v1/player/ad_break`, `/pcs/activeview`, `/api/stats/qoe?…adformat=`; da pagine YouTube anche `google.com/pagead/` e `imasdk.googleapis.com/`; eccezione `ignore-previous-rules` per `static.doubleclick.net/instream/ad_status.js`.
- Script nel mondo della pagina, a inizio documento, in tutti i frame: avvolge `JSON.parse`, `Response.prototype.json`, `fetch`, `XMLHttpRequest.open/send`, `navigator.sendBeacon`, e i setter di `ytInitialPlayerResponse`/`ytInitialData`; toglie `adPlacements`, `adSlots`, `playerAds`, `adBreakHeartbeatParams` dalle risposte "a forma di YouTube"; protegge `playabilityStatus`/`videoDetails` dal muro anti-blocco; risponde 200 vuoto alle richieste di test anti-blocco; su `/watch` riavvia una volta il primo video con `loadVideoById` se era stato trattenuto a 0:00.
- Script nel mondo di Search: se un annuncio passa comunque (`.ad-showing`), il video va muto a 16× e poi torna com'era.

Windows: le regole di rete nel dispatcher unico; lo script di pagina va eseguito nel **mondo principale prima degli script della pagina**: dal preload con `contextBridge.executeInMainWorld` (Electron recenti) o `webFrame.executeJavaScript`, anche nei sottoframe; lo "skipper" nel preload (mondo isolato). Rischio: YouTube cambia spesso; su Chromium il comportamento del player non è garantito identico a WebKit.

### 2.3 Click ID, Copy Clean Link, GPC, HTTPS first

- **Remove click trackers** (`Privacy.swift:64`): sul Mac è la funzione WebKit `FilterLinkDecorationByDefaultEnabled` (lista di sistema WebPrivacy), sempre attiva nelle schede private. Windows: in `onBeforeRequest` per `mainFrame` (e `subFrame`) redirect all'URL ripulito; lista consigliata = `CleanLink.tracking` senza `utm_` (fbclid, gclid, dclid, gbraid, wbraid, msclkid, yclid, twclid, ttclid, mc_eid, igshid, igsh, _hsenc, _hsmi, mkt_tok), mai su URL firmati (`x-amz-signature`, `x-goog-signature`, `signature`, `sig`). Il sorgente ammette che le due liste (rete e copia) differiscono: su Windows conviene una sola lista.
- **Copy Clean Link** (`CleanLink.swift`): menu Edit, tasto ⌥⇧⌘C (`Shortcuts.swift:237`), anche sotto "Copy Link" nel menu contestuale dei link e nel menu della scheda; toglie `utm_*` e la lista sopra, `si` solo su youtube.com, youtu.be, spotify.com; lascia ordine, codifica e `#`. Annuncio "Clean link copied". Portabile 1:1 (pura manipolazione di testo).
- **GPC** (`Privacy.swift:32`): `Sec-GPC: 1` su ogni richiesta e `navigator.globalPrivacyControl` vero; sempre nelle private. Windows: `onBeforeSendHeaders` aggiunge l'header; il preload definisce `navigator.globalPrivacyControl` nel mondo principale.
- **HTTPS first** (`Privacy.swift:117`): navigazione principale http tentata in https e, se fallisce, di nuovo in http senza avvisi; esclusi localhost, *.localhost, *.test, *.local, IP, nomi di una parola. Windows: redirect in `onBeforeRequest` + su `did-fail-load` (errori di connessione/TLS) ricaricare in http e ricordare l'host per la sessione. Chromium ha un "HTTPS-First Mode" ma con pagina di avviso e non esposto da Electron.

### 2.4 Prevent cross-site tracking

Mac (`Store.swift:64`): acceso = ITP di WebKit attivo (`_setResourceLoadStatisticsEnabled`) e cookie solo dal dominio principale; spento = ITP spento e cookie sempre accettati, come Chrome. In più `document.requestStorageAccess` in un frame chiede all'utente con una card ("<dominio> wants to use its cookies and website data on <sito>, which also lets it see you were there", `Browser.swift:9535`).

Windows: Chromium non ha ITP. Acceso = bloccare i cookie di terze parti (togliere `Cookie`/`Set-Cookie` per le richieste di terza parte nel dispatcher, più `document.cookie` nei frame di terza parte via preload) e gestire `storage-access` nel `setPermissionRequestHandler` con la stessa card. La cancellazione dopo 7 giorni senza interazione di ITP non ha equivalente: differenza dichiarata. Rischio di rompere accessi (Teams/SharePoint).

### 2.5 Pop-up bloccati

Mac (`BlockedPopups.swift`, `PopupGesture.swift`): una pagina può aprire una finestra solo entro 5 s da un clic o tasto reale (eventi `isTrusted` registrati da uno script nel mondo di Search, uno per interazione; il tasto centrale apre dietro). Le finestre rifiutate (massimo 5 per scheda, una per indirizzo) accendono un segno accanto al titolo della scheda (simbolo `rectangle.on.rectangle.slash`, aiuto "Pop-up blocked" / "<n> pop-ups blocked"); il clic apre un popover largo 290 con "Pop-up blocked", righe "Open <host+percorso>" (solo http/https) e "Always Allow Pop-ups from <sito>" (in privata: "Allow Pop-ups from <sito> in This Tab", aiuto "Only until this private tab closes" / "Settings › Privacy lists the sites you allow"). Consentire vale per il dominio registrabile e solo per la pagina e i frame dello stesso sito; si elenca in Impostazioni › Privacy.

Windows: Electron **non** include il popup blocker di Chrome (sta nello strato chrome/): `window.open` senza gesto si apre. Serve ricostruire `PopupGesture` (preload che registra eventi fidati e li manda al main con `event.senderFrame`) e decidere in `webContents.setWindowOpenHandler` (`action: 'deny'` + nota nella lista della scheda). Da verificare se l'handler riceve l'informazione del gesto; se no, correlare con l'ultimo gesto del frame.

### 2.6 Permessi per sito

Richieste gestite (`Browser.swift:9340` e seguenti):
- **Camera / microfono / entrambi**: ricordati per origine (mai in privata); una richiesta combinata con un dispositivo già consentito chiede solo l'altro. Un'estensione è nominata come tale e ricordata per sé, mai per il sito che la ospita. Le schede di un agente sono sempre rifiutate.
- **Schermo**: card grande (`ScreenQuestion`, `PageQuestions.swift:65`): "<sito> wants to share your screen" (o "…and your Mac's sound"), pulsanti "Don't allow", "Share a Screen", "Share a Window" (filled); poi il selettore di macOS.
- **Posizione**: solo la scheda in primo piano e solo per l'origine della pagina; card con "Allow once", "Always allow", "Don't allow"; provider CoreLocation messo solo dopo il sì (`SiteLocation.swift`).
- **Notifiche**: solo se `notifications.ask` è acceso, mai in privata, solo origine della pagina.
- **Storage access**: vedi §2.4, non ricordato da Search (lo tiene WebKit).
- **Pointer lock**: vedi §3.5.
- Card comune (`CaptureQuestion`, `PageQuestions.swift:4`): capsula con angoli 20, icona (location, mic, bell, person.crop.circle, video), testo "<sito> wants to use your <cosa>" / "wants to know your location" / "wants to send you notifications", pulsanti "Allow" o "Allow once" (filled), "Always allow" (solo posizione), "Don't allow". Ignora i clic nel primo mezzo secondo (anti-clickjacking). Una domanda alla volta; una seconda è rifiutata. Le domande di una scheda dietro aspettano che ci si vada. Cambiare scheda rifiuta la domanda.
- Dove si cambiano: scheda del sito › "Site Permissions" (menu Ask, Allow, Refuse per Camera, Microphone, Location, Notifications; note "Permissions aren't saved in a private tab.", "Notifications are off in Settings › Privacy.", "Saved two ways for this site. Pick one to keep.") e Impostazioni › Privacy (§1.8). Rifiutare camera/microfono ferma subito le catture attive del sito.

Windows: `session.setPermissionRequestHandler` (permessi `media` con `details.mediaTypes`, `geolocation`, `notifications`, `pointerLock`, `storage-access`, `display-capture`…) + `setPermissionCheckHandler` (perché `Notification.permission` e `navigator.permissions.query` rispecchino le scelte salvate) + `setDisplayMediaRequestHandler` con un **selettore proprio** costruito su `desktopCapturer.getSources` (su Windows non c'è il selettore di sistema; `audio: 'loopback'` per il suono). Fermare una cattura attiva: nessuna API, serve uno script che tenga traccia degli stream. Stesse chiavi `capture.*` per compatibilità.

### 2.7 Proxy

Mac (`Proxy.swift`): HTTP CONNECT o SOCKS5, applicato a ogni `WKWebsiteDataStore` (spazi, profili, private) e a ogni `URLSession` di Search (favicon, Copy Image, suggerimenti, estensioni, Web Store, AI, aggiornamenti); esclusi localhost, 127.0.0.1, ::1, .local; nessun ripiego diretto se il proxy non risponde; password nel portachiavi (servizio `com.officecommun.search.proxy`, account `global`, solo questo dispositivo, cancellata quando il proxy si spegne). WebRTC (UDP) non passa dal proxy: detto nel testo.

Windows: `session.setProxy({proxyRules: 'http://host:port'` oppure `'socks5://host:port'`, `proxyBypassRules: '<local>;localhost;127.0.0.1;[::1];*.local'})` su ogni partizione, e `net`/`session.fetch` del main per le richieste proprie; credenziali proxy HTTP con l'evento `app.on('login')` (`authInfo.isProxy`). **Rischio**: Chromium non supporta l'autenticazione utente/password per SOCKS5; il campo utente con SOCKS5 non può funzionare identico. Vantaggio: `webContents.setWebRTCIPHandlingPolicy('disable_non_proxied_udp')` chiude la falla WebRTC che sul Mac resta. Password: `safeStorage` (DPAPI) o Credential Manager.

### 2.8 Certificati client

Mac (`ClientCertificates.swift`): alla richiesta di un certificato client, nessuna domanda se c'è una preferenza di identità nel portachiavi; altrimenti identità valide filtrate per le autorità indicate dal sito; foglio "<host> asks for a certificate" / "Choose the certificate to identify yourself to this site. It is sent only if you continue." con menu delle identità ("<nome> \u2014 issued by <emittente>, expires <data>") e Continue/Cancel. Scelta ricordata per avvio e per store (privata: per scheda). Annullato una volta, la pagina non chiede più finché non si naviga. Mai nelle schede degli agenti. Catena intermedia allegata.

Windows: `app.on('select-client-certificate', (e, wc, url, list, cb) => …)` riceve i certificati dallo store di Windows; foglio proprio con gli stessi testi. La "preferenza di identità" del portachiavi non esiste (Chromium ha la policy `AutoSelectCertificateForUrls`).

### 2.9 Certificati server e accessi HTTP

- Certificato non valido (`Dialogs.swift:269`): localhost e 127.x accettati; altrimenti, solo per la pagina principale, avviso "<host> can't prove who it is" / "Its certificate isn't trusted by this Mac. Someone could be reading what you send. Continue only if you know why it looks like this." con "Go Back" e "Continue Anyway"; accettazione per host + SHA-256 del certificato, solo per l'avvio; le risorse secondarie non valide non si caricano. Windows: `app.on('certificate-error')`.
- Autenticazione HTTP Basic/Digest/NTLM (`Dialogs.swift:319`): "<host> asks you to sign in", realm tra virgolette o "The site wants a name and a password.", al secondo tentativo "That wasn't accepted \u2014 try again.", campi "Name" e "Password", "Sign In"/"Cancel"; dopo due errori annulla. Windows: `webContents.on('login')`.

---

## 3. Download, notifiche, media, dialoghi

### 3.1 Flusso di download

Mac (`Browser.swift:9806`, `Fetching.swift`, `Loot.swift`):
- Origini: navigazione che diventa download, "Download Linked File" del menu, pulsante download del visore PDF (dati salvati direttamente), "Download Image", estensioni (`chrome.downloads`, con sottocartelle "photos/2026/a.jpg" create dentro Download, mai fuori).
- Destinazione: cartella scelta, oppure pannello di salvataggio se "Ask where to save" o se la cartella non è scrivibile; nome = ultima parte del nome suggerito (mai un percorso), "download" se vuoto; collisione → "nome 2.ext", "nome 3.ext" (non "(1)" come Chrome).
- Un download in una scheda privata non entra mai nella lista, solo un annuncio "Saved <nome>"; un errore privato cancella il file parziale.
- Una scheda vuota aperta da un link che si rivela un file si chiude e torna alla pagina d'origine.
- Annunci: "Downloading <nome>", "Saved <nome>" (cliccabile), "Download failed", "Download finished".
- Pausa/ripresa/riprova (solo GET/HEAD senza corpo), annulla; i dati di ripresa vivono solo in memoria.
- File scritti da Search (PDF, Save Page As) marcati in quarantena come download.
- Le schede degli agenti non scaricano mai.

Windows: `session.on('will-download', (e, item) => item.setSavePath(...))` con la stessa logica di nome; `item.pause/resume/cancel`, `item.canResume`, `session.createInterruptedDownload` per riprendere; `webContents.downloadURL` per "Download Image". Mark of the Web: verificare che Electron scriva `Zone.Identifier`; altrimenti scriverlo noi.

### 3.2 Interfaccia dei download

- **Bottone** (`FetchDoor`, `Fetching.swift:658`): 26×26, angoli 8; a riposo `arrow.down.circle`; durante un download un anello che si riempie (o gira se la dimensione è ignota); a fine una freccia `arrow.down` per un momento; all'avvio di un download l'icona si gonfia a 1.35 e torna. Visibile durante i download, con elementi in lista, con "Always show", o mentre il popover è aperto. Aiuto "Downloads" con il tasto ⇧⌘J.
- **Dove si apre** (`Browser.swift:1864`): scheda `search://downloads` ("Downloads", piastra larga 560), card flottante accanto al bottone (`DownloadsFloat.swift`), o pannello laterale. ⇧⌘J e il menu "Downloads…" mostrano sempre; il bottone apre/chiude.
- **Contenuto** (`Recall.swift:272`): vuoto "Nothing downloaded yet."; sezioni "Current downloads" e "Completed" in Card. Riga in corso: icona di stato, nome (troncato in mezzo), barretta 68×3, "Downloading · 3 MB of 10 MB" (stati Downloading, Pausing…, Cancelling…, Paused, Resuming…, Failed), errore sotto, pulsanti "Pause", "Cancel", "Resume", "Retry" (aiuto "Start the download again from the beginning"), "Remove". Riga completata: nome, "<host> · <quando>", "Show in Finder" (se il file c'è ancora), "Remove" rosso; menu contestuale "Copy Address". Piede: "Files land in <cartella>" o "Clearing the list leaves the files where they are" + Pill "Clear list". Versione compatta: titolo "Downloads", pulsante cartella (aiuto "Open the Downloads Folder"), chiudi. Lista massimo 50 voci, in `downloads.json`; "Clear History" toglie gli indirizzi d'origine.
- **Dock e Finder**: il progresso è pubblicato come `NSProgress` sul file (barra sotto il file nel Finder e nella pila Download del Dock, annullabile da lì); a fine notifica distribuita `com.apple.DownloadFileFinished` (la pila Download rimbalza) (`Fetching.swift:381`, `Fetching.swift:516`). Nessun badge sull'icona.

Windows: barra applicazioni con `BrowserWindow.setProgressBar(frazione)` (modalità `indeterminate` senza dimensione, `paused`, `error`) sommando i download attivi; `win.flashFrame(true)` a fine come "rimbalzo"; opzionale `setOverlayIcon`. Nessun equivalente del progresso sul file in Esplora file. "Show in Finder" → `shell.showItemInFolder` (testo da decidere: "Show in File Explorer" o identico).

### 3.3 Notifiche

Mac (`Notifications.swift`): permesso per origine (card §2.6, chiavi `capture.<origine>|notifications`); alla prima concessione macOS chiede il permesso per Search. Le notifiche dei service worker arrivano dal delegate privato dello store, quelle di pagina (`new Notification`) da un provider C di WebKit cercato per nome. Pubblicate con titolo, corpo, sottotitolo = sito senza www, icona del sito allegata, suono, raggruppate per origine, `tag` sostituisce; mostrate anche con Search in primo piano. Clic: porta avanti la scheda che l'ha inviata (o una dello stesso store/profilo, mai privata), poi `notificationclick` al worker; chiusura → `notificationclose`. Con l'interruttore spento nessuna notifica, nemmeno dei siti già consentiti. Mai nelle private. Un test non pubblica nulla.

Windows: `app.setAppUserModelId` + collegamento nel menu Start con AUMID (obbligatorio per i toast con installer NSIS). Chromium in Electron mostra già le notifiche web come toast, ma senza controllo su clic e scheda: per avere lo stesso comportamento sovrascrivere `window.Notification` e `ServiceWorkerRegistration.prototype.showNotification` nel mondo principale e pubblicare con `new Notification()` del main (titolo, corpo, icona del sito; il "sottotitolo" diventa testo di attribuzione nel `toastXml`). Push API non disponibile in Electron (come in WKWebView): parità.

### 3.4 Dialoghi della pagina

Mac (`Dialogs.swift`): `alert`/`confirm`/`prompt` come fogli di sistema sulla finestra, titolo = host del frame che chiede (mai il testo della pagina) o "This page says"; OK/Cancel; `prompt` con campo 260 pt. Una domanda di una scheda dietro aspetta che ci si vada; scheda chiusa = risposta "annullato". In Split View la domanda va sopra la sola pagina che chiede (`PaneQuestionCard`, `SplitView.swift:365`). Selettore file: pannello di apertura "Choose a file for <host>" (o "Choose a file for this page"), cartelle e selezione multipla secondo la pagina; mai nelle schede degli agenti. `beforeunload`: nessun gestore, quindi la pagina si lascia senza chiedere (comportamento WKWebView). `print()` della pagina: solo scheda in primo piano della finestra attiva, un foglio alla volta; due annullamenti in 10 s bloccano quel sito fino a un cambio di sito (`Browser.swift:10016`). Link a schemi esterni: "Open “<app>”?" / "<host> wants to open <app>." con Open/Cancel; `mailto` con webmail: "Write an email in “<webmail>”?" / "<host> wants to start an email." con Write/Cancel; `mailto`/`tel` cliccati vanno all'app senza domanda (`Browser.swift:8791`).

Windows: Electron mostra `alert`/`confirm` con finestre proprie bloccanti e **non supporta `prompt()`**: sovrascrivere i tre nel mondo principale con IPC sincrono verso il main e disegnare i fogli con titolo = host. `will-prevent-unload`: chiamare sempre `event.preventDefault()` (senza gestore Electron **impedisce** la chiusura, al contrario del Mac). Selettore file: Electron apre da sé il pannello di sistema per `<input type=file>` e non offre un aggancio per il messaggio "Choose a file for <host>" né per rifiutarlo nelle schede degli agenti: accettare la differenza, oppure intercettare dal preload il clic sull'input e aprire `dialog.showOpenDialog` dal main (poi riempire l'input via CDP `DOM.setFileInputFiles`). Schemi esterni: `shell.openExternal` dopo la stessa domanda.

### 3.5 Media

- **Video flottante** (`Float.swift`, `NativePiP.swift`): "Search's window" = la vista web intera spostata in una finestrella sempre in primo piano, con la pagina resa invisibile tranne il video (nessun clic richiesto, la pagina resta viva); "Picture in picture" = PiP di WebKit (preferenza privata `_setAllowsPictureInPictureMediaPlayback`), script che sceglie il video più grande che suona. ⇧⌘P ("Float Video") a mano. Fuoriuscita automatica cambiando scheda o app (`float.leave`/`float.away`), tranne siti "Don't Float Videos Here". Windows: per "Search's window" spostare la `WebContentsView` in una `BrowserWindow` senza cornice `alwaysOnTop` (le viste si possono spostare tra finestre); per "Picture in picture" `requestPictureInPicture()` eseguito con `executeJavaScript(code, true)` (gesto utente).
- **Tasti multimediali** (`MediaKeys.swift`): WebKit tiene i tasti play/pausa anche dopo la pausa; dopo 10 s di silenzio Search mette muti i media in pausa che avevano suonato (e toglie il muto alla ripresa) così macOS ridà i tasti a Spotify/Musica; lo stesso script dice se un video suona (per il video flottante). Windows: Chromium usa SMTC tramite Media Session; il problema potrebbe non esistere o comportarsi diversamente. Da misurare prima di portare il trucco; la parte "un video suona" serve comunque.
- **Riga player** (`Player.swift`): con `sidebar.player`, al piede della colonna la scheda più recente che suona fuori vista: icona, titolo, pausa/play, x "Put Away" dopo una pausa; clic sulla riga = va alla scheda (aiuto "Go to the tab"). Pausa = script che ferma e ricorda i media. Windows: eventi `audio-state-changed`/`media-started-playing`/`media-paused` + `executeJavaScript` nel mondo isolato.
- **Autoplay**: globale "Videos wait for a click" e per sito "Play Sound by Itself" (preferenza privata WebKit per pagina: 1 consenti, 2 consenti senza suono, 3 nega; `Tab.swift:216`). Windows: `autoplayPolicy` è fissata alla creazione della `WebContents`; per sito e per "nessun autoplay nemmeno muto" serve uno script nel mondo principale (rischio di differenze).
- **LiveRate** (`LiveRate.swift`): trucco per un difetto di CoreMedia (salti dei live a velocità 1.0); non serve su Chromium.
- **Indicatore di registrazione** (`RecordingIndicator.swift`): pillola in basso al centro dello schermo, sopra tutto e su tutti gli spazi, mai attiva, "● <Estensione> is recording your screen" / "is using your camera and microphone" / "is using your camera" / "is using your microphone" + "Stop"; le schede che catturano hanno un segno. Riguarda le estensioni che registrano (anche documenti offscreen). Windows: `BrowserWindow` senza cornice `focusable:false`, `alwaysOnTop('screen-saver')`, `setVisibleOnAllWorkspaces`; dipende dal supporto estensioni.
- **Pointer lock** (`PointerLock.swift`): concesso solo alla scheda in primo piano, mai agli agenti, solo entro 5 s da un input reale nella pagina; pillola "Press Esc to show your pointer" (tasto disegnato come tasto) per 3 s, annunciata a VoiceOver; Esc va sempre alla pagina. Windows: permesso `pointerLock` + pillola nostra (Electron non mostra la bolla di Chrome).

---

## 4. Aggiornamenti automatici

**Mac: niente Sparkle.** Sistema proprio (`Updater.swift`):
- Feed: `https://officecommun.com/search/appcast.json` (Apple silicon) e `https://officecommun.com/search/intel/appcast.json` (Intel). Si legge `appcast.json.zip`, che contiene il JSON con **firma di codice** Developer ID (team `7BYKA895MC`, identificatore `com.officecommun.search.appcast`); il JSON in chiaro è solo per build vecchie (`Updater.swift:376`).
- Campi: `version`, `build`, `url` (ZIP), `dmg`, `sha256`, `dmgSha256`, `notes`, `minimumSystemVersion`, `ai.engine` (versione, url, sha256, size). Gli URL devono essere https e sullo stesso host del feed.
- Frequenza: all'avvio, poi un timer ogni 60 min (tolleranza 5) che controlla se sono passati più di 50 min (`Updater.swift:133`). Il README dice "Once a day": il codice dice ogni ora (il testo in Impostazioni dice "every hour").
- Canali: uno solo (stabile), separato per architettura. Nessuna beta per Mac.
- Installazione (`Updater.swift:429`): scarica lo ZIP via sessione con proxy, verifica SHA-256 obbligatorio, estrae con `ditto`, controlla bundle id, build maggiore, firma stretta Developer ID dello stesso team, poi due rinomine (vecchio → `.old`, nuovo al suo posto); il vecchio viene cancellato all'uscita o al prossimo avvio. Niente riavvio automatico.
- Stati: `none`, `fetching`, `ready` ("Relaunch now"), `offered` (non si può scambiare, es. cartella non scrivibile: si offre il DMG, scaricato e verificato da Search, poi aperto), `waiting` (installazione automatica spenta: "Install").
- Messaggi nella riga in basso: "Checking for updates…", "Search is up to date", "Search <v> is downloading…", "Search <v> is ready \u2014 it's there the next time you open it", "Search <v> is ready \u2014 relaunch to use it", "Search <v> is out \u2014 choose Install Update in the Search menu", "Search <v> is out \u2014 choose Download Update in the Search menu", "Downloading Search <v>…", "That download didn't check out \u2014 get Search from searchbrowser.app".
- Menu Search: "Check for Updates…" ("Checking for Updates…"), "Install Update", "Restart to Update", "Download Update…" ("Downloading Update…") (`App.swift:2177`).
- Riavvio: una shell aspetta la fine del processo e riapre il bundle.
- Non tocca dati, impostazioni, portachiavi.

**Windows, equivalente consigliato:**
- Installer NSIS per utente (nessun UAC, cartella sempre scrivibile, così lo stato `offered` diventa raro) con `electron-updater`, provider `generic` su `https://officecommun.com/search/windows/` (feed `latest.yml` con sha512). `autoDownload = (update.install)`, `autoInstallOnAppQuit = true` (= "ready, alla prossima apertura"), `quitAndInstall()` per "Relaunch now", `downloadUpdate()` per "Install". Timer orario come sul Mac.
- Fiducia: firma Authenticode dell'installer verificata da `electron-updater` (`publisherName`); il feed YAML non è firmato: per avere la stessa garanzia del Mac (feed firmato) aggiungere una firma Ed25519 del feed verificata con una chiave pubblica incorporata.
- Architetture: x64 e arm64, due feed come Apple/Intel.
- Stato `offered`: scaricare l'installer, verificarne hash e firma, aprirlo.
- Messaggi e voci di menu identici, con "Search menu" da rendere (su Windows non c'è il menu app: menu "Search" nella barra o nel menu hamburger).

---

## 5. Scheda sito, ispettore, menu immagini, condivisione

### 5.1 Scheda del sito (`SiteCard.swift`)

Si apre cliccando la scheda attiva (mentre l'indirizzo è in modifica) o da "Site Information…"; finestrella figlia che non prende mai la tastiera, sotto il campo, lo segue mentre la riga si sposta, sparisce appena si digita. Disegnata come un menu di sistema. Righe:
1. Intestazione: sito senza www.
2. Connessione (sottomenu): "Connection is secure" / "Connection is not secure" / "Parts of this page are not secure"; un passo dentro: titolo, spiegazione ("Your information (for example, passwords or credit card numbers) is private when it is sent to this site." ecc.), "Show Certificate…" o "Show Certificate (Not Valid)…" (pannello certificato di sistema), "Back".
3. "Copy Address" con tasto; separatore; "Print…" con tasto.
4. "Zoom": − / percentuale (clic = Actual Size) / +.
5. "Block Ads and Trackers" (switch; aiuto "Turn off here if the site breaks; the page reloads"), solo Shield acceso, senza errori, non privata, http/https.
6. "Site Permissions" (sottomenu, §2.6), solo http/https.
7. "Play Sound by Itself" (switch; dopo il cambio "from the next page"), non privata e "Videos wait for a click" spento.
8. "Don't Float Videos Here" (switch), solo siti video noti e fluttuazione automatica accesa.
9. "Darken This Site" con il tasto (⇧⌘D), solo con Darken attivo.
10. "Keep This Site Awake" (switch; aiuti "Prevents sleep and automatic closure, even when memory is low. You can still close the tab." / in privata "Only in this private tab, until it closes. Uses more memory.").

Windows: finestra figlia senza cornice `focusable:false` oppure overlay nella finestra. Il certificato del server non è esposto da Electron per le pagine valide: raccoglierlo con `session.setCertificateVerifyProc` (per host) e mostrarlo scrivendo un `.cer` temporaneo aperto con `shell.openPath` (Windows apre il suo visualizzatore) o con un modulo nativo (`CryptUIDlgViewContext`). "Parts of this page are not secure": nessun evento in Electron, ricavarlo dalle richieste http del dispatcher.

### 5.2 Ispettore (`Inspector.swift`)

Web Inspector di WebKit per la scheda attiva, via API private: ⌥⌘I "Web Inspector", ⌥⌘J "JavaScript Console", ⌥⌘C "Inspect Element" (`Shortcuts.swift:263`); "Inspect Element" anche dal menu della pagina. Due opzioni di aspetto (§1.2). Windows: `webContents.openDevTools()`, `inspectElement(x,y)`, console aprendo il pannello; tasti Ctrl+Shift+I/J/C.

### 5.3 Menu delle immagini (`ImageMenu.swift`)

Su un'immagine che non è anche un link (e senza estensioni con voci di menu), il menu di WebKit è sostituito da quello di Search: "Open Image in New Tab", "Open Image in Split View" (se possibile), separatore, "Copy Image" (scarica i byte senza cookie né cache e li copia come immagine vera; le immagini `blob:` sono lette nella pagina; limiti 50 MB e 100 Mpx; "Image copied" / "Couldn't copy that image"), "Download Image" (`startDownload`), separatore, "Copy Image Address". Su un'immagine-link resta il menu di WebKit, ma le sue "Copy Image" e "Download Image" passano da Search.

**"Add Image to Photos" non c'è** nel sorgente 1.0.19 (nessuna occorrenza). Esiste solo in una build modificata (ramo della PR #1455, chiusa), non in questo repository. Se va riportata su Windows: salvare l'immagine nella cartella Immagini o in una sottocartella e aprirla con l'app Foto (`ms-photos:`), da definire.

Windows: in Electron non c'è nessun menu contestuale predefinito: l'evento `context-menu` dà `mediaType`, `srcURL`, `linkURL`, coordinate; il menu intero (link, testo, campi, immagini) va costruito da zero. `webContents.copyImageAt(x, y)` funziona bene in Chromium; `webContents.downloadURL(srcURL)`.

### 5.4 Condivisione (`Sharing.swift`)

File › "Share…" apre il selettore di condivisione di macOS (`NSSharingServicePicker`) ancorato in alto a destra della pagina. Windows: nessuna API Electron; modulo nativo con `IDataTransferManagerInterop::ShowShareUIForWindow` (Windows 10+).

### 5.5 Altre funzioni di pagina

- **Cerca in un sito** (`SiteSearch.swift`): 16 siti predefiniti (Google, Reddit, YouTube "yt", X "twitter", ChatGPT "gpt"/"openai", Claude, Perplexity, Wikipedia nella lingua del sistema "wiki", GitHub "gh", Stack Overflow "so", MDN, Amazon del paese, Google Maps "maps", IMDb, Spotify, Figma Community) più quelli imparati da OpenSearch, in `search-sites.json`.
- **File di testo locali** (`LocalText.swift`): un `file:` regolare, fino a 5 MB, UTF-8 senza NUL, si mostra come testo anche con estensione sconosciuta; altrimenti si scarica. Windows: `protocol.handle('file', …)`.
- **Dominio registrabile** (`Registrable.swift`): con lista dei suffissi pubblici; Windows: `tldts`.
- **120 Hz** (`FrameRate.swift`), **DateOrder** (`DateOrder.swift`, aggiramento di un difetto dell'SDK macOS 27.2): non servono su Windows.
- **Copy as Markdown Link**, **Copy Address** (⇧⌘C): testo puro, portabili.

---

## 6. Cosa viene salvato e dove

| Cosa | Mac | Windows (proposta) |
|---|---|---|
| Tutte le impostazioni, per sito comprese | `~/Library/Preferences/com.officecommun.search.plist` (`UserDefaults.standard`, `Store.swift:157`) | `%APPDATA%\Search\settings.json` (es. `electron-store`), **stesse chiavi** (le chiavi con il punto vanno trattate come stringhe piatte, non come percorsi) |
| Dati dell'app | `~/Library/Application Support/Search/`: `downloads.json` (max 50), `styles.json`, `search-sites.json`, `hidden.json`, `pins.json`, `pin-folders.json`, `spaces.json`, `windows.json`, `session.json`, `history.json`, `bookmarks.json`, `archive.json`, `profiles.json`, `icloud.json`, `sync-<scope>.json`, `Theme/` (immagine home), `icons/`, `Extensions/`, `NativeMessagingHosts/`, `Import/`, `Agent/`, `bench.sock`, `crash.log` | `%APPDATA%\Search\` con gli stessi nomi; file illeggibili messi da parte come `<nome>.unreadable-<timestamp>.json` |
| Cookie, cache, storage dei siti | store WebKit dell'app (uno per spazio separato/profilo; privata in memoria) | partizioni di sessione Electron (`persist:<id>` per spazio/profilo; privata senza `persist:`) |
| Lista di blocco compilata | `WKContentRuleListStore` (`office-shield-<hash>`) | nessuna (regole in memoria) |
| Password del proxy | portachiavi, servizio `com.officecommun.search.proxy`, account `global` | `safeStorage` (DPAPI) o Credential Manager |
| Consenso bench e agenti | portachiavi (`Bench.Consent`, `com.officecommun.search.agents`, account "consent") | Credential Manager o blob DPAPI: un JSON modificato a mano non deve bastare per accenderli |
| Password e passkey | portachiavi macOS | Credential Manager/DPAPI (studio password) |
| Iscrizioni email | due booleani, mai l'indirizzo | uguale |
| Solo in memoria | certificati client scelti, certificati non validi accettati, dati di ripresa download, pop-up consentiti in privata, blocchi di `print()` | uguale |
| Temporanei | icone delle notifiche in `$TMPDIR/Search notifications`, cartelle di aggiornamento | `%TEMP%` |
| Correttore | `WebAutomaticSpellingCorrectionEnabled`, `NSAutomaticInlinePredictionEnabled` in `UserDefaults.standard` | `session.setSpellCheckerEnabled` |

Cosa esce dalla macchina (README, privacy): pagine richieste, loro icone, controllo aggiornamenti, suggerimenti del motore (se accesi), iCloud e Handoff (se accesi), POST email (solo su pressione). Nessuna telemetria.

---

## 7. Riferimenti file:riga

Impostazioni
- `Settings.swift:45` sezioni e blocchi del rail; `:98` metriche; `:164` rail; `:206` campo di ricerca; `:299` contenuto; `:389` riga; `:410` risultati; `:464` titoli variabili; `:473` dettagli variabili; `:506` controlli per sezione (`:521` General, `:606` Appearance, `:693` Tabs, `:746` Browsing, `:809` Spaces, `:849` Passwords/Privacy, `:889` Keyboard/About); `:928` cosa va sotto una riga; `:1152` intestazione About; `:1171` riga aggiornamenti; `:1220` scelta cartella; `:1246` GroupBlock; `:1270` SettingRow; `:1339` Always; `:1353` Pictures; `:1541` Segmented; `:1584` Ticks; `:1598` Switch; `:1619` Steps; `:1676` Pill; `:1709` permessi per sito; `:1810` agenti ricordati.
- `SettingsIndex.swift:61` gruppi; `:113` righe (General `:115`, Downloads `:148`, Themes `:162`, Appearance `:170`, Tabs `:313`, Browsing `:384`, Spaces & Pins `:452`, Passwords `:542`, Privacy `:568`, Keyboard & Mouse `:602`, About `:641`, solo ricerca `:673`); `:731` righe offerte secondo WebKit; `:746` ricerca; `:764` `applies`; `:796` `needs`; `:828` controlli uniti; `:924` Set Up Like Arc; `:1025` valori per il bench.
- `Prefs.swift:143` classe Preferences; `:1202` init con tutti i default; `:1502` lettura a caldo; `:1599` correttore WebKit; `:102` SidebarDefault; `:845` link in finestrella.
- `Store.swift:123` cartella; `:157` impostazioni; `:64` tracciamento.
- `InternalPages.swift:14` pagine interne; `Browser.swift:214` apertura Impostazioni; `Browser.swift:10167` sezione nell'indirizzo.
- `SyncDefault.swift`, `Sync.swift:61` impostazioni sincronizzate via cartella.
- `ThemesPage.swift:5`, `ExtensionsUI.swift:6`, `ExtensionsUI.swift:500`, `ShortcutsPage.swift:7`, `OptIn.swift:480`, `Launcher.swift:713`, `Profiles.swift:353`, `SpaceRoutes.swift:196`, `Translate.swift:1114`, `ApplePasswordsSettings.swift:6`, `SiteStyles.swift:281`.

Privacy e blocco
- `Shield.swift:60` errore; `:73` pausa per sito; `:113` domini; `:141` slot; `:153` per sito; `:166` Reddit; `:183` compilazione.
- `YouTubeAds.swift:68` host; `:86` script; `:97` script di pagina; `:302` skipper; `:341` percorsi; `:355` regole.
- `Privacy.swift:32` GPC; `:64` click ID; `:117` HTTPS first. `CleanLink.swift:8`. `Browser.swift:2742` Copy Clean Link.
- `BlockedPopups.swift:27`, `:94` (permesso), `:120` (Always Allow), `:136` (segno), `:191` (menu), `:239` (lista in Impostazioni). `PopupGesture.swift:6`, `:124`.
- `CaptureChoices.swift:5`; `Browser.swift:1968` domande e risposte; `:2079` cambio permesso; `:2142` Forget choices; `:9356` camera/microfono; `:9411` schermo; `:9457` posizione; `:9497` notifiche; `:9535` storage access. `PageQuestions.swift:4` e `:65` card. `SiteLocation.swift`.
- `Proxy.swift:23` valore; `:100` segreto; `:158` rete; `:256` applicazione agli store; `:318` interfaccia.
- `ClientCertificates.swift:110`, `:134`, `:145`, `:199`, `:270`. `Dialogs.swift:243` sfide, `:269` certificato server, `:319` accesso HTTP.

Download, notifiche, media, dialoghi
- `Browser.swift:1864` dove si apre; `:9160` avvio, pausa, ripresa, riprova, annulla; `:9806` destinazione e fine; `:9940` pannello salva; `:9954` sottocartelle; `:9981` quarantena; `:10016` print.
- `Fetching.swift:9` voce; `:381` progresso su file e Dock; `:516` fine; `:658` bottone. `Recall.swift:272` pannello; `Loot.swift:49` lista salvata; `DownloadsFloat.swift`.
- `Notifications.swift:24`, `:64`, `:74`, `:94`, `:145`, `:185`, `:226`, `:361`.
- `Dialogs.swift:119` domande in attesa; `:137` alert; `:153` confirm; `:172` prompt; `:200` file; `:418` utilità. `Browser.swift:8791` schemi esterni. `Links.swift:41` conferma uscita.
- `Float.swift:1`, `:1022`; `NativePiP.swift:14`; `MediaKeys.swift`; `Player.swift`; `Tab.swift:216` autoplay; `Tab.swift:570` zoom; `LiveRate.swift`; `RecordingIndicator.swift`; `PointerLock.swift`.

Aggiornamenti
- `Updater.swift:37` feed; `:117` chiave; `:133` frequenza; `:159` a mano; `:181` controllo; `:227` DMG; `:250` Install; `:259` scambio; `:290` riavvio; `:314` lettura feed; `:376` feed firmato; `:404` URL ammessi; `:429` installazione; `:511` verifica; `:583` rinomine; `:600` pulizia. `App.swift:2177` voce di menu.

Scheda sito e altro
- `SiteCard.swift:20` pannello; `:318` righe; `:356` permessi; `:426` blocco; `:437` suono; `:448` zoom; `:595` sicurezza; `:638` stato connessione; `:685` certificato.
- `Inspector.swift:23`; `ImageMenu.swift:25`, `:148`, `:188`, `:244`; `Sharing.swift:12`; `SiteSearch.swift`; `LocalText.swift`; `Registrable.swift`.
- Test utili come specifica: `Tests/settings_layout.py`, `popup_blocked.py`, `popups.py`, `proxy_live.py`, `client_certificate.py`, `youtube_ads.py`, `reddit_ads.py`, `storage_access.py`, `itp_interaction.py`, `cross_site_cookies.py`, `media_keys.py`, `media_player.py`, `pointer_lock.py`, `recording_pill.py`, `autoplay_setting.py`, `site_card_click.py`, `site_card_anchor.py`, `copy_image.py`, `clear_cache_workers.py`, `cookies_survive_quit.py`, `web_auth_quiet.py`, `dialog_keys.py`, `defaults_write.py`.

---

## 8. Checklist di backlog

### P0 (senza queste la versione non è "la stessa")

- [ ] Estrarre `SettingsIndex.swift` in JSON con script (testi identici al carattere) e disegnare la finestra da lì: rail a 3 blocchi, gruppi, card, (i), righe dipendenti nascoste in sezione e attenuate nella ricerca, ricerca a parole con conteggi e "Always on, nothing to set".
- [ ] Ridisegnare i controlli propri (Switch, Pill, Segmented, Pictures, Ticks, Steps, Always) con le metriche del §1.0.
- [ ] Decidere font e icone sostitutivi (SF Pro e SF Symbols non usabili su Windows) e la tabella di sostituzione dei testi Mac (Mac, Finder, System Settings, ⌘ ⌥ ⌃).
- [ ] Archivio impostazioni con le **stesse chiavi** e la regola "un default non scrive nulla"; default della tabella §1.1 a §1.12 con i default da installazione nuova.
- [ ] Dispatcher unico `webRequest` per sessione: Shield (lista corta identica, terza parte via dominio registrabile), regole YouTube, click ID, GPC, HTTPS first.
- [ ] CSS cosmetico di Shield in ogni frame a inizio documento; pausa per sito dalla scheda del sito con ricarica.
- [ ] Popup blocker ricostruito (Electron non lo ha): gesto fidato entro 5 s, segno sulla scheda, popover "Open …"/"Always Allow Pop-ups from …", lista in Privacy.
- [ ] Permessi: `setPermissionRequestHandler` + `setPermissionCheckHandler` con chiavi `capture.*`, card identica (ritardo 0,5 s, una domanda alla volta, in attesa per le schede dietro), sottomenu "Site Permissions", lista e "Forget choices".
- [ ] Download: `will-download` con nomi "nome 2.ext", cartella/chiedi, private non elencate, pausa/ripresa/riprova, bottone, scheda/popover/pannello, `downloads.json` (50), progresso sulla barra applicazioni.
- [ ] Dialoghi: `alert`/`confirm`/`prompt` sovrascritti (Electron non ha `prompt`), titolo = host, attesa per schede dietro; `will-prevent-unload` sempre ignorato; certificato non valido, accesso HTTP, schemi esterni con le stesse domande.
- [ ] Menu contestuale completo costruito da zero (Electron non ne ha), incluso il menu immagini e "Copy Clean Link".
- [ ] Aggiornamenti: NSIS per utente + `electron-updater` generic, controllo all'avvio e ogni ora, stati e messaggi identici, "Install updates on its own", firma Authenticode e firma del feed.
- [ ] Clear: History, Cookies and sign-ins, Cache con gli stessi effetti collaterali (icone, motori imparati, indirizzi dei download).

### P1 (funzioni visibili, portabili con lavoro)

- [ ] Prevent cross-site tracking: blocco cookie di terze parti + card Storage Access; dichiarare l'assenza della pulizia ITP.
- [ ] Proxy HTTP/SOCKS5 su tutte le partizioni e sulle richieste proprie, bypass locali, credenziali HTTP via `login`, password in DPAPI; decidere cosa fare di utente+password con SOCKS5 (non supportato da Chromium); politica WebRTC.
- [ ] Certificati client con `select-client-certificate` e foglio identico, memoria per avvio e per store.
- [ ] Notifiche: AUMID, override di `Notification`/`showNotification`, toast con icona del sito, clic che riporta alla scheda giusta, interruttore globale.
- [ ] Scheda del sito come finestra figlia non attivabile, con tutte le righe; certificato via `setCertificateVerifyProc` e visualizzatore di Windows; "Parts of this page are not secure".
- [ ] Video flottante "Search's window" (spostamento della vista) e "Picture in picture" (PiP Chromium con gesto), fluttuazione automatica, "Don't Float Videos Here".
- [ ] Autoplay globale e per sito via script; riga player al piede della colonna.
- [ ] Pointer lock con pillola "Press Esc to show your pointer".
- [ ] Zoom per sito persistito (`zoom.<host>`), Page zoom globale con Steps.
- [ ] Ispettore: DevTools con Ctrl+Shift+I/J/C; righe "Chrome's colors"/"Keep the Web Inspector dark" mantenute o adattate.
- [ ] App predefinita per http e mailto: registrazione e apertura di `ms-settings:defaultapps`.
- [ ] Lancio globale (`globalShortcut`) con tasto suggerito diverso da Alt+Space.
- [ ] Consenso bench/agenti fuori dal file impostazioni; named pipe al posto del socket Unix.
- [ ] Lettura a caldo del file impostazioni solo per le chiavi d'aspetto.
- [ ] Modulo email: concordare con il server `arch` e lista per Windows.

### P2 (dipendono dal Mac, opzionali o da ridefinire)

- [ ] Handoff, Sync with iCloud, Delete from iCloud: nascondere o sostituire (forse con la sola sync via cartella, compatibile col Mac).
- [ ] Liquid Glass (stile vetro e scheda): nascondere come su macOS < 26; vetro con Acrylic/Mica su Windows 11.
- [ ] Traduzione locale delle pagine (motore WASM tipo Bergamot) o riga nascosta.
- [ ] Contatti ("Fill in your contact details"), Apple Passwords, "From Safari apps": nascondere.
- [ ] Touch ID → Windows Hello per "Ask for Touch ID before filling" e per la pagina password.
- [ ] Low Power Mode → stato batteria; "Keep the window in use during full screen" senza equivalente.
- [ ] 120 Hz e LiveRate: non portare (Chromium non ne ha bisogno); decidere se tenere la riga.
- [ ] Trucco dei tasti multimediali: misurare su Windows (SMTC) prima di portarlo.
- [ ] Condivisione di Windows (Share UI) con modulo nativo.
- [ ] Bounce, smooth wheel, swipe con scelta dalla cronologia, autoscroll: verificare le feature Chromium su Windows.
- [ ] Indicatore di registrazione delle estensioni (dipende dal supporto estensioni in Electron).
- [ ] "Add Image to Photos": assente nella 1.0.19; solo se si vuole riportare la funzione di quella build.
