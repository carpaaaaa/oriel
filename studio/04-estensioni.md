# 04 · Estensioni: studio di Search per Mac in vista della versione Windows

Sorgente studiato: `ref/search-mac` (Search 1.0.19, 23 novembre 2026). Salvo dove scritto diversamente, i riferimenti `File.swift:riga` sono relativi a `ref/search-mac/Sources/Search/`; i test sono relativi a `ref/search-mac/`.

Convenzioni di questo documento:

- Identificatori, chiavi, nomi di file e testi dell'interfaccia sono in inglese e copiati esatti, tra backtick o virgolette.
- Alcuni testi dell'interfaccia contengono il carattere U+2014 (trattino lungo). Qui non lo scrivo mai: dove compare nel testo originale lo indico con il segnaposto `[U+2014]`. Nella versione Windows va rimesso il carattere originale (o deciso diversamente, ma è una scelta di copy, non di questo studio).
- Le affermazioni su Electron NON sono state verificate con un prototipo (studio senza installazioni). Sono segnate come "da verificare" dove non sono certe.

---

## 0. Sintesi in poche righe

- Search non ha un suo motore di estensioni: usa `WKWebExtension` di WebKit (lo stesso di Safari, macOS 15.4+). Sopra ci mette tre cose: la "metà browser" del contratto con WebKit (`Extensions.swift`), l'installazione dal Chrome Web Store con verifica della firma CRX3 (`Crx.swift`, `StoreRelay.swift`), e uno **shim JavaScript di circa 230 KB** (`ExtensionShims.swift`, righe 543..5644) iniettato in ogni pacchetto al momento dell'installazione, che definisce le API Chrome che WebKit non ha e corregge i punti in cui WebKit si comporta diversamente da Chrome.
- Lo shim parla con l'app tramite native messaging verso un'applicazione finta chiamata `search` (`runtime.sendNativeMessage("search", {api, args})`) e tramite porte native dedicate (`search.fetch`, `search.socket`, `search.groups`, `search.idle`). L'app risponde in Swift (`ExtensionShims.answer`, `ExtensionShims.swift:5661`).
- Circa metà del lavoro (correzioni di messaggistica, worker che muoiono, WebSocket nel worker, cookie SameSite, CSP, sandbox, ecc.) esiste solo perché WebKit non è Chromium: su Electron **non serve**. L'altra metà è UX propria di Search (pulsante puzzle, popup, "Runs on", domande di permesso, pagina Impostazioni, aggiornamenti, side panel, registrazione schermo con pillola) e API che **Electron non dà** (action, windows, tabGroups, sidePanel, offscreen, identity, userScripts, declarativeNetRequest, native messaging, bookmarks, history, downloads, ecc.): quella va rifatta identica.

---

## 1. Come è costruito su Mac (per orientarsi)

| Pezzo | Cosa fa | Dove |
|---|---|---|
| `Extensions` (singleton) | Possiede il `WKWebExtensionController`, carica/scarica i contesti, segue finestre e schede, chiede permessi, gestisce pulsanti, aggiornamenti, rimozione | `Extensions.swift:56` |
| `Installed` | Riga della lista installate (`id`, `name`, `version`, `enabled`, `fromStore`, `permissions`, `pinned`, `source`, `fromApp`) | `Extensions.swift:22` |
| `ExtensionTab`, `ExtensionWindow` | Adattatori di schede e finestre per WebKit (privacy, pagine di altre estensioni sigillate) | `Extensions.swift:2320`, `:2434` |
| `ExtensionShims` | Preparazione del pacchetto all'installazione + script shim + risposte native | `ExtensionShims.swift:27` |
| `Crx` | Download dal Web Store, verifica CRX3, decompressione, id dei pacchetti non compressi | `Crx.swift:19` |
| `StoreRelay` | Script sul sito del Web Store che sostituisce "Add to Chrome" con "Add to Search" | `StoreRelay.swift:16` |
| `ExtensionPopup` | Popup del pulsante in un `NSPopover` di Search, dimensionato come Chrome | `ExtensionPopup.swift:19` |
| `ExtensionsPage`, `StoreOffer`, `HomePageLine` | Impostazioni › Extensions, barra "Add this extension to Search", scelta pagina nuova scheda | `ExtensionsUI.swift` |
| `SiteAccess` | "Runs on" (Site access di Chrome) | `ExtensionSiteAccess.swift` |
| `ExtensionNative` + `HostPipe` | Native messaging Chrome verso app installate sul Mac | `ExtensionNative.swift` |
| `ExtensionFetch` | Fetch con credenziali delle estensioni, inviato dall'app | `ExtensionFetch.swift` |
| `ExtensionSocket` | WebSocket del worker, aperto dall'app | `ExtensionSocket.swift` |
| `ExtensionWatch` | Eventi tabGroups e idle spinti dall'app | `ExtensionWatch.swift` |
| `ExtensionOffscreen` | `chrome.offscreen` (un documento invisibile per estensione) | `ExtensionOffscreen.swift` |
| `ExtensionCapture` + `RecordingIndicator` | Registrazione schermo/camera per estensioni, con pillola "Stop" | `ExtensionCapture.swift`, `RecordingIndicator.swift` |
| `ExtensionWorkerRecovery` | Generazioni e riavvii del worker, osservatori passivi | `ExtensionWorkerRecovery.swift` |
| `ExtensionExternal` | `externally_connectable`: `chrome.runtime` per i siti elencati | `ExtensionExternal.swift` |
| `ExtensionSandbox` | Pagine `sandbox` del manifest servite come Chrome | `ExtensionSandbox.swift` |
| `ExtensionPageScript` | Script dell'estensione rifiutato dalla CSP della pagina: eseguito dall'app | `ExtensionPageScript.swift` |
| `ExtensionRedirectPolicy`, `ExtensionReturnNavigation` | Ritorno da un sito a una pagina dell'estensione; redirect DNR verso file dell'estensione | file omonimi |
| `ExtensionFiles` | Sostituzione atomica della cartella (rename swap) | `ExtensionFiles.swift` |
| `ExtensionAuth` | `identity.launchWebAuthFlow` interattivo e silenzioso | `ExtensionShims.swift:6995` |
| `SafariApps` | Estensioni Safari dentro le app in /Applications | `SafariApps.swift` |
| `SidePanel`, `SidePanelPages` | Pannello laterale (estensioni, siti, download) | `SidePanel.swift` |

Flusso a runtime in una frase: la pagina o il worker dell'estensione chiama `chrome.bookmarks.get(...)` → lo shim lo trasforma in `runtime.sendNativeMessage("search", {api:"bookmarks.get", args})` → WebKit lo consegna al delegate `webExtensionController(_:sendMessage:toApplicationWithIdentifier:for:)` (`Extensions.swift:2259`) → `ExtensionShims.run` controlla il permesso nel manifest (`gates`, `ExtensionShims.swift:5711`) e risponde `{value}` o `{error}`.

Dettagli di identità (importanti per replicare il comportamento):

- Le pagine delle estensioni sono servite da `chrome-extension://<id>/`, non da `webkit-extension://` (schema di WebKit, usato prima: gli indirizzi vecchi vengono convertiti, `Extensions.swift:144-157`). Motivo: server come quello di Raindrop rifiutano altre origini.
- Lo stesso id del Web Store. Per le cartelle non compresse l'id è quello che darebbe Chrome, calcolato dal percorso reale (SHA-256 del percorso, primi 16 byte in lettere a..p); la chiave `key` del manifest viene **ignorata** di proposito (`Crx.swift:44-50`). Nota: Chrome invece la usa; è una scelta di sicurezza di Search.
- Alle estensioni Search si presenta come **Chrome 156** (`Crx.chromeVersion = "156.0.0.0"`, `Crx.swift:42`): nella `prodversion` verso il Web Store e in `navigator.userAgent`, `appVersion`, `vendor = "Google Inc."`, `userAgentData` (marche Chromium/Google Chrome, piattaforma macOS) dentro pagine e worker delle estensioni (`ExtensionShims.swift:1463-1494`). Le schede web invece mantengono lo user agent Safari di Search.

---

## 2. Esperienza utente, da rifare identica

### 2.1 Requisiti e assenza

- Senza macOS 15.4 le estensioni non esistono: niente pulsante puzzle, e in Impostazioni › Extensions compare solo la riga "Chrome extensions" con "Need macOS 15.4 or later [U+2014] the version whose WebKit can run them." (`ExtensionsUI.swift:12-15`). Su Windows non serve, ma va deciso il requisito minimo equivalente.
- Con nessuna estensione installata il pulsante puzzle non c'è proprio (`Extensions.swift:2534`, `if !extensions.installed.isEmpty`).

### 2.2 Come si installano (sei strade, nessun file .crx)

Search **non** installa file `.crx` dal disco (esiste solo `installForTests`, `Extensions.swift:842`, raggiungibile solo in esecuzione di test). Le strade reali:

1. **Dalla pagina dell'estensione sul Chrome Web Store.** Sul sito `chromewebstore.google.com` lo script di `StoreRelay` (`StoreRelay.swift:39-159`, iniettato a fine documento nel frame principale, mondo isolato di Search):
   - nasconde il banner "Switch to Chrome" e la card flottante con il logo Chrome (`hideBanner`);
   - clona il pulsante grigio disabilitato "Add to Chrome" e lo sostituisce con un pulsante con lo stesso aspetto e il testo `Add to Search` / `Adding…` / `Added to Search` (disabilitato se aggiunto o in corso);
   - il click viene intercettato sulla finestra in fase di cattura e manda `{add: true}` all'app. L'id viene preso **dall'indirizzo della scheda**, mai da ciò che dice la pagina (`Crx.storeID(of:)`, `Crx.swift:74-88`; `Browser.addFromStore`, `StoreRelay.swift:166`).
   - Un `MutationObserver` rifà tutto quando il sito si ridisegna (con timer da 60 ms, non con frame, così funziona anche in schede nascoste).
   - L'app tiene il pulsante aggiornato su tutte le schede del Web Store (`followStore`, `StoreRelay.swift:179`).
2. **Barra di riserva in fondo alla finestra** (`StoreOffer`, `ExtensionsUI.swift:438-493`): se la pagina del Web Store non ha avuto il pulsante "Add to Search" (markup cambiato), compare una capsula in basso: icona `puzzlepiece.extension`, testo `Add this extension to Search` (o `Adding…` con spinner) e pulsante `Add`. Solo su `https://chromewebstore.google.com/...` o `https://chrome.google.com/webstore...`.
3. **Impostazioni › Extensions, campo "Add from the Chrome Web Store"**: si incolla un link o un id (32 lettere a..p, trovate ovunque nel testo, `Crx.id(in:)`, `Crx.swift:63`), Invio o `Add`. Pulsante `Open the Store` apre `https://chromewebstore.google.com/category/extensions` (`Browser.webStore`, `StoreRelay.swift:163`).
4. **Menu del puzzle › `Chrome Web Store…`**: apre la stessa pagina del Web Store in una scheda.
5. **Cartella non compressa** ("Load unpacked" di Chrome): menu puzzle `Load Unpacked…` o card `Load an unpacked extension` › `Choose…`. Pannello di sistema con prompt `Load Extension` e messaggio `Choose the folder that holds the extension's manifest.json.` (`Extensions.swift:883-891`). La cartella viene **copiata** dentro la cartella delle estensioni (spostare l'originale non rompe nulla); i link simbolici che portano fuori dal pacchetto vengono tolti (`unlinkOutside`, `Extensions.swift:170`). Il percorso sorgente è ricordato per `Reload`.
6. **Da un altro browser** (card `From another browser` › `Bring them over…`, `ExtensionsUI.swift:68-75`): apre il foglio "Bring things over" filtrato sulle estensioni. Legge `Preferences` e `Secure Preferences` dei profili Chromium (Chrome, Arc, Brave, Edge...), prende solo quelle aggiunte dall'utente dal Chrome Web Store (`location == 1` o `from_webstore`, non default/OEM, non temi, `update_url` di Google) e le **reinstalla fresche dal Web Store**, chiedendo conferma per ognuna (`Import.swift:521-565`, `ImportPanel.swift:404-412`, `:577-580`). Testo riga: `Extensions` / `<n> found [U+2014] installed fresh from the Chrome Web Store, you say yes to each one`; esito: `1 extension to confirm` / `<n> extensions to confirm`.
7. **Da app Safari** (card `From Safari apps`, spenta di default, `ExtensionsUI.swift:115-157`, `SafariApps.swift`): elenca le estensioni Safari dentro `.app` in `/Applications` e `~/Applications` (anche un livello di sottocartelle), firmate Apple/Mac App Store/Developer ID; `Add` le copia come cartella non compressa. Solo il JavaScript gira: niente parte nativa, niente content blocker. Su Windows non ha equivalente diretto (vedi checklist, P2).

Flusso comune di installazione dal Web Store (`Extensions.install(id:)`, `Extensions.swift:860-879`):

1. id valido (32 lettere a..p) e non già installato (altrimenti avviso `Already installed`);
2. `busy` contiene l'id (spinner in Impostazioni e `Adding…` sul Web Store);
3. download CRX da `https://clients2.google.com/service/update2/crx?response=redirect&prodversion=156.0.0.0&acceptformat=crx3&x=id%3D<id>%26installsource%3Dondemand%26uc` (`Crx.swift:90-99`), sempre attraverso il proxy del browser se configurato (`ProxyNetwork.session`);
4. verifica CRX3: magic `Cr24`, versione 3, `signed_header_data.crx_id` uguale all'id, almeno una prova RSA con chiave il cui SHA-256 dà l'id e firma PKCS#1 v1.5 SHA-256 valida su `"CRX3 SignedData\0" + len + signed_header + zip` (`Crx.swift:167-206`);
5. decompressione in cartella di staging; un pacchetto con **qualsiasi** link simbolico viene rifiutato intero (`Crx.swift:225-233`);
6. preparazione con lo shim (`ExtensionShims.prepare`, vedi §3.6);
7. dialogo di conferma (foglio sulla finestra, una domanda alla volta, `Extensions.swift:1853-1887`);
8. sostituzione atomica nella cartella finale (`ExtensionFiles.replace`), scrittura di `installed.json`, caricamento. Se il controller è nato da meno di 5,5 s si aspetta (WebKit tratterebbe il carico come avvio del browser e non come installazione, `Extensions.swift:1191-1194`);
9. avviso finale: `<Name> is installed` oppure `<Name> is installed, but <limite in minuscolo>` oppure `<Name> is installed, but couldn't start: <motivo>` (`Extensions.swift:1197-1202`).

Dialogo di installazione (`Extensions.swift:1808-1815`):

- Titolo: `Add “<Name>” to Search?`
- Testo: (se da app Safari) `From the Safari extension in “<App>”.` + riga vuota, poi `It doesn't ask for anything special.` oppure `It will be able to:` seguito da righe `• <frase>`.
- Pulsanti: `Add Extension` / `Cancel`. Icona dell'estensione a 64×64.

Frasi dei permessi (`Extensions.describe`, `Extensions.swift:1778-1806`), nell'ordine in cui compaiono:

| Condizione | Testo |
|---|---|
| host `<all_urls>` o tutti gli host | `Read and change everything on every website` |
| alcuni host | `Read and change what's on <h1>, <h2>, <h3>, <h4>` + ` and <n> more` |
| `tabs` | `See your open tabs and their addresses` |
| `cookies` | `Read and change cookies` |
| `webNavigation` | `See where you go` |
| `webRequest` | `See the requests pages make` |
| `declarativeNetRequest` | `Block or change requests pages make` |
| `clipboardWrite` | `Write to the clipboard` |
| `nativeMessaging` | `Talk to apps on this Mac` |
| `scripting` | `Run scripts in pages` |
| `userScripts` | `Run scripts you add to it on websites` |
| `history` | `Read and change your history` |
| `bookmarks` | `Read and change your bookmarks` |
| `downloads` | `Manage your downloads` |
| `privacy` | `Change your privacy settings` |
| `browsingData` | `Clear your browsing data` |
| `management` | `See your other extensions` |
| `notifications` | `Show notifications` |
| `sessions` | `See your recently closed tabs` |
| `topSites` | `See your most visited sites` |
| `readingList` | `Read and change your reading list` |
| `downloads.open` | `Open files it downloads` |
| `desktopCapture` | `Record your screen or a window, when you choose what to share` |
| `tabCapture` | `Record a tab, when you ask it to` |

I permessi aggiunti da Search al manifest (`nativeMessaging`, e `scripting` per chi chiede `userScripts`) sono annotati in `.search-added` e **non** compaiono nell'elenco (`ExtensionShims.swift:125-139`). Su Windows: "on this Mac" diventerà "on this PC" o simile, decisione di copy.

Errori di installazione (`Crx.Refused`, `Crx.swift:20-33`, mostrati come avviso):

- `That isn't a Chrome Web Store link or extension id`
- `The Chrome Web Store answered <code>`
- `The Chrome Web Store has nothing for that id [U+2014] it may have been taken down, or only exist for old versions of Chrome`
- `What came back isn't a Chrome extension`
- `The extension's signature doesn't hold up`
- `The extension couldn't be unpacked`

Avvisi della cartella non compressa: `That folder has no manifest.json`, `Already installed. Press Reload to take its changes`, `Couldn't install the extension: <errore>` (`Extensions.swift:893-918`).

Avvisi di avvio fallito o limiti (`Extensions.cantDo`, `Extensions.swift:741-763`), mostrati anche in Impostazioni in rosso (`Palette.unsafe`):

- MV2 con `webRequestBlocking` e senza `declarativeNetRequest`: `Can’t block requests: Safari’s engine doesn’t let extensions block them with webRequestBlocking. What it does inside pages still works.` + per uBlock Origin ` uBlock Origin Lite, from the Chrome Web Store, blocks them here.`
- MV3 con `wasm-unsafe-eval` su macOS 15: `WebAssembly doesn’t run in its own pages on macOS 15: Safari’s engine there refuses it to these extensions whatever they ask, so parts that need it, like Bitwarden’s popup, won’t open. On macOS 26 they do.`

Su Chromium entrambi i limiti spariscono (il primo dipende dal supporto MV2 di Electron, da verificare): la riga di avviso resta utile come meccanismo generico ("couldn't start" con motivo).

### 2.3 Dove stanno le icone

Componente `ExtensionSlot` (`Extensions.swift:2506-2598`), messo in quattro posti:

- **Piede della colonna laterale** (layout predefinito con colonna), riga orizzontale: profilo, punto dello spazio, **puzzle e pulsanti fissati**, segnalibri, spazi, download (`Side.swift:1735-1743`). Il popover della lista si apre verso l'interno (`.trailing` se colonna a sinistra, `.leading` se a destra).
- **Piede della colonna in verticale** (colonna a sole icone): `room: 0`, solo il puzzle, nessun pulsante fissato (`Side.swift:1708-1719`).
- **"Buttons at the top"** (Impostazioni › Appearance › Tabs): pulsanti accanto a indietro/avanti/ricarica, il puzzle in fondo (`Side.swift:1721-1733`).
- **Schede in alto**: in fondo alla riga delle schede, accanto a download e segnalibri (`TabBar.swift:262-279`).

Comportamento:

- **Puzzle** (`Door` con simbolo `puzzlepiece.extension`, tooltip `Extensions`): apre la lista dell'estensione. Lo stato "aperto" è per finestra (`menuOwner`), non globale: con più finestre un click in una lista non chiude le altre (`Extensions.swift:1901-1916`).
- **Pulsanti fissati**: le estensioni con `pinned = true` stanno accanto al puzzle, in ordine di installazione; se la riga non ha posto (`room`), quelle in eccesso spariscono partendo dall'ultima e restano nella lista.
- **Puzzle nascosto** (Impostazioni › Appearance › Tabs, spunta `Extensions`, chiave `foot.extensions.hidden`): il puzzle diventa largo 0 e trasparente ma resta come punto d'aggancio dei popup; i pulsanti fissati restano (`Extensions.swift:2553-2557`).
- **Click su un pulsante** (`Extensions.press`, `Extensions.swift:1979-2002`): registra il click (gesto utente), concede il sito se "Runs on" è ristretto (§2.5), poi: se l'estensione ha chiesto `openPanelOnActionClick` apre il side panel; altrimenti, se c'è un popup, lo apre Search stesso; altrimenti `action.onClicked`. Un secondo click sul pulsante con popup aperto lo chiude (anche se macOS lo aveva già chiuso al mouse-down, entro 1,5 s, `ExtensionPopup.swift:214-222`).
- **Tasto destro** su un pulsante fissato o su una riga della lista (`ExtensionActions`, `Extensions.swift:2639-2693`):
  - `Pin to Toolbar` / `Unpin`
  - `Options…` (se c'è una pagina opzioni)
  - `Reload`
  - se l'estensione chiede siti: separatore, poi (se "Runs on" è ristretto e si è su un sito web) `Run on This Site` (se non gira già lì) e l'interruttore `Always on <host>`, poi il menu `Runs On` con le tre modalità
  - separatore, `Remove “<Name>”…` → avviso modale `Remove “<Name>”?` / `Its settings and data go with it.` / `Remove` / `Cancel`.

Lista del puzzle (`ExtensionMenu`, `Extensions.swift:2714-2850`):

- Vuota: `None of your extensions is on`.
- Una riga per ogni estensione **accesa e caricata** che ha un'azione: icona 16, nome; al passaggio del mouse compaiono `arrow.clockwise` (tooltip `Reload from its folder`, solo se caricata da cartella) e la puntina `pin`/`pin.fill` (tooltip `Pin to toolbar` / `Unpin`); la puntina resta visibile se fissata. Click sulla riga: chiude la lista e dopo 0,15 s preme il pulsante (il popup si aggancia al puzzle).
- Piede: `Chrome Web Store…` (`storefront`), `Load Unpacked…` (`folder`), `Manage Extensions…` (`gearshape`, apre Impostazioni sulla pagina `extensions`).

Icona e badge (`ExtensionIcon`, `Extensions.swift:2602-2635`): icona dell'azione per la scheda attiva; se manca, l'iniziale del nome su un quadrato arrotondato (mai un pezzo di puzzle, che si confonderebbe col pulsante della lista). Estensione con azione disabilitata: opacità 0,4. Badge in basso a destra.

Comandi da tastiera delle estensioni: Impostazioni › Shortcuts › Extensions, uno per comando del manifest, modificabili, salvati nella chiave `shortcuts` con id `ext:<idEstensione>:<comando>` (`Shortcuts.swift:569-578`). Un tasto che appartiene al Mac o a un comando di Search resta senza tasto; ⌘W, ⌘T, ⌘N e le loro varianti ⇧/⌥ non sono mai assegnabili (CHANGELOG 1.0.2). Gli eventi tastiera passano a `Extensions.take(_:)` (`Extensions.swift:2058`).

### 2.4 Popup

Il popup **non** è quello di WebKit: Search carica la pagina del popup in una propria `WKWebView` costruita con la configurazione dell'estensione dentro un `NSPopover` (`ExtensionPopup.swift`), perché con il popover di WebKit alcuni popup restavano sullo spinner per sempre. Su Electron il problema non esiste ma il popup va comunque costruito a mano (Electron non ha UI per `action`).

Regole da replicare:

- **Aggancio**: al pulsante dell'estensione se è visibile nella finestra, altrimenti al puzzle, altrimenti (colonna o striscia nascosta con ⌘S) dove sarebbero i pulsanti: piede della colonna (24 pt dal bordo) o angolo in alto a destra (60, 40 pt) (`Extensions.anchor`, `Extensions.swift:2011-2035`; `ExtensionPopup.swift:112-133`). La freccia del popover è spostata per non finire nell'angolo arrotondato vicino al bordo schermo (`PopoverSide`).
- **Finestra giusta**: il popup si apre nella finestra in cui si è premuto; ancore per finestra.
- **Dimensione come Chrome**: tra 25×25 e 800×600. La pagina è caricata invisibile (alpha 0) in un quadrato 25×25, misurata a `DOMContentLoaded` (callback privata `_webView:navigationDidFinishDocumentLoad:`), poi mostrata con dissolvenza di 0,12 s. Algoritmo `preferred` (`ExtensionPopup.swift:239-287`): larghezza dichiarata dalla pagina, altrimenti `min-content`, altrimenti `scrollWidth`; poi altezza a quella larghezza; la barra di scorrimento conta solo se la pagina la chiede (`overflow: scroll`) o se supera 600 di altezza (bug con "Show scroll bars: Always", #1311).
- Prima apertura a 360×240; poi ogni estensione riparte dall'ultima dimensione (`lastSize`).
- Rete di sicurezza: misura comunque dopo 3 s, mostra comunque dopo 5 s.
- **Crescita**: ogni 0,25 s per i primi 2 s segue la pagina in entrambe le direzioni; poi solo cresce; dopo 6 s una volta al secondo. Una larghezza dichiarata dalla pagina viene seguita anche in riduzione (Bitwarden "narrow").
- Sfondo bianco dietro la pagina come in Chrome (molti popup non hanno sfondo).
- Comportamento `transient`: si chiude cliccando fuori. `window.close()` lo chiude.
- Un link `target=_blank` o `window.open` dal popup apre una **scheda** in primo piano e chiude il popup (Raindrop.io "Sign in", `ExtensionPopup.swift:388-412`). Mai `file:` o `javascript:`.
- Camera/microfono dal popup: chiesti sulla card della finestra in primo piano, a nome dell'estensione (`ExtensionPopup.swift:45-50`).
- Per WebKit il popup è una "scheda" senza indice nella finestra (`PopupPage`, `ExtensionPopup.swift:439-458`), così `tabs.getCurrent()` dà `undefined` e `extension.getViews({type:"popup"})` lo elenca (shim `ExtensionShims.swift:3286-3350`).
- `action.setPopup` per scheda o globale è ricordato dall'app (`ExtensionShims.popups`, `ExtensionShims.swift:6339-6349`); `action.openPopup` apre il popup che c'è **al momento della chiamata** (Inoreader lo imposta, lo apre e lo toglie subito, `ExtensionShims.swift:3611-3623`).
- Se il worker viene riavviato mentre il popup è aperto, il popup viene riaperto alla stessa pagina (`Extensions.swift:1092-1097`).

**Finestre popup delle estensioni** (`windows.create({type: "popup"})`, `Extensions.swift:2103-2172`): una piccola finestra con solo la pagina e una sottile riga con il sito sopra; non salvata, non ripristinata, chiusa quando l'estensione si spegne; ⌘W la chiude. Ammessi solo `http(s)`, `about:blank` o pagine della stessa estensione (errore `A popup window shows a website or the extension's own page.`). Dimensione chiesta rispettata se ≥ 200×150, tenuta dentro lo schermo; solo dimensione senza posizione: centrata (Affinity). Se deve prendere una scheda esistente (`tabId`) diventa una finestra browser normale. Finestre private rifiutate: `Private windows can't be opened by extensions.`

### 2.5 Permessi e accesso ai siti

Regole generali (`Extensions.load`, `Extensions.swift:633-719`):

- **Installare è il consenso**: tutto ciò che il manifest chiede viene concesso a ogni caricamento. I permessi opzionali si chiedono quando l'estensione li chiede.
- `nativeMessaging` è concesso a tutti per il canale verso Search, ma verso app reali solo se il manifest lo chiede (anche come opzionale, letto dal manifest originale: `Extensions.asksForNative`, `Extensions.swift:1729-1747`). Errore: `Access to native messaging requires the nativeMessaging permission.`
- `declarativeNetRequest` riceve anche `declarativeNetRequestWithHostAccess` (altrimenti WebKit scarta in silenzio redirect e header, caso Norma).
- Mai concesse: pagine di altre estensioni (`chrome-extension://*/*`) e file locali (`file:///*`), qualunque cosa dica il manifest o una richiesta successiva (`withheld`, `fence`, `Extensions.swift:1563-1639`). `<all_urls>` viene tenuto come `*://*/*`.
- Il proprio indirizzo di login `https://<id>.chromiumapp.org/*` è concesso a chi ha `identity`.
- Le richieste di WebKit "posso leggere questa pagina?" (stile Safari) vengono **rifiutate senza chiedere**, come Chrome che non chiede mai lì (`Extensions.swift:2212-2221`).

Domande all'utente (tutte come foglio sulla finestra, una alla volta; in Swift `NSAlert`):

| Quando | Titolo | Testo | Pulsanti |
|---|---|---|---|
| `permissions.request` di permessi WebKit | `<Name> asks for more access` | elenco dei nomi separati da virgola | `Allow` / `Don't Allow` |
| `permissions.request` di siti | `<Name> wants to read and change every website` oppure `... <pattern, pattern>` | `Until you remove the extension.` | `Allow` / `Don't Allow` |
| permessi che risponde Search | `<Name> asks for more access` | nomi con il punto sostituito da spazio | `Allow` / `Don't Allow` |
| aggiornamento che chiede di più | `Add “An update to <Name>” to Search?` | come installazione | `Add Extension` / `Cancel`, con **Invio = Cancel** ed Esc = Cancel |
| registrazione schermo | `“<Name>” wants to record your screen or a window.` | `macOS will ask what to share. Search remembers your answer for <Name>; Settings › Extensions takes it back.` | `Continue` / `Don't Allow` |
| pagina nuova scheda | `Show “<Name>” in new tabs?` | `It asked to replace the new tab page.` (oppure `It asked to replace the new tab page, which “<Altro>” shows now.`) + ` You can change this later in Settings › Browsing › Home page.` | `Keep It` / `Don't Allow` |

Note sulle domande:

- Permessi concessi senza domanda perché Chrome non avvisa: `tabGroups`, `sidePanel`, `offscreen`, `idle`, `power`, `fontSettings`, `search`, `system.cpu`, `system.memory`, `system.display`, `favicon` (`ExtensionShims.swift:6402-6403`).
- Si può chiedere solo ciò che il manifest nomina (`Only permissions specified in the manifest may be requested.`). Un nome sconosciuto a WebKit e a Search (es. `pageCapture`) viene escluso dalla domanda invece di far fallire tutto (Figma).
- Il "gesto utente" vale 5 s per `Extensions.justUsed` e 10 s per `permissions.afterClick`: un click sul pulsante o un click/tasto in una pagina dell'estensione (`Extensions.swift:1937-1977`, `ExtensionShims.swift:6410-6462`). Errore senza gesto: `Invalid call to permissions.request(). Must be called during a user gesture.`

**Runs on** (Site access di Chrome, `ExtensionSiteAccess.swift`), per ogni estensione che chiede siti web:

- Modalità: `All sites` (predefinita), `Some sites` (gli host elencati, sottodomini inclusi), `On click` (nessun sito finché non si preme il pulsante; poi quel sito su quella scheda finché la scheda non cambia sito).
- Voci nel menu di Impostazioni: `All Sites It Asks For`, `Only Sites I Name`, `Only When I Click It`; etichetta della capsula: il titolo della modalità.
- Gli host scritti vengono normalizzati (minuscolo, senza `www.`, senza porta, senza `*.`, `SiteAccess.host(from:)`, `ExtensionSiteAccess.swift:68-79`). Rimuovere `example.com` rimuove anche `news.example.com`.
- Implementato con i permessi di WebKit: un sito non concesso non riceve i content script (pagine più leggere). Al cambio si toccano solo le differenze per non rieseguire gli script nelle pagine aperte (`apply`, `ExtensionSiteAccess.swift:225-260`).
- Nota sotto la lista: `Subdomains included. Elsewhere it runs once you click its button, on that tab until it leaves the site.` (Some) / `It runs on a page once you click its button there, on that tab until it leaves the site.` (On click) + per i gestori di password ` <Name> may need every site to fill in sign-ins.` (riconosciuti per nome: password, passkey, 1password, bitwarden, lastpass, dashlane, keeper, proton pass, nordpass, enpass, roboform, oppure per `privacy.services.passwordSavingEnabled = false`).
- Tooltip: `Where <Name> runs. Fewer sites, less memory on the rest`.

**Schede private** (per estensione, spento di default, `Extensions.swift:1684-1717`):

- `Allow in Private Tabs` nel menu `…` della riga; se il manifest ha `"incognito": "not_allowed"` compare la voce non attiva `Private Tabs Aren’t Supported`.
- Tooltip: `Private tabs opened before any extension was allowed need reopening. Turned off, a script already running in one stops only when the page reloads.`
- Un'estensione non ammessa non vede le schede private (titolo vuoto, indirizzo vuoto, errore `No tab with that id.` su ogni azione), non può chiudere finestre che le contengono (`The window contains private tabs this extension cannot access.`), e il suo side panel resta in attesa quando davanti c'è una scheda privata.
- Un'estensione ammessa vede `incognito: true` sulle schede private (lo shim lo chiede all'app per posizione, `tabs.private`).

**Pagina nuova scheda** (`chrome_url_overrides.newtab`, `Extensions.swift:1296-1350`): Search chiede la prima volta che un'estensione vuole la nuova scheda (anche se un'altra la tiene già). Vince l'ultima a cui si è detto sì. Impostazioni › Browsing › Home page (`HomePageLine`, `ExtensionsUI.swift:500-541`) compare solo se qualcuno la chiede: menu con `Search's own` + estensioni; dettaglio `New tabs show <Name>'s page, since you let it replace them` / `New tabs open blank. <Name> asked to show its page instead` / `New tabs open blank. <n> extensions asked to show their page instead`.

**Salvataggio password**: se un'estensione accesa imposta `chrome.privacy.services.passwordSavingEnabled = false`, Search smette di offrire il salvataggio delle password e lo dice in Impostazioni › Passwords (`Extensions.passwordSavingTakenBy`, `Extensions.swift:1364-1366`; `Settings.swift:1137-1139`). È l'**unica** impostazione `chrome.privacy`/`chrome.proxy` che ha un effetto reale; le altre sono solo memorizzate.

### 2.6 Pagina di gestione: Impostazioni › Extensions

Ordine delle card (`ExtensionsPage.Installer`, `ExtensionsUI.swift:20-109`), spaziatura verticale 18:

1. **Add from the Chrome Web Store**: titolo `Add from the Chrome Web Store` (13 pt) con pillola `Open the Store` a destra; campo con segnaposto `Paste a link to an extension, or its id`; a destra spinner (anello 12) se qualcosa è in installazione, altrimenti pillola piena `Add` (disabilitata se il testo non contiene un id); sotto `Or find it in the store and press Add to Search on its page.` (11,5 pt, attenuato).
2. **From another browser**: riga `From another browser` / `What Chrome, Arc, Brave and the others added from the Chrome Web Store [U+2014] installed fresh from the store, you say yes to each one` con pillola `Bring them over…`.
3. **Installate**: se vuoto `No extensions yet.`; altrimenti una card con una riga per estensione separate da filetti, e sotto la nota `Each extension stays out of private tabs until you allow it in its … menu. One you allow can tell which tabs are private, but may still keep what you visit in them.`
4. **Recorders** (solo se esistono): una riga per estensione autorizzata a registrare, `<Name>` / `Can record your screen [U+2014] macOS asks what to share each time`, pillola `Remove`.
5. **Load an unpacked extension**: `Load an unpacked extension` / `A folder with a manifest.json [U+2014] your own, or one exported from another browser. Reload picks up what you've changed in it since.` con pillola `Choose…`.
6. **From Safari apps**: interruttore; testo `Safari extensions that came inside apps in Applications, added as unpacked extensions. Only their JavaScript runs: the app's own part doesn't, so anything that needs it (native messaging, content blockers) won't work.`; se acceso, righe `<Name>` / `In <App>` con `Add` o `Added`, oppure `No Safari extensions in your apps.`

Riga di un'estensione (`Row`, `ExtensionsUI.swift:182-314`):

- Icona 22×22 (dall'icona 32), altrimenti `puzzlepiece.extension`.
- Nome (13 pt) e dettaglio (11,5 pt) composto con ` · `: `Version <v>`, `Chrome Web Store` oppure `From “<cartella>”` (percorso completo nel tooltip) oppure `From a folder`; poi eventualmente `couldn't start`, `shows in new tabs`, `allowed in private tabs`, `<n> warning` / `<n> warnings` (errori registrati da WebKit).
- Se accesa e non partita: `Couldn’t start: <motivo di WebKit>` in rosso, selezionabile.
- Se parte ma non può fare quello per cui esiste: testo `cantDo` in rosso.
- A destra: capsula `Runs on` (se l'estensione chiede siti), menu `…` (accessibilità `More for <Name>`), interruttore acceso/spento.
- Se "Runs on" è ristretto, sotto compare `SiteList`: host con `xmark` (tooltip `Remove <host>`), campo `Add a site, like example.com` con pillola `Add`, nota.
- Menu `…` (anche con tasto destro sulla riga): `Pin to Toolbar` / `Unpin`; `Show in New Tabs` / `Stop Showing in New Tabs` (se l'estensione offre la nuova scheda); `Options`; `Reload` (solo se da cartella o non dal Web Store); separatore; `Allow in Private Tabs` o `Private Tabs Aren’t Supported`; separatore; `Remove` (distruttivo). **Da Impostazioni la rimozione non chiede conferma**, dal pulsante nella barra sì: replicare la differenza o uniformarla è una decisione da prendere.

Altri punti delle Impostazioni che toccano le estensioni (indice di ricerca in `SettingsIndex.swift`):

- `extensions` / `Installed` (`SettingsIndex.swift:104`), `extensions.sites` / `Where an extension runs` / `Each extension's Runs on: all sites, sites you name, or on click` / `Fewer sites means less memory on the rest. Right-click an extension's button to run it on the site you're on.` (`:691-695`), `extensions.safariApps` / `From Safari apps` (`:697-701`).
- Appearance › Tabs › "Buttons under the column": `Untick extensions, bookmarks or your profile to hide its button` (`:258-261`).
- Profili: `Extensions, passwords and settings are shared.` (`:477`): **le estensioni sono condivise tra profili**.

### 2.7 Aggiornamenti

(`Extensions.swift:1385-1532`, `Crx.swift:101-150`)

- Solo per le estensioni dal Web Store. Controllo "una volta al giorno" = ogni **20 ore** (`checkEvery = 60*60*20`), con un timer orario (tolleranza 5 min) così anche un browser aperto per giorni controlla.
- Fallimento (rete assente al risveglio, Web Store giù): ritenta dopo 1 h, poi 2, 4... mai oltre 20 h (`retryDelay`). Il giorno conta da un controllo riuscito.
- Richiesta fatta come il pulsante "Update" di Chrome (`installsource=ondemand`, `installedby=internal`, `os=mac`, `arch`, `os_arch`, `nacl_arch`, `prod=chromecrx`, `prodversion=156.0.0.0`, `acceptformat=crx3`) con intestazioni `X-Goog-Update-Interactivity: fg`, `X-Goog-Update-AppId: <id>`, `X-Goog-Update-Updater: chromecrx-156.0.0.0`; nessun ping, marca o lingua. Motivo: in background il Web Store rispondeva `noupdate` a Bitwarden 2026.11.0. **Su Windows `os=win`, `arch=x64`/`arm64`, `nacl_arch=x86-64`/`arm`.**
- Lettura della risposta: solo l'elemento `<updatecheck ...>` (bug storico: il primo `version=""` era quello della dichiarazione XML).
- Se la nuova versione chiede **di più** (permessi WebKit, siti `site:…`, API di Search `search:…`, vedi `Extensions.grants`, `Extensions.swift:1549-1557`), si chiede con il dialogo "An update to…" e Invio = Cancel; la risposta può aspettare giorni senza bloccare il giro. Altrimenti si sostituisce in silenzio.
- Sostituzione atomica: la copia funzionante resta finché la nuova non è completamente al suo posto (`ExtensionFiles.replace`, `renamex_np` con `RENAME_EXCL` poi `RENAME_SWAP`).
- Nessun aggiornamento automatico per le cartelle: `Reload` le ricopia dalla sorgente; se chiedono di più chiede (`<Name> wasn't reloaded [U+2014] it asks for more than before` se si rifiuta).

Avvisi di `Reload` (`Extensions.swift:923-1000`): `The folder <Name> was loaded from is gone`, `<Name> wasn't reloaded [U+2014] its folder now leads somewhere else`, `<Name> wasn't reloaded [U+2014] its app's signature doesn't check out`, `Couldn't copy <Name> again: <errore>`, `<Name> wasn't reloaded [U+2014] its manifest couldn't be read`, `Couldn't replace <Name>: <errore>`, `<Name> reloaded`, `<Name> couldn't start: <motivo>` oppure `<Name> couldn't start [U+2014] see Settings › Extensions`. Da app Safari: `<Name> wasn't added [U+2014] <App> has changed or isn't signed`.

### 2.8 Accendere, spegnere, rimuovere, avvio

- **Spegnere** (`setEnabled`, `Extensions.swift:1368-1378`): scarica il contesto e chiude tutto ciò che teneva fuori da WebKit: porte native e host, popup, documento offscreen, registrazioni in corso, side panel, assertion di risparmio energetico (`unload`, `Extensions.swift:775-815`). Il permesso di registrare viene dimenticato.
- **Rimuovere** (`remove`, `Extensions.swift:1205-1226`): cancella cartella e tutte le chiavi `extensions.*.<id>`, poi i dati: `chrome.storage` dal data store di WebKit e localStorage/IndexedDB/Cache Storage dell'origine `chrome-extension://<id>` caricando una pagina vuota in un contesto "sostituto" senza codice (`forgetData`, `Extensions.swift:1258-1294`). La lista `extensions.forgetting` sopravvive a crash e riprende al lancio successivo; un'estensione ricaricata con lo stesso id aspetta che la pulizia finisca.
- **Avvio** (`start`, `Extensions.swift:236-264`): dopo che la finestra è visibile (o subito se l'app parte nascosta), pulizia dei worker vecchi se serve, poi caricamento **una alla volta, 400 ms tra quelle con background** (se le carichi tutte insieme WebKit fallisce alcuni worker). Le pagine che si caricano in questo momento aspettano al massimo un limite (`whenStarted`) per avere i content script "document_start".
- **onInstalled** (`installReason`, `Extensions.swift:1020-1035`): "install" solo una volta dopo l'installazione; "update" dopo Reload o riavvio del worker nella stessa sessione; niente all'avvio del browser (come Chrome). Bug evitato: estensioni che riaprivano la scheda di benvenuto a ogni avvio (Raindrop, Dark Reader, Grammarly).

### 2.9 Valori visivi

| Elemento | Valori | Dove |
|---|---|---|
| Puzzle (`Door`) | 26×26, angolo 8 continuo, simbolo `puzzlepiece.extension` 11 medium, tooltip `Extensions` | `Extensions.swift:2542`, `Side.swift:2467-2475` |
| Pulsante estensione | 26×26, icona 15, sfondo al passaggio `Palette.hover`, angolo 8 continuo, tooltip = etichetta dell'azione o nome | `Extensions.swift:2562-2581` |
| Icona assente | iniziale maiuscola, font `size*0.62` semibold, `Palette.muted`, sfondo `Palette.wash`, angolo `size*0.28` | `Extensions.swift:2611-2619` |
| Riquadro icona | `size+4`; disabilitata opacità 0,4 | `Extensions.swift:2621-2622` |
| Badge | font 8 semibold, testo `Palette.ground` su capsula `Palette.ink`, padding orizzontale 3, min 12×11, offset (5, 3) | `Extensions.swift:2623-2632` |
| Spaziatura pulsanti | HStack spacing 2 | `Extensions.swift:2535` |
| Lista puzzle | larghezza 280, padding 6, righe alte 30, spacing 9, font 12,5, icona 16, angolo riga 8, altezza massima lista 360, sfondo riga al passaggio `Palette.wash` | `Extensions.swift:2718-2799` |
| Strumenti riga | 22×22, simbolo 10,5 medium, angolo 6 | `Extensions.swift:2802-2822` |
| Voci piede lista | icona 11 (larghezza 14), testo 12,5, padding 10/6, angolo 8 | `Extensions.swift:2824-2849` |
| Messaggio vuoto | 12,5 attenuato, padding 14 | `Extensions.swift:2721-2725` |
| Popup | min 25×25, max 800×600, primo 360×240, dissolvenza 0,12 s, sfondo bianco | `ExtensionPopup.swift` |
| Barra Web Store | capsula `Palette.ground`, bordo `Palette.hairline` 1, ombra nera 0,12 raggio 20 y 6, padding 16/10/9, icona 11 medium, testo 12,5, pulsante 12 con padding 11/5 su capsula `Palette.ink`; entra dal basso con dissolvenza; 30 pt dal fondo finestra | `ExtensionsUI.swift:457-482`, `App.swift:877-883` |
| Riga Impostazioni | padding 14/10, icona 22, nome 13, dettaglio 11,5, errori in `Palette.unsafe` fino a 3 righe | `ExtensionsUI.swift:187-262` |
| Campo link | font 12,5, padding 10/7, sfondo `Palette.wash` angolo 9 | `ExtensionsUI.swift:39-52` |
| Capsula Runs on | font 11,5, chevron `chevron.up.chevron.down` 8 semibold, alta 22, padding 8, sfondo `Palette.wash` | `ExtensionsUI.swift:338-349` |
| Menu `…` | `ellipsis` 11 semibold, 26×26 | `ExtensionsUI.swift:237-248` |
| Lista siti | font 12, `xmark` 9 semibold 18×18, campo 12 con padding 8/5 angolo 7, nota 11 | `ExtensionsUI.swift:369-416` |
| Side panel | larghezza 300..640, partenza 380; doppio click sul bordo la rimette | `SidePanel.swift:56-59` |
| Pillola registrazione | in basso al centro dello schermo, 24 pt dal fondo; punto rosso 7×7 (fermo, non pulsa), nome 12,5 semibold + testo 12,5, `Stop` 12 medium su capsula `Palette.ink` alta 22; angolo 18; non prende mai la tastiera | `RecordingIndicator.swift:150-216` |

I colori `Palette.*` sono coppie chiaro/scuro definite in `Design.swift` (fuori dalla mia area).

---

## 3. API chrome.*: cosa implementa Search e con quale livello

Legenda livello: **Pieno** (comportamento come Chrome per gli usi reali), **Parziale** (metodi principali, limiti scritti), **Stub** (presente per non far crashare, risponde vuoto o non fa niente), **Rifiuta** (presente ma risponde con errore come Chrome quando non può).

### 3.1 Namespace interi definiti da Search (WebKit non li ha)

Definiti con `define(name, methods, events)` (`ExtensionShims.swift:2745-2752`): ogni metodo diventa una chiamata nativa; gli eventi sono oggetti locali che **non vengono mai emessi** salvo dove indicato. La "porta" del permesso è controllata lato app, non nello shim (`gates`, `ExtensionShims.swift:5711-5732`).

| API | Metodi | Eventi | Livello | Note | Dove |
|---|---|---|---|---|---|
| `bookmarks` | get, getChildren, getRecent, getSubTree, getTree, search, create, move, update, remove, removeTree | onCreated, onRemoved, onChanged, onMoved, onChildrenReordered, onImportBegan, onImportEnded (mai emessi) | Parziale | Usa i segnalibri di Search; create/move rispettano `index` | `:2753`, nativo `:5860-5934` |
| `history` | search, getVisits, addUrl, deleteUrl, deleteRange, deleteAll | onVisited, onVisitRemoved (mai emessi) | Parziale | search predefinito ultime 24 h, max 100; getVisits sintetico; deleteAll pulisce anche favicon | `:2756`, `:5935-5978` |
| `downloads` | download, search, open, show, showDefaultFolder, erase | onCreated, onChanged, onErased, onDeterminingFilename | Parziale | download passa da una pagina normale (mai privata); `filename` con cartelle crea le cartelle in Download; blob: del worker convertito in data: (limite 512 MB); `onChanged` sintetico "complete/interrupted" per i propri download; `open` solo con `downloads.open`, gesto utente e solo file scaricati da lei. pause/resume/cancel/removeFile/getFileIcon: Rifiuta | `:2759-2806`, `:5980-6030` |
| `sidePanel` | open, close, setOptions, getOptions, setPanelBehavior, getPanelBehavior | (nessuno) | Pieno | Pannello vero a lato della pagina; opzioni per scheda; fino a 4 pannelli tenuti per finestra; pannello per scheda nascosto sulle altre | `:2807-2834`, `:6032-6100`, `SidePanel.swift` |
| `offscreen` | createDocument, closeDocument, hasDocument (+ `Reason` qualunque) | | Pieno | Uno per estensione, WKWebView 800×600 mai in finestra; frame interni ascoltati; usato anche per registrare | `:2835`, `ExtensionOffscreen.swift` |
| `tabGroups` | get, query, update, move | onCreated, onRemoved, onUpdated (emessi via porta `search.groups`), onMoved | Parziale | Gruppi di Search; colore sempre `grey`; `move` Rifiuta; `Color` enum presente (Claude); gruppi tenuti anche con gruppi spenti in Impostazioni | `:2837-2938`, `:6641-6702`, `ExtensionWatch.swift` |
| `fontSettings` | getFontList (font del Mac), getFont, get/set/clear Default/DefaultFixed/Minimum size | 4 eventi | Stub (le get danno valori fissi 16/13/0, le set non fanno niente) | `:2939`, `:6123-6135` |
| `management` | getSelf, get, getAll, setEnabled, uninstallSelf | onInstalled, onUninstalled, onEnabled, onDisabled | Parziale | getAll/get altri solo con `management`; icona come PNG data:; disabilitate incluse; setEnabled/uninstallSelf: `Extensions are turned on and off in Settings › Extensions` | `:2944`, `:6137-6158` |
| `notifications` | create, update, clear, getAll, getPermissionLevel | onClicked, onClosed, onButtonClicked, ... (mai emessi) | Parziale | Notifiche di sistema macOS (titolo, messaggio, sottotitolo = nome estensione); update dà false; getAll vuoto | `:2946`, `:6203-6226` |
| `tts` | speak, stop, pause, resume, isSpeaking, getVoices | onVoicesChanged | Parziale | `NSSpeechSynthesizer`, una voce per tutte; rate = 180×rate | `:2948`, `:6228-6256` |
| `identity` | launchWebAuthFlow, getAuthToken, getProfileUserInfo, removeCachedAuthToken, clearAllCachedAuthTokens, getRedirectURL | onSignInChanged | Parziale | launchWebAuthFlow interattivo (scheda in primo piano, chiusa = rifiuto, 10 min max) e silenzioso (vista invisibile, max un minuto); getAuthToken Rifiuta (`getAuthToken needs a Google account signed into Chrome; ...`); getProfileUserInfo vuoto | `:2949-2952`, `:6704-6722`, `ExtensionAuth` |
| `search` | query | | Pieno | Solo parole, mai indirizzi; CURRENT_TAB / NEW_TAB / NEW_WINDOW | `:2975`, `:6528-6540` |
| `idle` | queryState, getAutoLockDelay, setDetectionInterval (min 15 s) | onStateChanged (emesso via porta `search.idle`) | Pieno | locked letto da `CGSSessionScreenIsLocked`; getAutoLockDelay = 0 | `:2976-3003`, `ExtensionWatch.swift` |
| `power` | requestKeepAwake, releaseKeepAwake, reportActivity | | Pieno | Assertion IOKit "An extension in Search" | `:3004`, `:6548-6564` |
| `browsingData` | remove + removeAppcache/Cache/CacheStorage/Cookies/Downloads/FileSystems/FormData/History/IndexedDB/LocalStorage/Passwords/ServiceWorkers/WebSQL, settings | | Parziale | Solo i dati del profilo della finestra; formData/passwords non fanno nulla | `:3005`, `:6566-6582`, `:6862-6890` |
| `sessions` | getRecentlyClosed, getDevices, restore | onChanged | Parziale | Schede chiuse di Search; getDevices vuoto | `:3009`, `:6584-6600` |
| `topSites` | get | | Parziale | Top 10 host per conteggio nella cronologia | `:3010`, `:6602-6611` |
| `readingList` | query, addEntry, removeEntry, updateEntry | 3 eventi | Stub/Rifiuta (`Search has no reading list`) | `:3011`, `:6613-6617` |
| `system.cpu/memory/storage/display` | getInfo (+ storage ejectDevice/getAvailableCapacity Rifiuta) | onAttached, onDetached, onDisplayChanged | Parziale | Ognuno con il suo permesso | `:3013-3019`, `:6619-6639` |
| `privacy.services/network/websites` | oggetti setting get/set/clear + onChange | | Stub (memorizzati per estensione; effetto reale solo `passwordSavingEnabled`) | `:3020-3030`, `:6830-6858` |
| `contentSettings.*` | get (sempre "allow"), set, clear, getResourceIdentifiers | | Stub | `:3031-3039` |
| `proxy.settings` | get/set/clear | onProxyError | Stub (nessun effetto; WebKit non lo permette) | `:3040` |
| `omnibox` | setDefaultSuggestion + eventi | | Stub | `:3041` |
| `desktopCapture` | chooseDesktopMedia, cancelChooseDesktopMedia | | Pieno (solo se dichiarato) | Domanda di Search, poi selettore macOS; id monouso valido 60 s; da worker l'id serve a una sua pagina | `:3177-3197`, `ExtensionCapture.swift` |
| `tabCapture` | capture, getMediaStreamId (Rifiuta), getCapturedTabs ([]) | onStatusChanged | Rifiuta | Loom ripiega sullo schermo | `:3200-3203` |
| `pageCapture`, `debugger`, `gcm`, `instanceID` | tutti | | Rifiuta (`<api> isn't available in Search`) | `:3204-3212` |
| `declarativeContent` | onPageChanged.addRules/removeRules/getRules + costruttori | | Stub (ogni pulsante è sempre visibile) | `:3213-3219` |
| `userScripts` | register, update, unregister, getScripts, configureWorld, getWorldConfigurations, resetWorldConfiguration, ecc. | onUserScriptMessage/Connect | Pieno per gli usi di Tampermonkey/Violentmonkey/ScriptCat | Implementato con content script registrati di WebKit: ogni script scritto in un file `_search/us-*.js`, lista in `_search/userscripts.json`, mondi in `_search/worlds.json`; riregistrati a ogni avvio del worker | `:4736-4876`, `:6355-6386` |
| `runtime.getContexts` | | | Pieno | BACKGROUND, POPUP, SIDE_PANEL, OFFSCREEN_DOCUMENT | `:5122`, `:6167-6201` |
| `i18n.detectLanguage` | | | Pieno | `NLLanguageRecognizer` | `:5101`, `:6160-6166` |
| FileSystem API legacy (`requestFileSystem`, `webkitRequestFileSystem`, entries, FileWriter, URL `filesystem:`) | | | Pieno | Ricostruito sull'OPFS (GoFullPage) | `:5125-5620` |

### 3.2 API che WebKit ha e Search "rammenda"

Membri mancanti aggiunti con `fill` (`ExtensionShims.swift:3245`) o funzioni sostituite con `put` (oggetti di WebKit tenuti vivi in `__searchKept` perché WebKit li ricrea).

| API | Correzione | Dove |
|---|---|---|
| `runtime` | enum `OnInstalledReason`, `OnRestartRequiredReason`, `PlatformArch`, `PlatformNaclArch`, `PlatformOs`, `RequestUpdateCheckStatus`, `ContextType` (anche nei content script); eventi `onUpdateAvailable`, `onRestartRequired`, `onSuspend`, `onSuspendCanceled`, `onBrowserUpdateAvailable`, `onConnectNative`, `onUserScriptConnect`, `onUserScriptMessage`; `requestUpdateCheck` → `no_update`; `restart`, `restartAfterDelay`; `getPackageDirectoryEntry` Rifiuta | `:3263-3280`, `:736-750` |
| `runtime.sendMessage` / `onMessage` | Più listener: si attende quello che chiama `sendResponse` o restituisce true (regola Chrome); risposta mancata = `lastError` "The message port closed before a response was received."; relè dei messaggi tra pagine dell'estensione che WebKit non consegna; controllo che il worker sia vivo con riavvio | `:838`, `:1576-1760`, `:2631-2700` |
| `runtime.connect` / porte | Porte numerate, `onMessage` stabile, sender ricostruito, porte passate con `navigator.serviceWorker` | `:4970-5099`, `:964-1065` |
| `runtime.getPlatformInfo` | Funziona anche staccato dal suo oggetto (Vimium C) | `:2173` |
| `onInstalled` | Motivo vero chiesto all'app (`background.installReason`) | `:4877-4930` |
| listener aggiunti tardi | WebKit li rifiuta dopo l'avvio del worker; lo shim li accetta per gli eventi che il codice dell'estensione nomina (`__SEARCH_EVENTS__`) | `:4931-4969`, `ExtensionShims.swift:481-522` |
| `extension` | `getURL`, `ViewType`, `sendRequest`, `onRequest`, `onRequestExternal`, `getExtensionTabs`, `setUpdateUrlData`; `getViews` riconosce il popup di Search | `:3315-3355` |
| `tabs` | enum vari, `getZoomSettings`/`setZoomSettings`, `onZoomChange`, `onSelectionChanged`, `onActiveChanged`, `onHighlightChanged`, `getSelected`, `getAllInWindow`; `group`, `ungroup`, `move`, `discard`, `highlight` (per posizione); `getCurrent` undefined fuori da una scheda; `groupId` su ogni scheda; `incognito` vero; url/titolo/favIconUrl visibili con il solo permesso `tabs` (`tabs.describe`); `sendMessage` raggiunge anche le pagine dell'estensione incorniciate nella scheda | `:3298-3431`, `:4382-4606`, `:2701-2739`, `:6487-6526` |
| `windows` | `onBoundsChanged` (mai emesso), enum; `create` con `tabId`; `getCurrent` dalla finestra della pagina chiamante; `update` con posizione/dimensione | `:3432-3440`, `:4447-4547`, `Extensions.swift:2103-2172`, `:2489-2497` |
| `storage` | `managed` vuoto; `AccessLevel`; `set` accetta oggetti senza prototipo; `onChanged` inoltrato al popup e al "pop out"; localStorage condiviso tra le pagine dell'estensione incorniciate in siti diversi | `:3441-3592` |
| `scripting` | enum `ExecutionWorld`, `StyleOrigin`; `executeScript` con funzione da una pagina incorniciata (scritta in file); script registrati ricevono lo shim | `:3594-3597`, `:2560`, `:4745-4790`, `:6734-6760` |
| `action` / `browserAction` | `setPopup` comunicato all'app; `openPopup` aperto dall'app; `getUserSettings` → `isOnToolbar: true`; `setBadgeTextColor`/`getBadgeTextColor` | `:3601-3628` |
| `webNavigation` | eventi e enum mancanti | `:3629-3634` |
| `webRequest` | enum opzioni; `handlerBehaviorChanged`; listener con `ws://`, `wss://`, `webtransport`, `webbundle` filtrati invece di far fallire tutto; opzioni non supportate (`blocking`) tolte; listener tardivi non bloccano; `onBeforeSendHeaders`/`onSendHeaders` ricevono anche i fetch propri dell'estensione | `:3635-3647`, `:4331-4380`, `:851-912` |
| `declarativeNetRequest` | costanti e enum; `getAvailableStaticRuleCount`, `getDisabledRuleIds`, `updateStaticRules`; `testMatchOutcome` Rifiuta; regole riscritte nella forma che WebKit legge (`\d`, `\w`, conteggi `{n,m}`, liste vuote di esclusione, regex accanto a `requestDomains`, regole su intestazioni di risposta tolte, redirect verso file propri per percorso); regole sui frame separate; regole di sessione conservate tra avvii come dinamiche nascoste | `:3648-4280`, `ExtensionShims.swift:323-374` |
| `contextMenus` / `menus` | contesti `browser_action`/`page_action` → `action`, `launcher` tolto; pattern illeggibili (`abp:*`) tolti uno per uno | `:3662-3665`, `:4281-4313` |
| `alarms.create` | accetta la callback finale (Chrome 111+) | `:4315-4329` |
| `permissions` | `contains`, `request`, `getAll`, `remove` fusi tra permessi di WebKit e di Search; nomi sconosciuti ma dichiarati ignorati; pagine di estensioni e file mai | `:4638-4735`, `:6388-6486` |
| `i18n` | funzioni legate al loro oggetto; `getMessage("")` → `""` | `:5100-5121` |
| `cookies` | evento di cambio vuoto filtrato (GPTZero) | `:4607` |

### 3.3 Comportamenti trasversali (non sono API ma il codice delle estensioni ci conta)

| Comportamento | Perché su Mac | Dove | Su Chromium/Electron |
|---|---|---|---|
| User agent Chrome 156 e `userAgentData` in pagine e worker | WebKit dà lo UA di Safari | `:1463-1494` | **Serve ancora**: Electron mette `Electron/x` nello UA e la versione di Chromium di Electron; vanno ripuliti e allineati a Chrome stabile |
| Origine `chrome-extension://<id>` stabile | WebKit sceglieva un'origine casuale | `Extensions.swift:664` | Nativo; ma l'**id** va preservato (vedi §8) |
| Fetch con credenziali verso host concessi (cookie Lax/Strict) | WebKit tratta tutto come cross-site | `ExtensionFetch.swift` | Probabilmente nativo in Chromium (host permission = same-site), da verificare in Electron |
| Fetch dal worker verso localhost senza CORS | WebKit applica CORS | `ExtensionFetch.swift:69-91` | Nativo in Chromium con host permission |
| WebSocket nel worker | WebKit si blocca (deadlock) | `ExtensionSocket.swift`, `:1128-1233` | Non serve |
| Worker tenuto vivo con una porta verso un'app (battito 25 s) | WebKit scarica il worker dopo 2 min | `ExtensionNative.swift:122-134` | Chromium tiene vivo il worker con una porta native aperta; ma il native messaging in Electron va scritto da noi |
| Riavvio del worker morto (3 tentativi da 8 s, poi revive al massimo ogni 60 s) | WebKit perde worker | `ExtensionShims.swift:6266-6296`, `Extensions.swift:1070-1105` | Non serve in quella forma; serve un watchdog minimo |
| Pulizia worker vecchi all'avvio | WebKit riusa copie vecchie | `Extensions.swift:291-328` | Non serve |
| `clients.matchAll()` elenca popup e pagine | WebKit non li elenca | `:964-1065`, `:6325-6336` | Nativo se il popup è una vera pagina estensione |
| Pagine dell'estensione in un frame di un sito: le chiamate passano dal worker | WebKit uccide il processo del sito | `:751-762`, `:2026-2060` | Non serve |
| localStorage condiviso tra frame della stessa estensione su siti diversi | WebKit partiziona per sito | `:3493-3592` | Da verificare (partizionamento di Chromium per i frame di estensione) |
| CSP minima MV3 aggiunta al manifest | WebKit non la impone | `ExtensionShims.swift:59-101` | Nativo |
| Pagine `sandbox` | WebKit ignora la chiave | `ExtensionSandbox.swift` | Nativo in Chromium, da verificare in Electron |
| Script dell'estensione in pagina con CSP restrittiva | WebKit lo blocca | `ExtensionPageScript.swift`, `:647-730` | Nativo |
| Moduli multipli con top-level await concatenati | WebKit non aspetta | `ExtensionShims.swift:381-443` | Non serve |
| BOM UTF-8 sui `.js` | WebKit decodifica nella codifica del sito | `ExtensionShims.swift:280-304` | Non serve |
| `.wasm` streaming | WebKit non manda `application/wasm` | `:3221-3239` | Non serve |
| `requestIdleCallback`, `Symbol.dispose`, `InstallEvent.addRoutes`, `window` nel worker | Mancano in WebKit | `:557-603`, `:956-963`, `:913-938` | Non serve |
| `chrome`/`browser` resi accessor fissi (LavaMoat, polyfill) | WebKit trova i listener tramite quei globali | `:611-642` | Non serve |
| `chrome.runtime` per i siti di `externally_connectable` | WebKit lo chiama solo `browser` | `ExtensionExternal.swift` | Nativo in Chrome; **da verificare in Electron** |
| Patch passkey prima degli script MAIN world | Search ha una sua implementazione passkey | `ExtensionShims.swift:178-187`, `Passkeys.swift` | Probabilmente non serve (WebAuthn di Chromium/Windows Hello) |
| Errori delle pagine e del worker riportati all'app (max 40 per estensione) | diagnostica in Impostazioni | `:5621-5640`, `Extensions.swift:90-94` | Serve (UX "N warnings") |

### 3.4 Preparazione del pacchetto all'installazione

`ExtensionShims.prepare` (`ExtensionShims.swift:107-321`), rieseguita quando cambia la versione dello shim (timbro `.search-shim`, `preparation = "7"`):

1. Scrive `search-shim.js` (completo), `search-shim-content.js` (solo la parte che serve ai content script, circa 70 KB su 230), `search-passkeys.js`.
2. Aggiunge `nativeMessaging` (e `scripting` se c'è `userScripts`) ai permessi, annotandoli in `.search-added`.
3. Worker classico: shim scritto in testa al file tra marcatori; worker modulo: `import "/search-shim.js";` in testa. Un worker che è un link a un file del pacchetto diventa una copia (StopTheMadness).
4. Content script: le voci con stesso `run_at`/mondo/opzioni condividono una voce di shim messa davanti; MAIN world riceve solo la patch passkey.
5. CSP minima MV3; regole DNR che WebKit fraintenderebbe tolte dai file.
6. BOM UTF-8 sui `.js` con caratteri non ASCII; `<script src="/search-shim.js">` in testa a ogni `.html`; concatenazione moduli.

**Su Electron questa riscrittura dei pacchetti non serve quasi più.** Restano utili solo: un eventuale preload per le API mancanti (meglio implementarle lato browser che iniettare 230 KB) e la scrittura di `key` nel manifest per preservare l'id (§8).

### 3.5 Matrice per Electron: cosa c'è e cosa va aggiunto

Fonte: documentazione Electron "Chrome Extension Support" e librerie note, **non verificate in questo studio**. Va confermato con un prototipo sulla versione di Electron scelta.

| API | Electron base | Cosa fare per pareggiare Search |
|---|---|---|
| `runtime` (messaggi, porte, getURL, getManifest, onInstalled, onStartup) | Parziale | Verificare `getContexts`, `onInstalled` (rischio "install" a ogni avvio: Electron non persiste lo stato delle estensioni) |
| `storage.local` | Sì | `sync` (Search lo ha via WebKit, locale) e `managed` (vuoto) e `session`: da verificare |
| `i18n` | Sì | niente |
| `scripting` | Sì (quasi tutto) | verificare `registerContentScripts` |
| `tabs` | Parziale | Completare: query completa, create, update, move, remove, group/ungroup, highlight, discard, onUpdated/onActivated/onRemoved/onMoved, `incognito`, `groupId`, favIconUrl |
| `webRequest` | Sì (anche bloccante, ma il modulo `webRequest` di Electron ha la precedenza) | Coordinare con il blocco annunci integrato |
| `management` | Parziale | getAll con disabilitate, icone |
| `extension` | Parziale | getViews con popup |
| `devtools.*` | Sì | (Search non li menziona) |
| `action` / `browserAction` | **No** | UI completa: pulsanti, badge, popup, setPopup/openPopup, onClicked |
| `windows` | **No** | Implementare tutto, incluse finestre popup piccole |
| `contextMenus` | **No** | Implementare + integrare nel menu contestuale |
| `commands` | **No** | Implementare + Impostazioni › Shortcuts |
| `cookies` | **No** (da verificare) | Implementare su `session.cookies` |
| `webNavigation` | **No** (da verificare) | Implementare |
| `notifications` | **No** | Notifiche Windows (toast) |
| `permissions` | **No** (da verificare) | Implementare con le domande di Search |
| `alarms` | Da verificare | Se manca, implementare (uBlock Origin) |
| `declarativeNetRequest` | **No** | Motore DNR completo (uBlock Origin Lite, AdBlock, Norma, Privacy Badger, VOT): il pezzo più pesante |
| `sidePanel` | **No** | Pannello laterale + API |
| `offscreen` | **No** (da verificare) | WebContents nascosto per estensione |
| `tabGroups` | **No** | Gruppi di Search + eventi |
| `identity` | **No** | launchWebAuthFlow interattivo e silenzioso, `getRedirectURL`, intercetto `*.chromiumapp.org` |
| `userScripts` | **No** | Necessario per Tampermonkey/Violentmonkey/ScriptCat MV3 |
| `nativeMessaging` (`connectNative`, `sendNativeMessage`) | **No** | Implementare con registro di Windows (§5.3) |
| `bookmarks`, `history`, `downloads`, `sessions`, `topSites`, `search`, `idle`, `power`, `tts`, `fontSettings`, `browsingData`, `privacy`, `system.*`, `readingList`, `contentSettings`, `proxy`, `omnibox`, `desktopCapture`, `tabCapture`, `declarativeContent` | **No** | Stesso livello di Search (§3.1). Nota: su Electron `proxy` può diventare reale con `session.setProxy`, e `tabCapture` reale con la cattura del WebContents |
| `externally_connectable` | Da verificare | Necessario per Claude in Chrome (claude.ai consegna il login così) |
| Pagine `sandbox`, `web_accessible_resources`, CSP MV3 | Probabilmente sì (codice //extensions di Chromium) | Verificare |
| MV2 (`background.page`, `webRequestBlocking`) | Da verificare sulla versione | Se c'è, uBlock Origin MV2 potrebbe **funzionare meglio che su Mac** |

Librerie da valutare (non installate, solo note): `electron-chrome-extensions` (implementa parte di action, tabs, windows, contextMenus, cookies, notifications, webNavigation, commands; elenco esatto da verificare) e `electron-chrome-web-store` (installazione e aggiornamento dal Web Store). **Verificare la licenza**: mi risulta GPL-3 con licenza commerciale alternativa, incompatibile con una distribuzione MIT come quella di Search.

---

## 4. Correzioni per singole estensioni

Per ogni voce: cosa non andava su Search, cosa è stato fatto, dove, e se su Chromium/Electron il problema esiste. "Non serve" = difetto di WebKit; "Serve" = UX o API di Search da replicare; "Dipende" = dipende da come implementiamo noi l'API su Electron.

### 4.1 Gestori di password

| Estensione | Problema e correzione | Dove | Su Electron |
|---|---|---|---|
| 1Password | Apre il popup di sblocco solo da Chrome 149+: Search si dichiara Chrome 156 (prima 140) | `Crx.swift:35-42`, CHANGELOG 1.0.6 | **Serve**: UA e `prodversion` allineati a Chrome stabile |
| 1Password | Popup fermo su "connecting to the app": il worker controlla con `clients.matchAll()` se il popup è aperto, WebKit non lo elencava | `ExtensionShims.swift:964-1065` | Non serve se il popup è una vera pagina estensione |
| 1Password | Dopo un login riuscito il worker apre un WebSocket e WebKit si blocca: account mai aggiunto | `ExtensionSocket.swift` | Non serve |
| 1Password | Banner di accesso (pagina dell'estensione nel frame del sito) non riceveva `tabs.sendMessage` | `ExtensionShims.swift:2701-2739` | Non serve |
| 1Password | `loadURL` di una scheda sito verso una pagina dell'estensione: la scheda va ricreata con la configurazione dell'estensione | `Extensions.swift:2397-2408` | Non serve (probabile) |
| 1Password | Crash su macOS 15 leggendo gli errori del contesto | `Extensions.swift:1114-1138` | Non serve |
| 1Password | Host nativi lasciati vivi a ogni riavvio del worker (decine al giorno) | `ExtensionNative.swift:160-178` | **Serve** se scriviamo noi il native messaging |
| 1Password | Passkey: la scheda rispondeva dopo 10 s a vuoto mentre l'utente sceglieva | CHANGELOG 1.0.16 | Dipende (ponte passkey nostro?) |
| 1Password, Bitwarden, Proton Pass | Patch passkey davanti agli script MAIN world | `ExtensionShims.swift:178-187` | Probabilmente non serve |
| Bitwarden | `Symbol.dispose` mancante | `ExtensionShims.swift:557-563` | Non serve |
| Bitwarden | WebAssembly rifiutato nelle pagine MV3 su macOS 15 (avviso `cantDo`) | `Extensions.swift:756-763` | Non serve |
| Bitwarden | Popup "narrow": la larghezza segue anche in riduzione | `ExtensionPopup.swift:369-379` | **Serve** (popup costruito da noi) |
| Bitwarden | Server self-hosted: il popup non riceveva `storage.onChanged` | `ExtensionShims.swift:3445-3484` | Non serve se popup = pagina estensione vera |
| Bitwarden | `runtime.getContexts` per sapere dove mandare i messaggi | `ExtensionShims.swift:6167-6201` | **Da verificare** in Electron |
| Bitwarden | Messaggi dal background alle proprie pagine non consegnati | `ExtensionShims.swift:1576-1600` | Non serve |
| Bitwarden | `windows.update` (posizione/dimensione) e `windows.getCurrent` dalla finestra popup | `Extensions.swift:2487-2497`, `ExtensionShims.swift:4521` | **Serve** (API windows da scrivere) |
| Bitwarden | Finestra passkey/vault come piccola finestra popup | `Extensions.swift:2126-2169` | **Serve** |
| Bitwarden | `nativeMessaging` opzionale: sblocco con Touch ID verso l'app desktop | `Extensions.swift:1719-1747` | **Serve** (su Windows: Windows Hello via app desktop Bitwarden) |
| Bitwarden | Aggiornamento bloccato a 2026.10.2: controllo come pulsante "Update" | `Crx.swift:101-146` | **Serve** |
| Bitwarden | Con UA Safari il worker chiama un'app Safari migliaia di volte al secondo | `ExtensionShims.swift:1463-1467` | **Serve** (UA senza tracce non-Chrome) |
| Bitwarden | PIN di sblocco offerto come password da salvare | `Browser.swift:7605-7612` | **Serve** (password manager integrato: mai pagine `chrome-extension://`) |
| Bitwarden, Dark Reader | Controllano che il popup sia al proprio indirizzo | CHANGELOG 1.0.4 | Nativo se il popup carica `chrome-extension://<id>/...` |
| Proton Pass | `requestIdleCallback` mancante: rilevamento form fermo | `ExtensionShims.swift:564-603` | Non serve |
| Proton Pass | Prende la dimensione del popup che trova a DOMContentLoaded | `ExtensionPopup.swift:289-298` | **Serve** (misurare a DOMContentLoaded) |
| Proton Pass | Proxy su `chrome` che nasconde le API | `ExtensionShims.swift:624-628` | Non serve |
| NordPass | Ritorno all'estensione dopo l'autenticazione: "The page didn't load"; pagina pubblica aperta da https con la configurazione giusta e politica di redirect | `ExtensionRedirectPolicy.swift`, `ExtensionReturnNavigation.swift`, `Browser.swift:8719-8760` | Probabilmente nativo; verificare `web_accessible_resources` in Electron |
| NordPass | Vault in finestra popup | come sopra | **Serve** (windows API) |
| iCloud Passwords (estensione Apple) | Primo messaggio all'helper perso; worker scaricato dopo 2 min; helper lasciati vivi | `ExtensionNative.swift:112-158`, `ExtensionShims.swift:1374-1430` | **Serve** se si supporta: su Windows iCloud per Windows registra un host nativo per Chrome/Edge |
| Tutti i gestori | Nota "may need every site" in "Runs on" | `ExtensionSiteAccess.swift:166-173` | **Serve** |
| Tutti i gestori | `privacy.services.passwordSavingEnabled = false` spegne l'offerta di salvataggio di Search | `Extensions.swift:1362-1366` | **Serve** |

### 4.2 Blocco annunci e regole di rete

| Estensione | Problema e correzione | Dove | Su Electron |
|---|---|---|---|
| uBlock Origin Lite | Regole `regexFilter` accanto a `requestDomains`: WebKit ignora la lista e manda ogni pagina a `strictblock.html` dopo 30 s; regole tolte | `ExtensionShims.swift:323-374`, `:3784-3810`, test `Tests/extension_ubol.py` | Dipende dal nostro motore DNR (deve rispettare entrambe le condizioni) |
| uBlock Origin Lite | Regole su intestazioni di risposta: WebKit le ignora e blocca ogni `.bundle.js` (GitLab vuoto) | `ExtensionShims.swift:338-346` | Dipende: Chrome le supporta; il motore va fatto completo |
| uBlock Origin Lite | Blocca dal primo secondo: regole di sessione (735..920) conservate tra avvii come dinamiche nascoste | `ExtensionShims.swift:4114-4280`, `Extensions.swift:1037-1067`, test `Tests/session_rules_kept.py` | Dipende (se il nostro motore compila velocemente non serve) |
| uBlock Origin Lite | Pagina ripristinata all'avvio prima delle estensioni | `Extensions.swift:266-282` | **Serve** (caricare estensioni prima di ripristinare le schede) |
| uBlock Origin Lite | Avviso "uBlock Origin Lite... blocks them here" | `Extensions.swift:751-753` | Dipende dal supporto MV2 |
| uBlock Origin (MV2) | `webRequestBlocking` impossibile in WebKit (solo filtri cosmetici) | `Extensions.swift:727-754` | Probabilmente funziona su Electron se MV2 è ancora caricabile (da verificare) |
| uBlock Origin | `alarms.create` con callback finale rifiutato: nessun timer | `ExtensionShims.swift:4315-4329` | Dipende (alarms in Electron?) |
| uBlock Origin | `contextMenus` con pattern `abp:*` fa fallire tutto il menu | `ExtensionShims.swift:4292-4313` | Dipende dalla nostra implementazione di contextMenus |
| uBlock Origin | `i18n.getMessage("")` lancia eccezione: popup morto | `ExtensionShims.swift:5102-5121` | Non serve |
| AdBlock | `webRequest` con tipi `webtransport`/`webbundle` rifiutati | `ExtensionShims.swift:4355-4362` | Non serve |
| AdBlock | Compilazione regole: 1,1 GB di memoria non restituita | `Trim.swift` | Dipende |
| Norma | Redirect DNR verso la propria pagina di blocco ignorato senza `WithHostAccess`; `?`/`#` del percorso ripristinati | `Extensions.swift:673-681`, `ExtensionRedirectPolicy.swift:7-38` | Dipende (motore DNR) |
| Privacy Badger | Frame giudicato da sé stesso invece che dalla pagina che lo contiene (login SoundCloud) | `ExtensionShims.swift:3925-3953`, test `Tests/extension_initiator_frames.py` | Dipende (motore DNR: `initiatorDomains` dei sub_frame come Chrome) |
| Voice-over-Translation | Regole `modifyHeaders` non applicate ai fetch propri; header sconosciuto fa cadere la regola | `ExtensionShims.swift:843-850`, `:4037-4060`, `ExtensionFetch.swift:303` | Dipende |
| Lexirise e simili | Memoria: un grant con wildcard copre gli host nominati | `Extensions.swift:1585-1600` | Non serve |

### 4.3 Side panel, AI, login

| Estensione | Problema e correzione | Dove | Su Electron |
|---|---|---|---|
| Claude in Chrome | Worker fermo su `chrome.tabGroups.Color` mancante | `ExtensionShims.swift:2837-2841` | **Serve** (tabGroups da scrivere) |
| Claude in Chrome | Funziona solo in un gruppo suo: gruppi tenuti anche con gruppi spenti | `ExtensionShims.swift:6641-6647` | **Serve** |
| Claude in Chrome | `tabs.getCurrent()` deve essere `undefined` nel side panel ("Claude isn't available on this page") | `ExtensionShims.swift:3298-3313` | Dipende (side panel nostro) |
| Claude in Chrome | Side panel per scheda tenuto mentre si è su altre schede (fino a 4 per finestra) | `SidePanel.swift:269-366`, test `Tests/side_panel.py` | **Serve** |
| Claude in Chrome | Pannello "Log in" pur essendo loggati: cookie Lax non mandati ai fetch dell'estensione | `ExtensionFetch.swift` | Probabilmente nativo |
| Claude in Chrome | Pannello vuoto con piano a pagamento: claude.ai in frame senza cookie; Search simula il messaggio di claude.ai | CHANGELOG 1.0.13, test `Tests/claude_panel_frame.py` | Probabilmente nativo (Electron non blocca i cookie di terze parti di default) |
| Claude in Chrome | Login consegnato da claude.ai via `externally_connectable` e `chrome.runtime.sendMessage(id, ...)`; messaggio a estensione assente deve fallire ("Receiving end does not exist") | `ExtensionExternal.swift` | **Da verificare** |
| Claude in Chrome | Re-login silenzioso a ogni avvio (`launchWebAuthFlow` non interattivo) | `ExtensionShims.swift:7031-7062` | **Serve** (identity da scrivere) |
| Claude in Chrome | `windows.create` per le sue finestre | `Extensions.swift:2103` | **Serve** |
| ChatGPT | Pannello acceso solo per la scheda del click: click su scheda senza pannello va all'estensione | CHANGELOG 1.0.7 | **Serve** (sidePanel per scheda) |
| ChatGPT | Pannello non loggato (frame chatgpt.com) | ROADMAP #837 | Probabilmente nativo |
| Sider, Merlin | Side panel | `SidePanel.swift:11-13` | **Serve** |
| Figma | "Allow additional permissions": `pageCapture` sconosciuto, click perso, `<all_urls>` revocato appena dato | `Extensions.swift:1612-1639`, `ExtensionShims.swift:4653-4735` | Dipende (permissions nostro) |
| Figma | Login: osserva la scheda finché arriva a `<id>.chromiumapp.org` | `ExtensionShims.swift:7290-7320` | **Serve** (identity) |
| Affinity Pathfinder | localStorage del pannello per sito; messaggi della scheda ai frame dell'estensione; `windows.create` dal frame; finestra di login centrata | `ExtensionShims.swift:3493-3592`, `:2383`, `Extensions.swift:2174-2200` | Da verificare (partizionamento); windows **serve** |
| Save to Notion | Cookie del sito concesso non inviati senza `credentials` | CHANGELOG 1.0.13 | Probabilmente nativo |
| Brandsearch | Cookie non inviati dal worker | CHANGELOG 1.0.16 | Probabilmente nativo |
| Similarweb | Legge il Cookie della propria richiesta in `onSendHeaders`; pannello in frame dentro frame vuoto rifiutato da `web_accessible_resources` | `ExtensionShims.swift:852-912`, CHANGELOG 1.0.16 | Probabilmente nativo |

### 4.4 Lettura, salvataggio, produttività

| Estensione | Problema e correzione | Dove | Su Electron |
|---|---|---|---|
| Readwise Highlighter | Il `window` finto messo nel worker per Eagle rompeva il suo controllo `'window' in self`: ora solo per estensioni che usano `getBackgroundPage` | `ExtensionShims.swift:913-938` | Non serve |
| Raindrop.io | Il server accetta solo l'origine `chrome-extension://<id>` | `Extensions.swift:144-150` | **Serve** (id del Web Store preservato) |
| Raindrop.io | "Sign in" nel popup con `target=_blank` non faceva nulla | `ExtensionPopup.swift:388-412`, test `Tests/extension_popup_link.py` | **Serve** (host del popup nostro) |
| Raindrop.io | Popup da scorciatoia con colonna nascosta | `Extensions.swift:2004-2027`, test `Tests/extension_folded_popup.py` | **Serve** |
| Raindrop.io, Dark Reader, Grammarly | Scheda di benvenuto riaperta a ogni avvio | `Extensions.swift:1020-1035`, test `Tests/extension_installed_reason.py` | **Probabile anche su Electron**: verificare e replicare la logica |
| Grammarly | Primo avvio dopo aggiornamento: preparazione 450 ms fuori dal thread principale | `Extensions.swift:637-651` | Non serve |
| Zotero Connector | Pagine `sandbox` con eval | `ExtensionSandbox.swift`, test `Tests/extension_sandbox_pages.py` | Probabilmente nativo |
| Zotero Connector | Porta passata con `navigator.serviceWorker.ready` | `ExtensionShims.swift:1047-1065` | Non serve |
| Stylus | `InstallEvent.addRoutes` mancante; porta via `navigator.serviceWorker`; dati chiesti al worker | `ExtensionShims.swift:956-963`, test `Tests/extension_stylus.py` | Non serve |
| Stylus | Nessuno stile in un "peek" o piccola finestra: WebKit rifiuta "Tab not found" | `Extensions.swift:557-596` | **Serve** se la versione Windows ha Peek e piccole finestre (vanno dichiarate come schede senza finestra) |
| Eagle, 好采助手 | Fetch dal worker a `http://localhost:41595`: CORS e pattern con porta | `ExtensionFetch.swift:69-91` | Probabilmente nativo |
| Eagle | `getBackgroundPage() === window` nel worker | `ExtensionShims.swift:913-938` | Non serve |
| SingleFile | Getter `browser` proprio; download di blob del worker; aspetta `downloads.onChanged` | `ExtensionShims.swift:617-620`, `:2762-2806` | **Serve** (downloads da scrivere con onChanged) |
| GoFullPage | FileSystem API legacy e URL `filesystem:` | `ExtensionShims.swift:5125-5620` | Nativo in Chromium (da verificare in Electron) |
| Inoreader | `openPopup` con popup tolto subito dopo | `ExtensionShims.swift:3611-3623` | **Serve** (action nostro) |
| Session Buddy | `windows.onBoundsChanged` mancante faceva fallire l'avvio | `ExtensionShims.swift:3432-3437` | **Serve** (windows completo di eventi) |
| Floccus | Segnalibri: `index` in create/move | `ExtensionShims.swift:5876-5879` | **Serve** |
| Extension Manager | `management.getAll` vuoto | `ExtensionShims.swift:6150-6156` | Da verificare |
| Monarch Money | `i18n.getMessage` chiamato staccato | `ExtensionShims.swift:5102-5106` | Non serve |
| Aino | `scripting.executeScript` con funzione da pagina incorniciata | `ExtensionShims.swift:6734-6760` | Non serve |
| Lokal | Documento offscreen pronto prima del caricamento | `ExtensionOffscreen.swift` | **Serve** (offscreen da scrivere) |
| Timvis | Richiesta di un singolo sito coperto da wildcard opzionale | `ExtensionShims.swift:6430-6441` | Dipende (permissions nostro) |
| Are.na | Voci del menu destro sulle immagini | CHANGELOG 1.0.13 | Dipende (contextMenus nostro) |
| Google Translate | Larghezza popup con barre di scorrimento sempre visibili | `ExtensionPopup.swift:233-238` | **Serve** (misura senza scrollbar) |
| Translate Page | `detectLanguage` in parallelo | `ExtensionShims.swift:6160` | Dipende |

### 4.5 Video, YouTube, registrazione

| Estensione | Problema e correzione | Dove | Su Electron |
|---|---|---|---|
| Enhancer for YouTube | Script eseguiti 4 volte (grant sovrapposti `/embed/*`, `/live_chat*`, `/shorts/*`) | `Extensions.swift:1587-1597` | Non serve; ma la nostra "Runs on" non deve duplicare le iniezioni |
| Language Reactor, Ambient light | `<script src=chrome-extension://...>` bloccato dalla CSP di YouTube | `ExtensionPageScript.swift` | Non serve |
| Language Reactor | Background page + worker: riavviata ogni pochi secondi dal controllo del worker | `ExtensionShims.swift:2685-2691` | Non serve |
| Control Panel for YouTube | `const browser` proprio nel popup | `ExtensionShims.swift:629-632` | Non serve |
| Cosmos | webextension-polyfill sostituiva `browser` nel worker: niente `action.onClicked` | `ExtensionShims.swift:633-641` | Non serve |
| Loom, Screencastify, Awesome Screenshot | `desktopCapture` + `getUserMedia` con `chromeMediaSource`; forma callback di `getUserMedia`; `tabCapture` rifiutato e Loom ripiega sullo schermo | `ExtensionCapture.swift`, `ExtensionShims.swift:3043-3203` | **Serve** (desktopCapture con selettore nostro; su Windows non c'è il selettore di sistema di macOS) |
| Tella, ScreenPal, Vidyard | Registrazione da documento offscreen: pagina "prestata" alla pillola | `RecordingIndicator.swift:12-16`, `ExtensionOffscreen.swift:25-27` | Dipende (offscreen nostro) |
| GPTZero | Evento cookie vuoto e enum mancanti nei content script | `ExtensionShims.swift:731-750`, `:4607` | Non serve |

### 4.6 Script utente e tastiera

| Estensione | Problema e correzione | Dove | Su Electron |
|---|---|---|---|
| Tampermonkey, Violentmonkey, ScriptCat | `chrome.userScripts` costruito su content script registrati | `ExtensionShims.swift:4736-4876` | **Serve** (userScripts da scrivere) |
| Tampermonkey | `importScripts` di file mancante/vuoto | `ExtensionShims.swift:949-955` | Non serve |
| ScriptCat | Messaggi via `navigator.serviceWorker` al documento offscreen | `ExtensionShims.swift:974-979` | Non serve |
| Vimium | Tasti morti per worker vecchio ricordato da WebKit | `Extensions.swift:293-322` | Non serve |
| Vimium | Vomnibar (frame cross-site) non prende la tastiera al primo tasto | `ExtensionShims.swift:2514-2550` | Non serve (probabile) |
| Vimium, iCloud Passwords | Pagine dell'estensione in frame: chiamate che facevano ricaricare la pagina | `ExtensionShims.swift:751-762` | Non serve |
| Vimium C | `getPlatformInfo` staccato; moduli con await; pagina opzioni vuota | `ExtensionShims.swift:2173`, `:381-443` | Non serve |
| StopTheMadness | Worker che è un link; id da cartella come Chrome per l'host nativo | `ExtensionShims.swift:445-464`, `Crx.swift:44-50` | Id: **Serve** (vedi §8) |
| Catppuccin, Backpack, MetaMask | Shim condiviso tra voci; BOM UTF-8; LavaMoat | `ExtensionShims.swift:188-206`, `:280-304`, `:546-549` | Non serve |

### 4.7 Problemi ancora aperti su Mac (ROADMAP)

Da tenere come lista di regressione su Windows, perché potrebbero funzionare gratis: Eagle (riga 47), NordPass (191), Loom (48), crxMouse Gestures (139), mymind (168), Todoist e Clockify (150), estensioni VPN (147) e proxy (236), ChatGPT side panel loggato (166), "Extensions per space" (107, rimandata), estensioni Safari tipo wBlock (259).

---

## 5. Preinstallate, liste di blocco, native messaging, offscreen, service worker

### 5.1 Estensioni preinstallate o consigliate

- **Nessuna estensione preinstallata né consigliata** nel codice. La filosofia (README, "What it doesn't do") è: "No extension you have to install to feel at home": blocco annunci, elementi nascosti, modalità lettura, picture-in-picture e password sono integrati.
- L'unico "suggerimento" è il pulsante che porta a `https://chromewebstore.google.com/category/extensions` e la funzione "Bring them over" che reinstalla quelle già usate in altri browser Chromium.
- Il side panel offre **siti** (non estensioni): Claude, ChatGPT, Gemini, Perplexity (`SidePanel.swift:41-47`).

### 5.2 Liste di blocco

- Il blocco annunci integrato **non è un'estensione**: `Shield.swift` compila una `WKContentRuleList` da una lista curata a mano di domini (`Shield.unwanted`), regole YouTube (`YouTubeAds.rules`) e spazi pubblicitari per sito (`slotsBySite`), ispirata a EasyList/EasyPrivacy. Nessun download di liste. È un'altra area dello studio; qui conta che su Windows andrà coordinato con `webRequest`/DNR delle estensioni (in Electron il modulo `session.webRequest` ha un solo listener per evento).
- Per le estensioni Search non fornisce liste: usa quelle delle estensioni (uBlock Origin Lite, AdBlock), con le correzioni del §4.2 e la restituzione della memoria dopo la compilazione (`Trim.swift`).

### 5.3 Native messaging

Mac (`ExtensionNative.swift`):

- Cartelle lette, in quest'ordine (`ExtensionNative.swift:31-51`):
  1. (solo test) `<cartella dati di Search>/NativeMessagingHosts`
  2. `~/Library/Application Support/Google/Chrome/NativeMessagingHosts`
  3. `~/Library/Application Support/Chromium/NativeMessagingHosts`
  4. `~/Library/Application Support/Microsoft Edge/NativeMessagingHosts`
  5. `~/Library/Application Support/BraveSoftware/Brave-Browser/NativeMessagingHosts`
  6. `~/Library/Application Support/Arc/User Data/NativeMessagingHosts`
  7. `/Library/Google/Chrome/NativeMessagingHosts`
  8. `/Library/Application Support/Chromium/NativeMessagingHosts`
  9. `/Library/Microsoft/Edge/NativeMessagingHosts`
  10. `~/Library/Application Support/Vivaldi/NativeMessagingHosts` (letto per ultimo)
  11. `~/Library/Application Support/com.operasoftware.Opera/NativeMessagingHosts`
- Regole: nome host `^[a-z0-9_]+(\.[a-z0-9_]+)*$`; file `<nome>.json` con `path` (assoluto o relativo alla cartella) e `allowed_origins` che deve contenere `chrome-extension://<id>/`; eseguibile esistente. Il primo file trovato decide (anche un rifiuto).
- Errori come Chrome: `Invalid native messaging host name`, `Access to the specified native messaging host is forbidden.`, `Specified native messaging host not found.`, `Native host has exited.`, `Message too long for a native host`.
- Processo avviato con un solo argomento: l'origine `chrome-extension://<id>/`. stderr scartato. SIGPIPE disattivato.
- Protocollo: 4 byte di lunghezza little endian + JSON; massimo 1 MB per messaggio in entrambe le direzioni (`frameCap = 1 << 20`); un messaggio troppo lungo chiude la connessione.
- Chiusura come Chrome: stdin chiuso + SIGTERM, SIGKILL dopo 2 s; fine quando l'output si chiude; dopo l'uscita si legge fino in fondo, con 1,5 s di grazia se un figlio tiene aperto l'output.
- `sendNativeMessage`: avvia, scrive, legge una risposta, ferma. `connectNative`: tiene aperto. Più di 12 fallimenti in un secondo per coppia estensione/host: risposta rallentata di 1 s (`Extensions.swift:2272-2279`).
- Porte del worker: battito ogni 25 s per evitare lo scarico del worker; host del worker precedente fermati quando il worker riparte; host orfani fermati (`stopOrphans`). Log in `com.officecommun.search` categoria `ExtensionNative`.
- Le porte con nomi riservati (`search`, `search.fetch`, `search.socket`, `search.groups`, `search.idle`) non sono app reali (`Extensions.swift:2283-2307`).

Windows (cosa cambia, da verificare con la documentazione Chrome):

- Gli host si trovano nel **registro**, non in cartelle: `HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\<nome>` e `HKEY_LOCAL_MACHINE\Software\Google\Chrome\NativeMessagingHosts\<nome>` (anche la vista `WOW6432Node`), con valore predefinito = percorso del file JSON. Equivalenti per Chromium (`Software\Chromium`), Edge (`Software\Microsoft\Edge`), Brave (`Software\BraveSoftware\Brave-Browser`), Vivaldi e Opera (chiavi esatte da verificare).
- Chrome su Windows passa anche `--parent-window=<handle>` e avvia l'host tramite `cmd.exe` (così funzionano anche `.bat`/`.cmd`): da verificare e replicare, perché alcuni host lo presuppongono.
- stdin/stdout in modalità binaria; lunghezza in ordine nativo (little endian su x64/arm64).
- **Electron non ha native messaging**: va scritto da zero nel processo principale (`child_process.spawn`), esposto come `runtime.connectNative`/`sendNativeMessage`. Estensioni che lo usano davvero: 1Password, Bitwarden (sblocco biometrico), iCloud Passwords, KeePassXC-Browser, StopTheMadness (solo Mac) e i clipper che parlano con un'app desktop. Zotero Connector e Eagle invece parlano con la loro app via HTTP su localhost (vedi `ExtensionFetch`).

### 5.4 Documenti offscreen

(`ExtensionOffscreen.swift`, `ExtensionShims.swift:6102-6121`)

- Uno per estensione (`Only a single offscreen document may be created.`); deve essere una pagina dell'estensione (`The offscreen document must belong to this extension.`).
- `WKWebView` 800×600 mai messa in una finestra, preferenze copiate con `inactiveSchedulingPolicy = .throttle`; con motivo `USER_MEDIA` può usare il microfono senza essere a fuoco (Search chiede comunque e la pillola lo dice).
- Registrata presso WebKit come "scheda senza finestra" per identificare i content script dei suoi frame (mai nella lista delle schede: lo shim scarta l'`onRemoved` con finestra -1).
- `createDocument` risponde solo quando la pagina ha finito di caricare; errori `The offscreen document did not finish loading.`, `The offscreen document has no page identifier.`, `The offscreen document's web process exited.`, `The offscreen document was closed.`
- Elencata in `runtime.getContexts` (`OFFSCREEN_DOCUMENT`) e in `clients.matchAll`.
- Chiusa allo spegnimento/rimozione dell'estensione.
- Quando registra (motivi `USER_MEDIA` o `DISPLAY_MEDIA`) la sua vista viene "prestata" alla pillola di registrazione (2×2 pt dietro il contenuto), perché WebKit non avvia catture da pagine non visibili.

### 5.5 Service worker e background

- Manifest V3 (`service_worker`, anche `type: module`) e V2 (`background.scripts`/`page`): WebKit esegue una pagina di background quando il manifest nomina sia script sia worker.
- Avvio sequenziale (400 ms tra estensioni con background), riavvio automatico se WebKit registra `backgroundContentFailedToLoad` (dopo 2 s), `background.wake` con 3 tentativi da 8 s poi `revive` (massimo una volta al minuto), controllo di vita dalle pagine con `__searchPing` (3 tentativi a 1 s, poi sveglia, poi revive) (`Extensions.swift:1140-1160`, `ExtensionShims.swift:2631-2700`, `:6258-6296`).
- WebKit scarica il worker dopo circa 30 s di inattività (commento a `ExtensionShims.swift:2631`) e dopo 2 minuti senza post su una porta: Search mantiene vivo il worker solo con porte verso app (battito).
- `ExtensionWorkerRecovery`: numeri di generazione scritti nello shim (`__SEARCH_WORKER_GENERATION__`) così pagine e content script sanno **una volta** che il worker è stato davvero riavviato; le porte vecchie vengono chiuse senza riconnessioni nascoste.
- Cache dei worker WebKit svuotata all'avvio solo se cambia la combinazione versione shim + estensioni installate, e solo se ci sono estensioni (altrimenti si perderebbero i service worker di Gmail, YouTube, ecc.) (`Extensions.swift:291-328`).
- Il worker non riceve mai lo user agent delle schede: tutte le viste (schede, estensioni) usano lo stesso `applicationNameForUserAgent`, altrimenti WebKit fermava i worker a ogni pagina (`Extensions.swift:208-214`).
- Su Electron/Chromium quasi tutto questo non serve; resta da replicare: ordine di caricamento all'avvio, attesa delle estensioni prima di ripristinare le schede, semantica corretta di `onInstalled`, chiusura degli host nativi quando il worker riparte.

### 5.6 Side panel delle estensioni

- `SidePanelContent.page(extensionID:url:tab:)`: la pagina del pannello è costruita con la configurazione dell'estensione (è una sua pagina a tutti gli effetti).
- Sul lato opposto alle schede, largo quanto lasciato (300..640, partenza 380), con doppio click sul bordo per tornare al valore predefinito; card propria se la pagina è una card.
- Pannello per scheda (`setOptions` con `tabId`): nascosto sulle altre schede e ripristinato tornando; massimo 4 pannelli tenuti per finestra (`SidePanelPages.keeps = 4`), il più vecchio liberato per primo; se la scheda indicata non è davanti, il pannello aspetta quella scheda (idea 643).
- Pannello disattivato (`enabled: false`) mentre è aperto: si chiude.
- `openPanelOnActionClick`: il pulsante apre il pannello invece del popup.
- Se il pannello non può essere creato, la pagina si apre in una scheda.
- Con una scheda privata davanti e l'estensione non ammessa: il pannello resta in attesa (non chiuso) e la pagina prende lo spazio.
- Lo stesso pannello ospita anche siti (View › Side Panel) e i download: fuori dalla mia area, ma la UI è condivisa.

---

## 6. Cosa viene salvato e dove (Mac) e proposta per Windows

### 6.1 File

| Cosa | Percorso Mac | Note |
|---|---|---|
| Cartella dati | `~/Library/Application Support/Search/` (test: `Search (test)` o `Search (<nome>)`) | `Store.folder`, `Store.swift:122-135`; migrazione da `Office Browser` |
| Estensioni installate | `~/Library/Application Support/Search/Extensions/<id>/` | pacchetto decompresso e preparato |
| Lista | `~/Library/Application Support/Search/Extensions/installed.json` | array di `Installed` (`id`, `name`, `version`, `enabled`, `fromStore`, `permissions`, `pinned`, `source`, `fromApp`) |
| Staging | `.../Extensions/.staging-<id>-<uuid>/` | cancellata a fine operazione |
| File aggiunti da Search nel pacchetto | `search-shim.js`, `search-shim-content.js`, `search-passkeys.js`, `search-modules-<pagina>.js`, `.search-shim` (timbro), `.search-added` (permessi aggiunti) | `ExtensionShims.swift:30-54` |
| Script utente | `.../Extensions/<id>/_search/userscripts.json`, `_search/worlds.json`, `_search/us-*.js` | `ExtensionShims.swift:6355-6386` |
| `chrome.storage` (local, sync, session) | Archivio dati estensioni di WebKit (`WKWebExtensionController.Configuration.default()`), gestito da WebKit | cancellato alla rimozione |
| localStorage, IndexedDB, Cache Storage delle pagine estensione | Website data store di Search (`Store.websites`) sotto l'origine `chrome-extension://<id>` | cancellato alla rimozione con pagina vuota |
| Download temporanei | `NSTemporaryDirectory()/search-crx-<uuid>/` | per la decompressione |

### 6.2 Impostazioni (UserDefaults `com.officecommun.search`)

| Chiave | Contenuto | Dove |
|---|---|---|
| `extensions.workers` | firma "versione shim + id versione" per decidere se svuotare i worker | `Extensions.swift:304` |
| `extensions.checked` | data dell'ultimo controllo aggiornamenti riuscito | `Extensions.swift:1392` |
| `extensions.retry` | prossimo tentativo dopo un fallimento | `:1393` |
| `extensions.failures` | numero di fallimenti consecutivi | `:1394` |
| `extensions.forgetting` | id i cui dati sono ancora da cancellare | `:1231` |
| `extensions.kept.<id>` | regole di sessione conservate | `:1048` |
| `extensions.newtab.<id>` | sì/no alla pagina nuova scheda | `:1214`, `:1307` |
| `extensions.private.<id>` | ammessa nelle schede private | `:1688` |
| `extensions.settings.<id>` | valori `chrome.privacy`/`chrome.proxy` impostati | `:1353-1360` |
| `extensions.granted.<id>` | permessi "di Search" concessi dopo l'installazione | `ExtensionShims.swift:5824`, `:6407-6408` |
| `extensions.sites.<id>` | `{mode, hosts}` di "Runs on" (scritta solo se diversa dal predefinito) | `ExtensionSiteAccess.swift:46-58` |
| `extensions.capture.<id>` | permesso di registrare lo schermo | `ExtensionCapture.swift:41-42` |
| `extensions.safariApps` | interruttore "From Safari apps" | `SafariApps.swift:22` |
| `extensions.credentialedFetch` | interruttore nascosto del fetch con credenziali (predefinito acceso) | `ExtensionFetch.swift:42-43` |
| `foot.extensions.hidden` | puzzle nascosto | `Prefs.swift:423` |
| `shortcuts` | tasti personalizzati, inclusi `ext:<id>:<comando>` | `Shortcuts.swift:380`, `:537` |
| `settings.page` = `extensions` | pagina delle Impostazioni da aprire | `Extensions.swift:2750` |

In memoria e non persistiti: pannelli laterali per scheda, popup per scheda (`ExtensionShims.popups`), grant da click, dimensioni dei popup.

### 6.3 Proposta Windows (da decidere)

- `%APPDATA%\Search\Extensions\<id>\` e `installed.json` (oppure `%LOCALAPPDATA%` se si vuole escludere il roaming).
- Impostazioni nello stesso file di preferenze dell'app (JSON) con le **stesse chiavi**, così la logica si porta pari pari.
- `chrome.storage` e dati delle pagine: nella partizione della sessione Electron (`userData/Partitions/...`); attenzione a profili e privato (§8).

---

## 7. Riferimenti file:riga (indice)

Percorsi relativi a `ref/search-mac/Sources/Search/`.

- Contratto con WebKit, caricamento, permessi: `Extensions.swift:56` (classe), `:187-232` (init controller e configurazione condivisa), `:236-289` (avvio), `:291-328` (worker), `:332-628` (schede e finestre seguite), `:633-719` (load), `:741-772` (limiti e motivi), `:775-815` (unload), `:828-918` (installazioni), `:923-1000` (reload), `:1020-1105` (onInstalled, sessioni DNR, revive), `:1144-1160` (watch errori), `:1171-1226` (admit, remove), `:1258-1294` (cancellazione dati), `:1296-1350` (nuova scheda), `:1385-1532` (aggiornamenti), `:1549-1717` (grant, fence, privato), `:1729-1747` (native), `:1766-1887` (descrizioni e domande), `:1891-2063` (pulsanti, press, ancore, popup, comandi), `:2069-2308` (delegate WebKit), `:2320-2498` (adattatori), `:2506-2850` (UI pulsanti, icone, menu).
- Impostazioni e Web Store: `ExtensionsUI.swift:6-109` (pagina), `:115-157` (Safari apps), `:161-179` (registratori), `:182-314` (riga), `:320-357` (Runs on), `:362-434` (siti), `:438-493` (barra Web Store), `:500-541` (Home page).
- Accesso ai siti: `ExtensionSiteAccess.swift:14-174` (modello), `:190-260` (applicazione), `:288-335` (click).
- Popup: `ExtensionPopup.swift:69-148` (show), `:239-287` (misura), `:353-380` (crescita), `:388-432` (link e chiusura), `:439-458` (PopupPage).
- Web Store e CRX: `Crx.swift:20-33`, `:42`, `:48-50`, `:63-99`, `:112-146`, `:152-237`; `StoreRelay.swift:16-159`, `:161-193`; `Import.swift:521-565`; `ImportPanel.swift:404-412`, `:470-475`, `:577-580`.
- Shim: `ExtensionShims.swift:59-101` (CSP), `:107-321` (prepare), `:323-374` (DNR fraintese), `:381-443` (moduli), `:486-539` (shim per pacchetto), `:543-5644` (script), `:2745-3239` (namespace definiti), `:3245-3665` (fill), `:3667-4280` (DNR), `:4281-4380` (menu, alarms, webRequest), `:4382-4606` (tabs/windows), `:4638-4735` (permissions), `:4736-4876` (userScripts), `:4877-5099` (onInstalled, listener tardivi, porte), `:5100-5121` (i18n), `:5125-5620` (FileSystem), `:5645-6727` (risposte native), `:6729-6990` (helper), `:6995-7321` (identity).
- Servizi: `ExtensionNative.swift:31-51` (cartelle host), `:54-76` (risoluzione), `:79-178` (send, connect, orfani), `:196-401` (HostPipe); `ExtensionFetch.swift:1-140`; `ExtensionSocket.swift:1-70`; `ExtensionWatch.swift:1-60`, `:136-197`; `ExtensionOffscreen.swift:10-60`, `:158`; `ExtensionWorkerRecovery.swift:1-70`; `ExtensionCapture.swift:1-75`; `RecordingIndicator.swift:1-40`, `:150-216`; `ExtensionExternal.swift:1-75`; `ExtensionRedirectPolicy.swift:1-75`; `ExtensionSandbox.swift:1-75`; `ExtensionReturnNavigation.swift:1-75`; `ExtensionFiles.swift:1-42`; `ExtensionPageScript.swift:1-75`; `SafariApps.swift:1-163`.
- Browser e UI condivisa: `Browser.swift:3030-3033` (finestre popup), `:4582-4585` (activateForExtension), `:6649-6663` (host e configurazione delle pagine estensione), `:7589` (hook Web Store), `:7605-7612` (niente salvataggio password su pagine estensione), `:8579-8596` (identity e redirect DNR), `:8719-8760` (ritorno all'estensione), `:9435-9445` (nome estensione nelle domande); `Side.swift:1708-1743`; `TabBar.swift:262-279`; `App.swift:877`; `SidePanel.swift:1-59`, `:269-366`, `:429`; `Settings.swift:46-93`, `:361-362`, `:670`, `:1137-1139`; `SettingsIndex.swift:103-104`, `:250-261`, `:477`, `:691-701`; `Prefs.swift:421-423`; `Shortcuts.swift:569-578`; `AtRest.swift:47`, `:120`.
- Documentazione: `README.md:35`, `:42`, `:54`, `:105`; `CHANGELOG.md` (voci estensioni in ogni versione, da 1.0 a 1.0.19); `ROADMAP.md:47-48`, `:99`, `:105-107`, `:139-201`, `:236`, `:258-259`.
- Test (relativi a `ref/search-mac/`): `Tests/extension_*.py` (38 file, es. `extension_ubol.py`, `extension_store_update.py`, `extension_site_access.py`, `extension_popup_link.py`, `extension_folded_popup.py`, `extension_install_event.py`, `extension_installed_reason.py`, `extension_sandbox_pages.py`, `extension_stylus.py`, `extension_worker_ports.py`, `extension_dnr_shapes.py`, `extension_header_rules.py`, `extension_management.py`, `extension_page_icon.py`), `Tests/external_messaging.py`, `Tests/native_port_idle.py`, `Tests/safari_apps.py`, `Tests/side_panel.py`, `Tests/session_rules_kept.py`, `Tests/framed_messages.py`, `Tests/framed_storage.py`, `Tests/claude_panel_frame.py`, `Tests/embedded_windows.py`, `Tests/private_extensions.py`, `Tests/passkey_extension.py`; cartelle `Tests/ExtensionBinary/`, `Tests/ExtensionShimRegister/`, `Tests/ExtensionWorkerRecovery/`, `Tests/ExtensionFilesTests.swift`; unit test in `Tests/SearchTests/Extension*Tests.swift` (25 file). Sono una buona base per una suite di regressione equivalente su Windows (stessi scenari, stesse estensioni reali).

---

## 8. Decisioni critiche per Electron (prima di scrivere codice)

1. **Id delle estensioni.** Electron calcola l'id di una cartella caricata dal percorso, a meno che il manifest abbia `key`. Le CRX del Web Store hanno la chiave pubblica nell'header, non nel manifest. Per avere l'id del Web Store (indispensabile per `allowed_origins` del native messaging, `externally_connectable`, `chromiumapp.org`, server che controllano l'origine come Raindrop, dati che sopravvivono a reinstallazioni) bisogna **scrivere la chiave pubblica della CRX in `manifest.json` come `key`** dopo la verifica. Per le cartelle non compresse decidere se seguire Chrome (usa `key`) o Search (ignora `key`, id dal percorso).
2. **Profili, spazi e schede private contro sessioni Electron.** In Electron estensioni e cookie stanno nella stessa `session`: caricare un'estensione in due sessioni crea due istanze separate (due worker, due `chrome.storage`). Search ha **una sola istanza** condivisa tra profili e una modalità "spanning" per le schede private (stessa estensione, cookie separati). Replicarlo identico in Electron non è diretto: va deciso se (a) un'istanza per profilo e una per il privato (comportamento diverso da Search, dati non condivisi), oppure (b) una sessione unica con isolamento dei cookie fatto a mano (rischioso). Questa è la scelta architetturale più importante dell'area.
3. **Popup e barra.** Electron non disegna nulla: pulsanti, badge, lista, popup (con la misura di Chrome), finestre popup, side panel, domande di permesso vanno costruiti nell'interfaccia di Search Windows.
4. **declarativeNetRequest.** Assente in Electron. uBlock Origin Lite è tra le estensioni chiave e usa solo DNR. Serve un motore DNR completo (regole statiche, dinamiche, di sessione, regex, `requestDomains`/`initiatorDomains`, `responseHeaders`, redirect a file dell'estensione, `modifyHeaders`) costruito su `session.webRequest` del processo principale, coordinato con il blocco annunci integrato.
5. **Native messaging.** Assente in Electron. Va scritto con lettura del registro di Windows.
6. **Versione Chrome dichiarata.** UA senza `Electron/` e con versione Chrome stabile (156 o successiva) in schede estensione, worker, `userAgentData`, `prodversion` del Web Store, controllo aggiornamenti (`os=win`).
7. **MV2.** Verificare se la versione di Electron scelta carica ancora estensioni MV2 (uBlock Origin classico, background page). Se sì, è un vantaggio sul Mac; se no, l'avviso `cantDo` va riadattato.
8. **onInstalled.** Verificare se Electron emette "install" a ogni avvio; in tal caso serve la stessa logica di Search.

---

## 9. CHECKLIST di backlog per la versione Windows

### A. UX da rifare (identica a Search Mac)

**P0**

- [ ] Pulsante puzzle (`Extensions`) nei 4 posti (piede colonna orizzontale, colonna verticale con `room: 0`, "Buttons at the top", fine riga schede), nascosto se non ci sono estensioni; stato aperto per finestra.
- [ ] Pulsanti fissati accanto al puzzle in ordine di installazione, con troncamento per spazio (`room`) partendo dall'ultimo; badge, icona disabilitata a 0,4, iniziale come ripiego.
- [ ] Lista del puzzle: righe con icona/nome, Reload al passaggio per le cartelle, puntina; piede `Chrome Web Store…`, `Load Unpacked…`, `Manage Extensions…`; messaggio vuoto `None of your extensions is on`; tutte le misure del §2.9.
- [ ] Menu tasto destro (`Pin to Toolbar`/`Unpin`, `Options…`, `Reload`, `Run on This Site`, `Always on <host>`, `Runs On`, `Remove “<Name>”…` con conferma).
- [ ] Popup in popover agganciato al pulsante, o al puzzle, o al punto di ripiego; misura Chrome 25..800 × 25..600 a DOMContentLoaded, partenza 360×240 poi ultima dimensione, dissolvenza 0,12 s, crescita come §2.4, sfondo bianco, secondo click chiude, link nuova finestra → scheda + chiusura, `window.close()`.
- [ ] Installazione dal Web Store: script sul sito che nasconde "Switch to Chrome" e sostituisce il pulsante con `Add to Search`/`Adding…`/`Added to Search`; barra di riserva `Add this extension to Search`.
- [ ] Impostazioni › Extensions con le 6 card nell'ordine e i testi del §2.6; riga con dettaglio, errori `Couldn’t start: …`, avviso `cantDo`, menu `…`, interruttore.
- [ ] Dialogo `Add “<Name>” to Search?` con elenco `It will be able to:` e frasi del §2.2; una domanda alla volta, come foglio non modale sulla finestra.
- [ ] Avvisi (toast) di installazione, reload, errori, con i testi esatti del §2.2 e §2.7.
- [ ] "Runs on" (All sites / Some sites / On click), lista siti con normalizzazione, grant da click fino al cambio sito, nota per i gestori di password.
- [ ] Schede private: `Allow in Private Tabs` per estensione, spento di default, `Private Tabs Aren’t Supported`, estensione non ammessa cieca sulle schede private.
- [ ] Aggiornamenti dal Web Store ogni 20 h con timer orario e backoff 1h, 2h, 4h... ≤ 20h; domanda "An update to…" con Invio = Cancel se chiede di più; sostituzione atomica.
- [ ] Rimozione con cancellazione di tutti i dati (storage, localStorage, IndexedDB, Cache Storage) e ripresa dopo crash.
- [ ] Avvio: estensioni caricate prima di ripristinare le schede (o le schede aspettano un limite); onInstalled solo alla vera installazione.

**P1**

- [ ] Side panel delle estensioni: larghezza 300..640 (380), pannello per scheda con massimo 4 tenuti per finestra, `openPanelOnActionClick`, attesa davanti a schede private non ammesse, ripiego in scheda.
- [ ] Finestre popup delle estensioni (`windows.create` type popup): piccola finestra con riga del sito, non salvata, ⌘W/Ctrl+W, dimensione ≥ 200×150 dentro lo schermo, centrata se solo dimensione.
- [ ] Domande `asks for more access`, `wants to read and change …`, `Show “<Name>” in new tabs?` con `Keep It`/`Don't Allow`; Impostazioni › Browsing › Home page con `Search's own`.
- [ ] Registrazione schermo: domanda una volta per estensione, card `Recorders` con `Remove`, pillola in basso con punto rosso fermo, testo e `Stop` (su Windows serve anche un selettore di schermo/finestra nostro).
- [ ] "Bring them over": lettura di Preferences/Secure Preferences dei browser Chromium su Windows (`%LOCALAPPDATA%\Google\Chrome\User Data\...`, Edge, Brave, Arc, Vivaldi, Opera) e reinstallazione dal Web Store con conferma per ognuna.
- [ ] Load unpacked con copia della cartella, id da percorso, Reload che ricopia e richiede conferma se chiede di più.
- [ ] Scorciatoie delle estensioni in Impostazioni › Shortcuts › Extensions, con tasti riservati (Ctrl+W, Ctrl+T, Ctrl+N e varianti) mai assegnabili.
- [ ] Icona dell'estensione sulle schede che mostrano sue pagine; titolo "Extension page" e titolo proprio della nuova scheda estensione.
- [ ] Password manager integrato: niente offerta di salvataggio sulle pagine `chrome-extension://`; rinuncia se un'estensione imposta `passwordSavingEnabled = false` (con la nota in Impostazioni › Passwords).
- [ ] Spunta `Extensions` in Appearance › Tabs (`foot.extensions.hidden`), puzzle invisibile ma ancora usato come punto d'aggancio dei popup.

**P2**

- [ ] Equivalente di "From Safari apps": non esiste su Windows; decidere se toglierlo o sostituirlo (es. estensioni Edge installate localmente).
- [ ] "Extensions per space" (in roadmap Mac, rimandata).
- [ ] Contatore `<n> warnings` con lista errori consultabile.
- [ ] Rimozione da Impostazioni senza conferma: replicare o uniformare.

### B. API da aggiungere sopra Electron

**P0**

- [ ] Preservare l'id del Web Store scrivendo `key` nel manifest; verifica CRX3 identica a `Crx.verifiedZip`; rifiuto dei pacchetti con link simbolici (su Windows: anche junction e reparse point).
- [ ] UA e `userAgentData` Chrome stabile in pagine e worker delle estensioni; `prodversion` e parametri Windows nelle richieste al Web Store.
- [ ] `chrome.action`/`browserAction` completi (icone per scheda, badge, titolo, popup per scheda, `openPopup`, `onClicked`, `getUserSettings`).
- [ ] `chrome.tabs` completo (query con tutti i filtri, create, update, move, remove, reload, group/ungroup, highlight, discard, sendMessage, eventi) con `incognito`, `groupId`, favIconUrl, url/titolo con il solo `tabs`.
- [ ] `chrome.windows` completo (getAll, getCurrent dalla finestra chiamante, create con `tabId` e type popup, update posizione/dimensione/stato, remove, eventi incluso `onBoundsChanged`).
- [ ] `chrome.permissions` con le domande di Search, gesto utente di 5/10 s, permessi "silenziosi", mai pagine di estensioni né file.
- [ ] `chrome.declarativeNetRequest` completo (motore proprio) per uBlock Origin Lite, AdBlock, Norma, Privacy Badger, VOT.
- [ ] Native messaging (`connectNative`, `sendNativeMessage`) con registro di Windows, `--parent-window`, protocollo 4 byte + JSON, limite 1 MB, chiusura come Chrome, host fermati al riavvio del worker, porte che tengono vivo il worker.
- [ ] `chrome.contextMenus`/`menus` integrati nel menu contestuale (contesti `action`, immagini non link, pattern illeggibili scartati).
- [ ] `chrome.cookies`, `chrome.webNavigation`, `chrome.notifications` (toast Windows), `chrome.commands`, `chrome.alarms` (se mancano in Electron).
- [ ] `chrome.identity` (`launchWebAuthFlow` interattivo in scheda e silenzioso in vista nascosta, intercetto `*.chromiumapp.org` solo dalla scheda del flusso, `getRedirectURL`; `getAuthToken` rifiutato con lo stesso messaggio).

**P1**

- [ ] `chrome.sidePanel`, `chrome.tabGroups` (con `Color` e eventi), `chrome.offscreen` (uno per estensione, nascosto, pronto solo a caricamento finito).
- [ ] `chrome.userScripts` (Tampermonkey, Violentmonkey, ScriptCat) con mondi `USER_SCRIPT` e `onUserScriptMessage`.
- [ ] `chrome.bookmarks`, `chrome.history`, `chrome.downloads` (inclusi `onChanged`, cartelle in `filename`, `downloads.open` con i tre controlli), `chrome.sessions`, `chrome.topSites`, `chrome.search`, `chrome.management` (getAll con disabilitate).
- [ ] `chrome.desktopCapture` e `getUserMedia` con `chromeMediaSource` (selettore nostro); valutare un vero `chrome.tabCapture` (su Mac rifiutato).
- [ ] `externally_connectable` (verificare; serve a Claude in Chrome) con le stesse esclusioni di Search (niente `*://*/*`, niente TLD interi, niente siti Google).
- [ ] `runtime.getContexts` (verificare in Electron), `extension.getViews` che riconosce il popup, `tabs.getCurrent` `undefined` in popup e side panel.
- [ ] `chrome.idle` (con `onStateChanged` e blocco schermo Windows), `chrome.power` (`SetThreadExecutionState`), `chrome.tts` (SAPI/OneCore), `chrome.i18n.detectLanguage`.
- [ ] Gating dei permessi lato processo principale (mai fidarsi del codice nel renderer), come `gates` in `ExtensionShims.swift:5711`.

**P2**

- [ ] `chrome.fontSettings` (font di Windows), `chrome.system.*`, `chrome.browsingData`, `chrome.privacy` (memorizzato, effetto solo su `passwordSavingEnabled`), `chrome.contentSettings` stub, `chrome.readingList` stub, `chrome.omnibox` stub, `chrome.declarativeContent` stub, `pageCapture`/`debugger`/`gcm`/`instanceID` che rifiutano come Chrome.
- [ ] `chrome.proxy` reale con `session.setProxy` (su Mac impossibile: potenziale miglioramento, da decidere se renderlo "identico" o migliore).
- [ ] Supporto MV2 se Electron lo permette (uBlock Origin classico).
- [ ] Suite di regressione con le estensioni reali del §4 (P0: 1Password, Bitwarden, Proton Pass, NordPass, uBlock Origin Lite, Claude in Chrome, Dark Reader, Grammarly, Raindrop.io, Readwise Highlighter, Zotero Connector, Vimium, Loom; P1: Stylus, Tampermonkey, Violentmonkey, ScriptCat, Enhancer for YouTube, Language Reactor, SingleFile, GoFullPage, Similarweb, Figma, Eagle, Inoreader, Session Buddy, Affinity Pathfinder, Norma, Privacy Badger, Control Panel for YouTube, Cosmos, Voice-over-Translation, Floccus, Google Translate, iCloud Passwords).
