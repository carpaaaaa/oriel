# Search per Windows: ricerca tecnica (stato al 23 novembre 2026)

Studio preparatorio per portare Search (oggi Swift + WebKit su macOS, licenza MIT di Office Commun) su Windows con aspetto e funzioni identici, estensioni Chrome dal Chrome Web Store e import da Chrome, Opera, Opera GX, Edge, Brave. Vincoli: si sviluppa su un Mac Apple Silicon con Node 24, senza un PC Windows.

Nessun pacchetto installato, nessun codice dell'app scritto. Ho letto documentazione ufficiale, issue e pull request su GitHub, il registro npm e, per confronto, il sorgente di Search per Mac in `ref/search-mac`.

**Legenda**
- **[V]** verificato su una fonte primaria (documentazione ufficiale, codice sorgente, registro npm, issue o PR) citata accanto.
- **[V-r]** verificato, ma la fonte è una segnalazione di utenti o di terzi (issue, forum, blog di sicurezza): fatto osservato, non garanzia.
- **[D]** dedotto da me mettendo insieme le fonti; va controllato su Windows vero.

---

## 0. In breve

1. **Motore: Electron è l'unica strada percorribile da un Mac per una persona sola.** Electron 45.4.1 (Chromium 156) più `electron-chrome-extensions` 4.10.0 e `electron-chrome-web-store` 0.13.0, che dal 25 ottobre 2026 sono MIT. Copre bene `tabs`, `windows`, `action` con popup, `contextMenus`, `cookies`, `webNavigation`, `storage`, `notifications`. Non copre `sidePanel`, `offscreen`, `downloads`, `identity`, `commands` e `declarativeNetRequest` con regole statiche. Il "supporto pieno" al 100% non esiste su Electron: bisogna riscrivere da sé le API mancanti, come Search per Mac fa già sopra WebKit (`ExtensionShims.swift`). Un fork di Chromium darebbe la compatibilità piena, ma richiede un PC Windows, oltre 100 GB e ore per ogni build, ogni 4 settimane.
2. **Import onesto:** segnalibri, cronologia, schede aperte ed elenco delle estensioni si leggono da tutti i browser. Le password di Chrome, Edge e Brave su Windows sono protette da App-Bound Encryption (`v20`): un'altra app non le può leggere, quindi la strada è l'esportazione CSV guidata, come fa Firefox dal 2025. I cookie di login (le sessioni) di quei browser non sono trasferibili in modo legittimo. Per gli account Google, poi, dal 2026 la sessione è legata al TPM del PC (DBSC): anche copiando i cookie non funzionerebbe.
3. **Distribuzione:** electron-builder 26.18 crea installer NSIS e versioni portable x64 e arm64 da un Mac Apple Silicon senza Wine (verificato nel codice sorgente). Il motore AI con node-llama-cpp, però, non si può impacchettare per Windows da Mac, quindi le build vere vanno fatte su GitHub Actions `windows-latest` e `windows-11-arm`. Senza firma: schermata "Windows ha protetto il PC" e possibile blocco di Smart App Control.

---

## 1. Motore ed estensioni

### 1.1 Electron oggi

| Dato | Valore | Fonte |
|---|---|---|
| Ultima stabile | **45.4.1**, 18-19 nov 2026, Chromium 156.0.8078.100, Node 24.22.3 | [V] [releases.electronjs.org](https://releases.electronjs.org/), registro npm |
| Linee mantenute | 45.x, 44.x, 43.x (patch lo stesso giorno sulle tre) | [V] registro npm |
| Cadenza | una major ogni 8 settimane circa: 39 (27 ott 2025), 40 (16 gen 2026), 41 (11 mar), 42 (6 mag), 43 (30 giu), 44 (25 ago), 45 (21 ott) | [V] registro npm |
| Prossima | 46.0.0-alpha.12 (Chromium 160) | [V] releases.electronjs.org |
| 32 bit | rimossi da Electron 44: solo x64 e arm64 su Windows | [V] [note di v44.0.0](https://github.com/electron/electron/releases/tag/v44.0.0) |

**API estensioni di Electron** ([V] [Extensions API](https://www.electronjs.org/docs/latest/api/extensions-api), [Chrome Extension Support](https://www.electronjs.org/docs/latest/api/extensions)):
- Si usa `session.extensions.loadExtension(path)`; il vecchio `session.loadExtension` è stato spostato qui. Va richiamata **a ogni avvio** perché le estensioni non vengono ricordate. Accetta solo estensioni **spacchettate**, niente `.crx`, e funziona solo in sessioni persistenti, quindi non nelle finestre private.
- API native di Electron: `runtime` (parziale), `storage` (`local`; `sync` solo su disco senza sincronizzazione; `managed` vuoto), `tabs` (molto parziale: `query` solo su url, titolo, audio, attiva, muta), `scripting` (completo), `webRequest` (completo, ma i listener di Electron hanno la precedenza), `management`, `devtools.*`, `i18n`, `system.storage`.
- La documentazione lo dice chiaramente: Electron "non supporta estensioni arbitrarie dal Chrome Web Store" e la piena compatibilità con Chrome "non è un obiettivo del progetto".
- **Manifest V3 e service worker:** dal gennaio 2025 Electron supporta i preload nei service worker ([V] [PR #44411](https://github.com/electron/electron/pull/44411), portata anche su Electron 35). È quello che permette alle librerie di aggiungere le API `chrome.*` ai background MV3.

**Novità in corso dentro Electron, PR aperte a ottobre e novembre 2026 da Samuel Maddock, l'autore delle librerie** ([V]):
- [#55729](https://github.com/electron/electron/pull/55729): con `loadExtension` le regole **statiche** di `declarativeNetRequest` non venivano mai caricate ("le regole non facevano nulla, senza errori") e `runtime.onInstalled` non scattava mai. La correzione è prevista anche per 45 e 46.
- [#55552](https://github.com/electron/electron/pull/55552): attivare e disattivare le estensioni.
- [#55270](https://github.com/electron/electron/pull/55270): dire a Electron quali viste sono schede, quali popup e quali **pannelli laterali**.
- [#55106](https://github.com/electron/electron/issues/55106) (chiusa): un'estensione con `webRequest` o `declarativeNetRequest` nella sessione predefinita faceva fallire tutte le richieste di rete del processo principale. Lezione: tenere le pagine in una partizione diversa da quella usata dall'app.
- [#55398](https://github.com/electron/electron/issues/55398) (aperta): in Electron 45.0.0 un listener MV2 bloccante su `webRequest` blocca le risorse delle pagine; in 44.9.3 funzionava.

[D] Il supporto alle estensioni in Electron sta migliorando in fretta proprio adesso, ma è giovane e si rompe tra una major e l'altra (vedi 1.3). Conviene fissare la versione di Electron e cambiarla solo dopo una batteria di prove sulle estensioni.

### 1.2 Le librerie di Samuel Maddock (electron-browser-shell)

| Pacchetto | Versione | Data | Licenza |
|---|---|---|---|
| `electron-chrome-extensions` | 4.10.0 | 25 ott 2026 | **MIT** |
| `electron-chrome-web-store` | 0.13.0 | 2 lug 2025 | MIT |
| `electron-chrome-context-menu` | 1.1.0 | 2022 | MIT |

[V] registro npm. [V] Il 25 ottobre 2026 il commit "chore: switch to MIT license" ha sostituito la licenza precedente, **GPL-3.0 più una "Patron License" a pagamento** per uso proprietario. Fino a un mese fa usarla in un'app chiusa richiedeva di sponsorizzare l'autore. Ora è compatibile con la MIT di Search ([repo](https://github.com/samuelmaddock/electron-browser-shell)).

**API `chrome.*` coperte da `electron-chrome-extensions` 4.10.0**, in aggiunta a quelle native di Electron ([V] [README](https://github.com/samuelmaddock/electron-browser-shell/blob/master/packages/electron-chrome-extensions/README.md) e cartella `src/browser/api`):

| API richiesta | Stato | Note |
|---|---|---|
| `tabs` | **Sì, ampio** | get, create, query, update, remove, reload, sendMessage, connect, zoom, goBack e goForward, eventi principali. Mancano duplicate, move, highlight, captureVisibleTab, discard, detectLanguage, onMoved, onDetached e onAttached |
| `windows` | **Sì** | get, getAll, create, update, remove ed eventi |
| `action` / `browserAction` e popup | **Sì** | titolo, icona, badge, popup, `openPopup`, `onClicked` più l'elemento `<browser-action-list>` per la barra. Mancano `enable` e `disable` |
| `contextMenus` | **Parziale** | manca `update` |
| `webNavigation` | **Parziale** | mancano `onErrorOccurred`, `onReferenceFragmentUpdated` e `onTabReplaced`; `onDOMContentLoaded` solo sul frame principale |
| `cookies` | **Sì** | completo |
| `storage` | **Parziale** | `local` sì; `sync` e `managed` ricadono su `local`; `storage.session` solo come PR aperta ([#182](https://github.com/samuelmaddock/electron-browser-shell/issues/182)) |
| `permissions` | **Parziale** | `request` passa da un callback dell'app; PR aperta per i permessi host MV2 |
| `nativeMessaging` | **Sì** | c'è il codice (correzioni di luglio 2025); PR aperta [#191](https://github.com/samuelmaddock/electron-browser-shell/issues/191) per messaggi spezzati |
| `notifications` | Quasi | manca `onButtonClicked` |
| `commands` | **No** | segnato come non implementato |
| `sidePanel` | **No** | |
| `declarativeNetRequest` | **Non dalla libreria** | dipende da Electron/Chromium; regole statiche rotte fino a [#55729](https://github.com/electron/electron/pull/55729) |
| `offscreen` | **No** | PR aperta [#187](https://github.com/samuelmaddock/electron-browser-shell/issues/187) (anche `userScripts`) |
| `identity` | **No** | |
| `downloads` | **No** | |

Altri limiti dichiarati: tutti i background sono **persistenti**; se l'app usa `session.webRequest`, i listener `chrome.webRequest` delle estensioni non vengono chiamati; niente estensioni in sessioni non persistenti; minimo Electron 35.0.0-beta.8; i preload dei service worker richiedono la sandbox attiva.

**`electron-chrome-web-store` 0.13.0** ([V] [README](https://github.com/samuelmaddock/electron-browser-shell/tree/master/packages/electron-chrome-web-store)):
- Rende funzionante il pulsante "Aggiungi" sul sito del Chrome Web Store, scarica il CRX, lo spacchetta e lo carica (`installChromeWebStore`, `installExtension`, `uninstallExtension`, `updateExtensions`).
- **Aggiornamento automatico** all'avvio e ogni 5 ore (`autoUpdate`, attivo di default). Supporta `allowlist`, `denylist` e `beforeInstall` per chiedere conferma.
- [V] PR e issue aperte: [#188](https://github.com/samuelmaddock/electron-browser-shell/issues/188) (accettare solo l'origine esatta del Web Store, tema di sicurezza) e [#174](https://github.com/samuelmaddock/electron-browser-shell/issues/174) (non nasconde più i banner "Installa Chrome").
- [D] È lo stesso meccanismo di `Crx.swift` su Mac: indirizzo pubblico di aggiornamento più verifica della firma CRX3.

**Manifest V2 non è più un'opzione reale:** [V] Chrome ha rimosso MV2 con Chrome 139 e il **31 agosto 2026** sono state tolte dal Web Store tutte le estensioni MV2 rimaste ([timeline Google](https://developer.chrome.com/docs/extensions/develop/migrate/mv2-deprecation-timeline)). Electron carica ancora estensioni MV2 spacchettate; la PR #55552 menziona il codice di Chromium che le disattiverebbe. Ma dal Web Store arriva ormai solo MV3.

### 1.3 Estensioni note: cosa risulta

| Estensione | Stato su Electron e librerie | Fonte |
|---|---|---|
| **uBlock Origin Lite** (MV3, solo regole statiche DNR) | **Probabilmente non blocca nulla su Electron 45 o precedenti**: le regole statiche non vengono caricate con `loadExtension` ([#55729](https://github.com/electron/electron/pull/55729)). Su Flow Browser un utente segnala che né uBO né uBOL bloccano | [D] da [V]; [V-r] [Flow #153](https://github.com/MultiboxLabs/flow-browser/issues/153) |
| **uBlock Origin** (MV2) | Funziona su Electron 45 con un preload che fa puntare `browser` al `chrome` modificato. Però su 45.0.0 un listener MV2 bloccante può fermare le risorse delle pagine ([#55398](https://github.com/electron/electron/issues/55398)). Non è più sul Web Store, quindi si installa solo a mano | [V-r] [#189](https://github.com/samuelmaddock/electron-browser-shell/issues/189); [D] |
| **1Password** (MV3) | Rotto su Electron 40 (popup che caricano all'infinito); di nuovo funzionante da 41.0.0-alpha.1. Su 43 un'altra segnalazione parla di popup che non finiscono di caricare | [V-r] [#172](https://github.com/samuelmaddock/electron-browser-shell/issues/172), [#184](https://github.com/samuelmaddock/electron-browser-shell/issues/184) |
| **Bitwarden** | Si installa e il popup funziona; il menu contestuale era bloccato, corretto in Flow ad aprile 2026 | [V-r] [Flow #101](https://github.com/MultiboxLabs/flow-browser/issues/101) |
| **Dark Reader** | "A volte non si carica" (gennaio 2026) | [V-r] [#172](https://github.com/samuelmaddock/electron-browser-shell/issues/172) |
| **Grammarly** | Solo segnalazioni vecchie (2021-2022, popup che lampeggia, login), chiuse. Stato attuale sconosciuto | [D] |
| **Claude in Chrome** | Usa `sidePanel`, `debugger` e `nativeMessaging` secondo Anthropic. `sidePanel` e `debugger` non sono coperti, quindi **non funziona senza implementarli da sé** | [V] [permessi Anthropic](https://support.claude.com/en/articles/12902446-claude-in-chrome-permissions-guide); [D] |
| SingleFile | Serve `chrome.downloads`, non implementato | [V-r] [Flow #259](https://github.com/MultiboxLabs/flow-browser/issues/259) |
| Tampermonkey e simili | Serve `userScripts`, PR aperta | [V] [#187](https://github.com/samuelmaddock/electron-browser-shell/issues/187) |

[V-r] Un'issue di luglio 2026 riassume: con Electron 42 e successivi "il supporto si rompe parecchio": popup con proporzioni sbagliate, icone sgranate e, in 43, popup che caricano all'infinito ([#184](https://github.com/samuelmaddock/electron-browser-shell/issues/184)).

### 1.4 Browser reali costruiti così

- **Flow Browser** (MultiboxLabs): Electron con estensioni e Chrome Web Store. Licenza GPL-3.0, circa 1.100 stelle, ultima release 0.12.1 del 16 aprile 2026, commit fino al 14 novembre 2026 ([V] [repo](https://github.com/MultiboxLabs/flow-browser)). Usa **fork** delle due librerie (`@iamevan/...` 4.9.4 e 0.13.3), **Electron di castLabs 41.1.1** per avere Widevine (Netflix e simili), `electron-webauthn` e un adblocker Ghostery integrato. La sua stessa issue [#178](https://github.com/MultiboxLabs/flow-browser/issues/178) dice: "molte estensioni non funzionano come previsto".
- **electron-browser-shell**: banco di prova dell'autore delle librerie, non un prodotto.
- **Wexond**: progetto storico, fermo.
- [D] Nessun browser diffuso con estensioni "come Chrome" è su Electron. Arc, Dia, Brave, Opera, Vivaldi ed Edge sono fork di Chromium.

### 1.5 Le alternative

| Opzione | Estensioni | Da un Mac senza PC Windows | Note |
|---|---|---|---|
| **Electron** + librerie + API scritte da noi | Buone sulle API base, buchi su sidePanel, offscreen, downloads, identity, commands e DNR statico; regressioni tra versioni | **Sì** | UI in HTML e CSS, riuso di Node; aggiornamenti di Chromium a carico nostro (una major ogni 8 settimane, patch di sicurezza frequenti) |
| **CEF** (Chromium Embedded Framework) | Il vecchio API estensioni "Alloy" è stato tolto; le estensioni Chrome funzionano solo con lo "stile Chrome" ([V] [CEF #3681](https://github.com/chromiumembedded/cef/issues/3681), chiusa il 6 dic 2025). Installazione dal Web Store non verificata | Difficile: C++ o C#, compilazione nativa | Nessun vantaggio rispetto a Electron per questo progetto [D] |
| **WebView2** (`AddBrowserExtension`) | Solo estensioni spacchettate da una cartella. Le estensioni con icona, badge o popup si caricano ma **senza punti di accesso nell'interfaccia** ([V] [Microsoft Learn](https://learn.microsoft.com/en-us/microsoft-edge/webview2/reference/win32/icorewebview2profile7)). Niente Web Store | Solo Windows (C++, C# o Tauri) | Motore Edge aggiornato da Microsoft (vantaggio), ma non può arrivare al "supporto pieno" |
| **Fork di Chromium** (o di ungoogled-chromium, Helium, Brave) | **Piene**, identiche a Chrome, Web Store compreso | **Praticamente no** | Compilare per Windows da Mac è possibile solo con un pacchetto di toolchain creato **su un PC Windows** con Visual Studio ([V] [win_cross.md](https://chromium.googlesource.com/chromium/src/+/main/docs/win_cross.md)). Servono almeno 100 GB, 16-64 GB di RAM, Visual Studio 2026 ([V] [istruzioni Windows](https://chromium.googlesource.com/chromium/src/+/main/docs/windows_build_instructions.md)) e patch da riportare a ogni versione di Chrome. Widevine richiede un accordo con Google [D] |
| **Fork di Flow Browser** | Come Electron, con lavoro già fatto (gestione estensioni, profili) | Sì | **GPL-3.0**: Search per Windows diventerebbe GPL. Meglio prendere idee che codice [D] |
| SDK commerciali (DotNetBrowser) | Web Store installabile ma disattivato di default, alcune API mancanti | Solo .NET | A pagamento, fuori dallo stack ([V] [guida](https://teamdev.com/dotnetbrowser/docs/guides/gs/extensions/)) |

### 1.6 Due rischi che non riguardano le estensioni

- **Accesso a Google.** Google non permette l'accesso da browser basati su framework incorporati come CEF e vieta di fingersi Chrome nello user agent ([V] [blog sviluppatori Google](https://developers.googleblog.com/2020/08/guidance-for-our-effort-to-block-less-secure-browser-and-apps.html)). Nelle librerie c'è un'issue aperta "Unable to sign in to Google account", aggirata cambiando lo user agent ([V-r] [#164](https://github.com/samuelmaddock/electron-browser-shell/issues/164)). [D] Va provato subito: per un browser è un requisito che non si può mancare.
- **DRM (Netflix, Disney+, Spotify web).** Su Mac WebKit ha FairPlay di sistema. Electron ufficiale non ha Widevine. La versione di castLabs ("ECS") lo include, con firma VMP gratuita tramite il loro servizio EVS ([V-r] [castlabs/electron-releases](https://github.com/castlabs/electron-releases)). Flow la usa.

### 1.7 Raccomandazione sul motore

[D] **Electron 45.x fissato**, `electron-chrome-extensions` 4.10 e `electron-chrome-web-store` 0.13 (ora MIT), più un **nostro strato di API mancanti** nello stesso spirito di `ExtensionShims.swift`: sidePanel, offscreen, storage.session, downloads, commands, userScripts, identity con flusso OAuth nella nostra finestra. Conviene proporre le correzioni a monte. Servono anche una matrice di prove automatiche sulle 20-30 estensioni più usate (come `./bench ext-*` su Mac) e una "lista di compatibilità" onesta nell'app. Promettere "tutte le estensioni Chrome" non è realistico; "le estensioni più diffuse, provate" sì.

---

## 2. Import su Windows

### 2.1 Dove stanno i profili

| Browser | Cartella dati utente | Profili |
|---|---|---|
| Chrome | `%LOCALAPPDATA%\Google\Chrome\User Data` | `Default`, `Profile 1`, ...; `Local State` nella cartella padre |
| Edge | `%LOCALAPPDATA%\Microsoft\Edge\User Data` | come Chrome |
| Brave | `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data` | come Chrome |
| Vivaldi | `%LOCALAPPDATA%\Vivaldi\User Data` | come Chrome |
| Opera | `%APPDATA%\Opera Software\Opera Stable` (cartella **Roaming**) | profilo principale direttamente nella cartella del browser |
| Opera GX | `%APPDATA%\Opera Software\Opera GX Stable` (Roaming); cache in `%LOCALAPPDATA%\...` | come Opera |
| Firefox | `%APPDATA%\Mozilla\Firefox\Profiles\<id>.default-release` | elencati in `profiles.ini` |

[V-r] Percorso di Opera GX da un post sul [forum Opera](https://forums.opera.com/post/335390); il forum consiglia di verificarlo su `opera://about`. [V] Il codice Mac di Search nota già che "Opera tiene il suo unico profilo nella cartella del browser" (`Import.swift`). [V-r] `Local State` di Opera dentro il profilo: [changelog NirSoft](https://www.nirsoft.net/utils/chrome_cookies_view.html). Per gli altri percorsi: [D] percorsi standard noti, coerenti con le fonti sui cookie ([digitalcitizen](https://www.digitalcitizen.life/cookies-location-windows-10/)); da confermare con un vero PC.

### 2.2 Cosa c'è dentro un profilo Chromium

| Dato | File | Formato | Cifrato? |
|---|---|---|---|
| Segnalibri | `Bookmarks` | JSON | No |
| Cronologia | `History` | SQLite (`urls`, `visits`; tempi in microsecondi dal 1601) | No |
| Schede aperte | `Sessions\Session_*` | SNSS (lo stesso formato che Search Mac legge già in `ImportSession.swift`) | Di norma no |
| Estensioni installate | `Extensions\<id>\`, `Preferences` | cartelle e JSON | No; si reinstallano per ID dal Web Store |
| Password | `Login Data` (e `Login Data For Account` per quelle salvate nell'account Google) | SQLite, tabella `logins` | **Sì** |
| Cookie | `Network\Cookies` (prima nella cartella del profilo) | SQLite | **Sì** |
| Carte e autofill | `Web Data` | SQLite | Sì (carte) |
| Chiavi | `Local State` | JSON: `os_crypt.encrypted_key` e, con ABE, `os_crypt.app_bound_encrypted_key` (intestazione `APPB`) | La chiave è protetta |

[V] Cookie in `Network\Cookies` e chiave in `Local State`: [digitalcitizen](https://www.digitalcitizen.life/cookies-location-windows-10/), [NirSoft](https://www.nirsoft.net/utils/chrome_cookies_view.html). [V] `os_crypt.app_bound_encrypted_key`, intestazione `APPB` e dati con prefisso `v20` nel sorgente di Chromium ([app_bound_encryption_provider_win.cc](https://chromium.googlesource.com/chromium/src/+/lkgr/chrome/browser/os_crypt/app_bound_encryption_provider_win.cc)).

**Formato classico, prefisso `v10`.** Una chiave AES-256 casuale sta in `Local State`, protetta con **DPAPI** nell'ambito dell'utente; ogni valore è cifrato con AES-256-GCM e porta il prefisso `v10`. I dati molto vecchi sono solo DPAPI. [D] È lo schema che gli importatori hanno usato per anni con il consenso dell'utente, ed è l'analogo Windows della chiave "Safe Storage" nel portachiavi che Search usa su Mac. Qualunque programma dello stesso utente può chiedere a DPAPI di decifrare: è proprio il punto debole che ha portato a ABE.

### 2.3 App-Bound Encryption (prefisso `v20`): cosa copre e chi la usa

- **Origine.** Chrome 127, luglio 2024. Un servizio privilegiato di sistema verifica l'identità dell'app che chiede la chiave; "se un'altra app sullo stesso sistema prova a decifrare gli stessi dati, fallisce". Google ha iniziato **dai cookie** e ha dichiarato di voler estendere la protezione a "password, dati di pagamento e altri token di autenticazione persistenti" ([V] [Google Security Blog](https://security.googleblog.com/2024/07/improving-security-of-chrome-cookies-on.html)).
- **Password e carte oggi.** Nessuna fonte primaria di Google indica la versione in cui le password sono passate a ABE. Fonti di sicurezza e forensi del 2026 descrivono però password e dati di pagamento in `Login Data` e `Web Data` con prefisso `v20` ([V-r] [Elcomsoft, gennaio 2026](https://blog.elcomsoft.com/2026/01/browser-forensics-in-2026-app-bound-encryption-and-live-triage/); note di ricerca di terzi). Il comportamento di Firefox conferma: dalla versione 138 l'import delle password di Chrome su Windows tornava "0 password", mentre "Edge e alcuni profili di Chrome" funzionavano ancora ([V] [bug 1960560](https://bugzilla.mozilla.org/show_bug.cgi?id=1960560)). **Conclusione [D]: su un Chrome aggiornato considerare cifrati con ABE cookie, password e carte; i profili vecchi possono contenere un misto di `v10` e `v20`.**
- **Chi la usa:**
  - **Chrome**: sì, dalla 127 [V].
  - **Edge**: sì, dalla 127, con criterio `ApplicationBoundEncryptionEnabled` attivo di default ([V] [Microsoft Learn](https://learn.microsoft.com/en-us/deployedge/microsoft-edge-browser-policies/applicationboundencryptionenabled)).
  - **Brave**: probabilmente sì; note di terzi descrivono la sua interfaccia di elevazione [V-r]. Nessuna documentazione ufficiale trovata.
  - **Opera e Opera GX**: **non verificato**; un articolo li cita insieme agli altri senza dettagli [V-r]. Il riconoscimento va fatto a runtime.
  - **Vivaldi**: citato senza dettagli [V-r]; sul suo forum ci sono errori "failed to decrypt passwords" nel 2026.
  - **Firefox**: no. Usa NSS (`logins.json` più `key4.db`) e i cookie in `cookies.sqlite` non sono cifrati [V] (Elcomsoft).
- **Come riconoscerla in modo onesto [D].** Se in `Local State` esiste `os_crypt.app_bound_encrypted_key` e i valori iniziano con `v20`, quei dati non sono leggibili da Search. Non si tenta altro. Non uso e non documento le tecniche per aggirare ABE (iniezione nel processo del browser, uso dell'interfaccia di elevazione, servizi SYSTEM): sono le tecniche dei malware ruba-credenziali.

### 2.4 Cosa fanno gli altri browser oggi

| Browser | Password da Chrome su Windows | Cookie e sessioni | Fonte |
|---|---|---|---|
| **Firefox** (e quindi Zen) | Import automatico **tolto**: dalla 140 la procedura spiega come esportare il CSV da Chrome e importarlo. Tolto anche l'import delle carte di pagamento da Chrome su Windows | Non menzionato | [V] [bug 1960560](https://bugzilla.mozilla.org/show_bug.cgi?id=1960560), [aiuto Mozilla](https://support.mozilla.org/en-US/kb/import-data-another-browser) |
| **Edge** | La pagina di aiuto cita solo i preferiti dall'import di Chrome; per le password indica il CSV ("Passwords CSV file") | Non citati | [V] [Microsoft Support](https://support.microsoft.com/en-gb/help/4533249/microsoft-edge-whats-imported-from-google-chrome) |
| **Vivaldi** | Import da Chrome con errori di decifratura segnalati; il forum consiglia il CSV via `vivaldi://password-manager/settings` | "Cookie non trasferibili, accedere di nuovo" | [V-r] [aiuto Vivaldi](https://help.vivaldi.com/desktop/tools/import-and-export-browser-data/), forum |
| **Arc** (Windows) | Dichiara l'import di password, cronologia, segnalibri ed estensioni da Chrome, Edge, Brave, Opera, Opera GX, Vivaldi | Su Windows le recensioni dicono che si resta disconnessi dai siti | [V] [aiuto Arc](https://resources.arc.net/hc/en-us/articles/19335089616791); [V-r] recensioni |
| **Dia** | Nessuna informazione utile trovata per Windows | | |

**Consiglio unanime agli utenti:** esportare il CSV da `chrome://password-manager/settings` → "Esporta password". Chrome chiede la password di Windows o Windows Hello e avvisa che il file **non è cifrato**. Dopo l'import il file va cancellato ([V] [Guida Chrome](https://support.google.com/chrome/answer/13068232); [V-r] guide terze sul file in chiaro).

### 2.5 Le sessioni di login: perché non si portano

- [V] ABE impedisce a un'altra app di leggere i cookie di Chrome, Edge e (probabilmente) Brave.
- [V] **DBSC (Device Bound Session Credentials)** è disponibile su Chrome per Windows dalla 145-146, ad aprile 2026, ed è **attivo per tutti gli account Google personali e Workspace dal 28 maggio 2026, senza possibilità di disattivarlo**. La sessione è legata a una chiave nel TPM del PC tenuta da Chrome ([blog Chrome](https://developer.chrome.com/blog/dbsc-windows-announcement), [Workspace Updates](https://workspaceupdates.googleblog.com/2026/05/prevent-account-takeovers-with-DBSC-now-generally-available-in-the-Chrome-browser-for-Windows.html)). Anche avendo i cookie, la sessione Google non passerebbe a un altro browser [D].
- [D] Electron non usa la stessa chiave nel TPM e probabilmente non attiva DBSC: le sessioni Google dentro Search per Windows saranno meno protette che in Chrome.

### 2.6 Progetto di import onesto [D]

1. **Sempre, da tutti i browser:** segnalibri, cronologia, schede aperte, elenco delle estensioni (reinstallate dal Web Store per ID) e motore di ricerca. Si copiano i file prima di leggerli, come su Mac, e si chiede di chiudere il browser di origine se il file è bloccato. Su Windows SQLite si blocca più spesso che su Mac.
2. **Password:**
   - Valori `v10` (profili vecchi, browser senza ABE; da verificare per Opera, Opera GX e Vivaldi): decifratura locale con DPAPI nell'ambito dell'utente, dopo un consenso esplicito nella finestra di import ("Search leggerà le password salvate in Opera GX su questo PC").
   - Valori `v20`: **non si tenta**. Si apre una procedura guidata: pulsante che apre `chrome://password-manager/settings` nel browser di origine; poi "trascina qui il CSV"; import; offerta di cancellare il file dal disco.
   - Lo stesso CSV vale per Edge (`edge://wallet/passwords`) e Brave.
3. **Cookie e sessioni:** non importarli da Chrome, Edge e Brave e spiegarlo in una riga ("per sicurezza Chrome non lascia leggere le tue sessioni ad altre app: dovrai accedere di nuovo ai siti; le password importate lo renderanno veloce"). Facoltativo: import dei cookie da Firefox (non cifrati) e da browser `v10`, ma non è una priorità; le sessioni Google non funzionerebbero comunque.
4. **Carte di pagamento:** non importarle (Firefox ha rinunciato; Chrome non le esporta).
5. **Passkey:** non si importano. Restano in Windows Hello o nel gestore password e Search le usa via WebAuthn (vedi 4.2).

---

## 3. Aspetto su Windows 11 con Electron

[V] Fonte: [BaseWindow](https://www.electronjs.org/docs/latest/api/base-window), [Custom Window Styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles), [nativeTheme](https://www.electronjs.org/docs/latest/api/native-theme), [systemPreferences](https://www.electronjs.org/docs/latest/api/system-preferences).

| Funzione | API | Note e limiti |
|---|---|---|
| Mica, Acrylic, Mica a schede | `backgroundMaterial: 'auto' \| 'none' \| 'mica' \| 'acrylic' \| 'tabbed'` e `setBackgroundMaterial()` | **Solo Windows 11 22H2 e successivi.** `tabbed` è il materiale pensato per una barra con schede |
| Pulsanti finestra nativi su barra personalizzata | `titleBarStyle: 'hidden'` + `titleBarOverlay: { color, symbolColor, height }` e `setTitleBarOverlay()` | È la "Window Controls Overlay": i pulsanti restano di Windows, quindi con il menu Snap Layouts [D]. Disegnare i pulsanti in HTML fa perdere Snap Layouts, perché Windows lo mostra solo sul pulsante di ingrandimento riconosciuto dal sistema ([V] [Microsoft](https://learn.microsoft.com/en-us/windows/apps/desktop/modernize/ui/apply-snap-layout-menu)) |
| Angoli arrotondati senza cornice | `roundedCorners` (default `true`) | Nessun effetto prima di Windows 11 build 22000 |
| Trasparenza | `transparent` | Su Windows solo senza cornice; finestre trasparenti **non ridimensionabili** e non ingrandibili dal menu di sistema o con doppio clic |
| Sfocatura | CSS `backdrop-filter` | Sfoca solo il contenuto della finestra, non il desktop dietro. Per il "vetro" su Windows si usa `backgroundMaterial` |
| Chiaro e scuro | `nativeTheme.themeSource`, `shouldUseDarkColors`, evento `updated`, CSS `prefers-color-scheme` | Come i colori in coppia di `Design.swift` |
| Contrasto elevato, trasparenza ridotta | `nativeTheme.shouldUseHighContrastColors` (Win e Mac), `prefersReducedTransparency` | |
| Colore d'accento | `systemPreferences.getAccentColor()`, evento `accent-color-changed` (Win e Linux), opzione `accentColor` e `setAccentColor()` per il bordo della finestra | La documentazione di `getAccentColor` cita macOS 10.14, ma le note di versione 45 correggono proprio `accent-color-changed` su Windows rispetto a `getAccentColor()` ([V] [v45.0.0](https://github.com/electron/electron/releases/tag/v45.0.0)), quindi funziona anche su Windows |

**Bug noti, issue Electron** ([V]):
- [#41676](https://github.com/electron/electron/issues/41676) (aperta): finestre Mica senza cornice che "tremano" all'apertura.
- [#48192](https://github.com/electron/electron/issues/48192): barra opaca forzata sopra Mica in alcuni aggiornamenti.
- [#47366](https://github.com/electron/electron/issues/47366): pulsante ingrandisci della WCO con `backgroundMaterial`.
- [#46753](https://github.com/electron/electron/issues/46753) e [#43196](https://github.com/electron/electron/issues/43196): nero o angoli persi a finestra ingrandita.
- [#51662](https://github.com/electron/electron/issues/51662): angoli bianchi a finestra inattiva.
- [#54025](https://github.com/electron/electron/issues/54025): `ready-to-show` che non scatta con `titleBarOverlay` (regressione in 44.4).
- [#52208](https://github.com/electron/electron/issues/52208): altezza della barra sbagliata dopo un cambio di scala DPI.
- Quasi tutte chiuse, ma tornano spesso: vanno provate a ogni aggiornamento di Electron.

**Ricetta consigliata [D]:**
- `titleBarStyle: 'hidden'` con `titleBarOverlay` trasparente e `symbolColor` legato al tema.
- `backgroundMaterial: 'tabbed'` (o `mica`) e fondo della UI trasparente con strati semitrasparenti; le pagine stanno in `WebContentsView`, opache.
- Schede a sinistra come su Mac, con la zona di trascinamento in CSS (`app-region: drag`).
- Su Windows 10, o con trasparenza disattivata, ripiego su colori pieni.
- Il Liquid Glass di macOS non esiste su Windows: "identico" deve voler dire stessa struttura, stessi colori e stesse animazioni, con il materiale nativo di Windows.

---

## 4. Integrazione con Windows

### 4.1 Browser predefinito

- [V] **Registrazione.** Una chiave `Capabilities` con `ApplicationName`, `URLAssociations` (`http`, `https`) e `FileAssociations` (`.htm`, `.html`, `.pdf`, ...) che puntano a un ProgID con `shell\open\command`, più un valore in `RegisteredApplications` che indica quella chiave ([Default Programs](https://learn.microsoft.com/en-us/windows/win32/shell/default-programs)).
- [D] Per un browser si usa anche `Software\Clients\StartMenuInternet\<Nome>`. Con un'installazione per utente tutto va sotto HKCU, scritto dall'installer NSIS (script personalizzato di electron-builder).
- [V] **Non si può diventare predefiniti da codice.** Windows non permette di cambiare le app predefinite senza un'azione dell'utente nell'interfaccia di sistema; il driver UCPD blocca le chiavi `UserChoice` per http(s) e `.pdf` ([Microsoft](https://learn.microsoft.com/windows/uwp/launch-resume/launch-default-apps-settings), [doc Firefox](https://firefox-source-docs.mozilla.org/widget/windows/shell/set-default.html)).
- [V] Si apre la pagina dell'app in Impostazioni con `ms-settings:defaultapps?registeredAppUser=<Nome>` (installazione per utente) o `registeredAppMachine=` (per macchina), su Windows 11 21H2 e 22H2 con aggiornamento di aprile 2023, o 23H2 e successivi. L'utente preme "Imposta come predefinito".
- [V] **Unione Europea (DMA):** dal luglio 2025 il pulsante "Imposta come predefinito" copre più tipi (http, https, ftp, .htm, .html...). Widget, schermata di blocco e ricerca aprono i link nel browser predefinito, non più in Edge ([blog Windows](https://blogs.windows.com/blog/2025/06/02/updates-to-windows-for-the-digital-markets-act/)). L'utente è in Italia, quindi rientra in questo caso.
- [D] `app.setAsDefaultProtocolClient('https')` di Electron non basta per diventare il browser predefinito: registra solo il gestore.

### 4.2 Passkey e Windows Hello

- [V-r] Su Windows le chiamate WebAuthn standard (`navigator.credentials.create/get`) in Electron usano Windows Hello: "Windows Hello funziona subito", mentre su macOS servono `app.configureWebAuthn()` ed Electron 42+ ([Clerk](https://clerk.com/docs/reference/electron/passkeys)). [D] Chromium su Windows passa da `webauthn.dll`, quindi passkey sul PC, sul telefono (QR) e chiavi di sicurezza dovrebbero funzionare.
- [V] Electron 45 ha corretto un crash con chiavi di sicurezza che chiedono il PIN ([v45.0.0](https://github.com/electron/electron/releases/tag/v45.0.0)).
- **Conferma con Windows Hello prima di riempire una password:** Electron non la offre; `systemPreferences.promptTouchID` esiste solo su Mac. Servono un modulo nativo che chiami `UserConsentVerifier` (WinRT) [D] ([V] [API](https://learn.microsoft.com/en-us/uwp/api/windows.security.credentials.ui.userconsentverifier)). Attenzione: Raymond Chen spiega che quella finestra **chiede solo il consenso, non protegge nulla**; una protezione vera richiede una chiave Windows Hello nel TPM (`KeyCredentialManager`) che cifri la chiave del portachiavi ([V] [The Old New Thing](https://devblogs.microsoft.com/oldnewthing/20240924-00/?p=110308)). Chrome stesso ha un autenticatore Windows per questo (`device_reauth/win/authenticator_win.cc`), ma Electron non include il password manager di Chrome [D].

### 4.3 Cifrare le password salvate

- [V] `safeStorage` su Windows usa **DPAPI**: protegge dagli altri utenti del PC, **non dalle altre app dello stesso utente** ([doc](https://www.electronjs.org/docs/latest/api/safe-storage)). Le API sincrone sono deprecate in Electron 45 e spariscono in 46; si usano `encryptStringAsync` e `decryptStringAsync`.
- [D] È meno di quanto offre su Mac il portachiavi legato alla firma ("Any other app triggers the system's permission dialog"). Per avvicinarsi: chiave del portachiavi di Search protetta con DPAPI, più un involucro facoltativo con una chiave Windows Hello (4.2), più la richiesta di Hello prima di mostrare o esportare le password.

### 4.4 Barra delle applicazioni, notifiche, media, PiP

| Funzione | API Electron | Stato |
|---|---|---|
| Jump list | `app.setUserTasks()`, `app.setJumpList()` | [V] [doc taskbar](https://www.electronjs.org/docs/latest/tutorial/windows-taskbar) (consigliato un elenco statico) |
| Progresso download sull'icona | `win.setProgressBar()` | [V] |
| Badge | `win.setOverlayIcon()` (piccola icona sovrapposta) | [V]; [D] niente badge numerico come sul Dock per le app non pacchettizzate |
| Pulsanti nella miniatura | `setThumbarButtons()` (massimo 7) | [V] |
| Notifiche | `Notification`, `toastXml` per azioni e immagini | [V] Servono una scorciatoia nel menu Start con AppUserModelID (l'installer la crea) e `app.setAppUserModelId()` in sviluppo ([doc](https://www.electronjs.org/docs/latest/tutorial/notifications)) |
| Tasti multimediali | Media Session di Chromium → controlli multimediali di Windows (SMTC) | [V-r] su Windows 10+ Electron usa SystemMediaControls invece di un ascolto globale dei tasti ([PR #34594](https://github.com/electron/electron/pull/34594)) |
| Picture in Picture | `video.requestPictureInPicture()` di Chromium | [D] dovrebbe funzionare come in Chrome; non ho trovato conferme specifiche per Electron. Document PiP non verificato. Su Mac Search ha il suo `⇧⌘P`, quindi su Windows conviene la stessa scelta: finestra propria sempre in primo piano |

---

## 5. Distribuzione

### 5.1 electron-builder da Mac Apple Silicon

- [V] Versioni: `electron-builder` **26.18.0** (stabile), 27.0.0-alpha.15 (in arrivo); `electron-updater` 6.8.11; Electron Forge 8.0.1.
- [V] **NSIS e portable per Windows da macOS senza Wine**, verificato nel sorgente di 26.18.0:
  - le risorse dell'exe (icona, versione) si modificano in JavaScript con `resedit`;
  - su macOS 10.15 e successivi il disinstallatore si estrae leggendo il binario (`UninstallerReader`), senza eseguirlo con Wine;
  - `makensis` e `osslsigncode` arrivano come binari per `darwin-arm64`;
  - la documentazione: "tutte le dipendenze necessarie sono scaricate automaticamente su macOS" ([multi-platform-build](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/multi-platform-build.md); sorgente [NsisTarget.ts](https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/packages/app-builder-lib/src/targets/nsis/NsisTarget.ts)).
  - Se serve, Wine viene scaricato da solo, in versione x86_64 per macOS: girerebbe con Rosetta.
- [V] Architetture: `--x64 --arm64`. 32 bit non più disponibile da Electron 44.
- [V] **AppX e MSIX** richiedono strumenti solo Windows. Su Mac electron-builder li fa girare **dentro una macchina virtuale Parallels**. Il target `msix` esiste solo nella 27 alpha ed è in beta ([msix.md](https://github.com/electron-userland/electron-builder/blob/master/website/docs/msix.md)).
- [V] Electron Forge: Squirrel.Windows solo su Windows o Linux, MSIX solo su Windows 10/11 con SDK ([Squirrel](https://www.electronforge.io/config/makers/squirrel.windows), [MSIX](https://www.electronforge.io/config/makers/msix)). Da Mac electron-builder con NSIS è la scelta giusta.
- [V] **Limite che conta:** i moduli nativi si compilano solo sulla piattaforma di destinazione. In particolare **node-llama-cpp non supporta l'impacchettamento incrociato** ([guida Electron](https://node-llama-cpp.withcat.ai/guide/electron)). Quindi: prove rapide su Mac, build di rilascio su GitHub Actions Windows [D].

### 5.2 Aggiornamenti automatici

- [V] `electron-updater` supporta su Windows **solo il target NSIS**: niente aggiornamento per portable e Squirrel. Provider pronti: GitHub Releases, S3, server generico. Ci sono aggiornamenti differenziali con blockmap ([auto-update](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/auto-update.md)).
- [V] Un repository **privato** richiede `GH_TOKEN` sul computer dell'utente ed è "solo per casi molto particolari". [D] Serve un repository pubblico per le release, o un server generico (per esempio Cloudflare R2), come `searchbrowser.app` per Mac.
- [D] Come su Mac ("verifica che sia firmato da Office Commun"), electron-updater può controllare l'editore della firma Authenticode: ha senso solo con un certificato vero.

### 5.3 Firma e SmartScreen

[V] Fonti Microsoft aggiornate ottobre 2026 ([opzioni di firma](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/code-signing-options), [SmartScreen](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)):

| Opzione | Costo | Disponibilità | SmartScreen |
|---|---|---|---|
| **Microsoft Store (MSIX)** | Gratis; Microsoft firma; account sviluppatore gratuito | Ovunque | **Nessun avviso** |
| **Azure Artifact Signing** (ex Trusted Signing) | circa 9,99 $/mese | **Organizzazioni** in USA, Canada, **UE**, UK; **persone fisiche solo USA e Canada** | Reputazione che cresce col tempo |
| Certificato OV | 150-300 $/anno, chiave su token o HSM | Ovunque | Come sopra |
| Certificato EV | 400+ $/anno | Ovunque | **Dal 2024 uguale all'OV**: non salta più SmartScreen |
| Nessuna firma | 0 | | "**Windows ha protetto il PC**": l'utente deve premere "Ulteriori informazioni" e poi "Esegui comunque"; ogni nuova versione riparte da zero. Le aziende possono bloccarlo del tutto. **Smart App Control** su Windows 11 blocca i file non firmati senza reputazione positiva |

- [V] **Store e browser:** le regole dello Store (10.2.1) chiedono ai browser un motore Chromium o Gecko, aggiornato entro due versioni maggiori ([regole Store](https://learn.microsoft.com/windows/apps/publish/store-policies)). Electron è Chromium, quindi va bene, ma costringe ad aggiornare Electron spesso [D].
- [D] Office Commun, come studio con sede nell'UE (da verificare la forma giuridica), può usare Artifact Signing; una persona fisica in Italia no.
- [D] **Strada consigliata:** MSIX sullo Store per chi non vuole avvisi, più installer NSIS firmato con Artifact Signing per il download diretto con aggiornamenti propri. electron-builder supporta Artifact Signing con `win.azureSignOptions`, tramite il modulo PowerShell `Invoke-TrustedSigning`: si fa sul runner Windows di GitHub Actions ([V] [code-signing-win](https://github.com/electron-userland/electron-builder/blob/master/website/docs/features/code-signing/code-signing-win.md)). Con un certificato OV su token, invece, si firma anche da Mac con `osslsigncode` e PKCS#11 ([V] [tutorial](https://github.com/electron-userland/electron-builder/blob/master/website/docs/tutorials/code-signing-windows-apps-on-unix.md)).

---

## 6. Provare senza un PC Windows

### 6.1 GitHub Actions

| Voce | Valore | Fonte |
|---|---|---|
| Repo pubblici | Runner standard **gratuiti** | [V] [billing GitHub](https://docs.github.com/en/billing/concepts/product-billing/github-actions) |
| Repo privati, piano Free | Credito incluso di **12 $/mese**; Windows x64 2 core = 0,010 $/min, quindi **circa 1.200 minuti Windows al mese** (calcolo mio) | [V], [D] per il conto |
| Piano Pro | 18 $/mese inclusi | [V] |
| Runner Windows | `windows-latest`, `windows-2025`, `windows-2022`; **arm64: `windows-11-arm` disponibile anche nei repo privati** (2 vCPU, 8 GB, 14 GB SSD nei privati; 4 vCPU e 16 GB nei pubblici) | [V] [runner](https://docs.github.com/en/actions/reference/runners/github-hosted-runners) |
| Privilegi | amministratore, UAC disattivato | [V] |

- **Prove automatiche:** Playwright ha il supporto Electron (`_electron.launch`, sperimentale) e il suo stesso CI lo esegue su Windows senza schermo virtuale; `page.screenshot()` cattura le finestre ([V] [Playwright](https://playwright.dev/docs/api/class-electron); [V-r] Simon Willison). [D] Le foto dell'intero desktop si fanno con PowerShell o ffmpeg. Le macchine non hanno GPU: Mica e Acrylic probabilmente appaiono come colore pieno e i test visivi del vetro non sono affidabili lì.
- [D] Il runner arm64 serve a provare la build arm64 e node-llama-cpp `win-arm64`.

### 6.2 Macchina virtuale Windows 11 ARM sul Mac

| Soluzione | Costo | Note |
|---|---|---|
| **Parallels Desktop 26** | Standard 99,99 $/anno (perpetua 219,99 $), Pro 119,99 $/anno | [V] Unica soluzione **autorizzata da Microsoft** per Windows 11 Pro ed Enterprise su Apple Silicon ([Parallels](https://www.parallels.com/products/desktop/microsoft-authorized-solution-windows-11-arm/); prezzi da [TidBITS](https://tidbits.com/watchlist/parallels-desktop-26/) al lancio). È anche quella che electron-builder usa da solo per creare AppX e MSIX su Mac |
| **VMware Fusion Pro** | Gratis (personale da maggio 2024; anche commerciale secondo Broadcom da novembre 2024, senza un testo di licenza chiaro) | [V-r] [VMware](https://blogs.vmware.com/teamfusion/2024/05/fusion-pro-now-available-free-for-personal-use.html), [heise](https://heise.de/-10023949). Accelerazione 3D per Windows 11 ARM. Download con registrazione e controllo export Broadcom |
| **UTM** (QEMU) | Gratis | [V-r] Grafica di base (ramfb, virtio-gpu); driver "Triton" sperimentale con DirectX dal 2026 ([articolo](https://www.generationamiga.com/2026/08/01/utm-triton-brings-directx-11-graphics-to-qemu-on-apple/)). Il meno adatto a giudicare Mica |
| Windows 365 Cloud PC | Abbonamento | Seconda via indicata da Microsoft per i Mac [V-r] |

- [V] **ISO ufficiale Windows 11 ARM64** (versione 26H2) su [microsoft.com](https://www.microsoft.com/en-us/software-download/windows11arm64). Serve una licenza.
- [V-r] **Senza attivazione** Windows funziona, ma la **Personalizzazione è bloccata**: niente tema né **colore d'accento**. Per provare colore d'accento e tema scuro una licenza serve davvero.
- [D] In Windows 11 ARM, Electron arm64 gira nativo e Electron x64 gira con l'emulazione Prism: si provano entrambe le build nella stessa VM.
- [D] Restano da provare su un PC vero, almeno una volta prima del rilascio: Windows Hello con biometria, GPU reali (Vulkan, CUDA), browser predefinito con UCPD, Smart App Control.

---

## 7. AI locale su Windows

**Com'è fatto su Mac** ([V] `ref/search-mac/engine.sh`): un programma separato `search-ai-engine` (C++), collegato **staticamente** a llama.cpp fissato al tag `v0.5.0`, compilato senza nulla che vada in rete, con Metal su arm64 e solo CPU su x86_64.

**Due strade su Windows:**

1. **Stesso schema del Mac (consigliato [D]).** Compilare `Engine/search-ai-engine.cpp` per Windows con CMake e MSVC o clang su un runner `windows-latest` e `windows-11-arm`, con backend **CPU + Vulkan** (Vulkan funziona su NVIDIA, AMD e Intel), e lanciarlo come processo figlio o `utilityProcess`. Stessa versione di llama.cpp del Mac, stesso protocollo, nessun modulo Node nativo.
2. **node-llama-cpp.** [V] Versione 3.22.3 (5 nov 2026, MIT), binari precompilati per Windows dentro pacchetti opzionali npm. Si usa **solo nel processo principale** di Electron, va tenuto fuori dall'asar e **non si impacchetta da un'altra piattaforma** ([guida Electron](https://node-llama-cpp.withcat.ai/guide/electron)). Dimensioni dal registro npm:

| Pacchetto | Dimensione | Note |
|---|---|---|
| `@node-llama-cpp/win-x64` (CPU) | 34 MB | |
| `@node-llama-cpp/win-x64-vulkan` | 75 MB | |
| `@node-llama-cpp/win-x64-cuda` | 193 MB | CUDA 12.4 e 13.1 ([V] [guida CUDA](https://node-llama-cpp.withcat.ai/guide/CUDA), che chiede anche driver NVIDIA e CUDA Toolkit) |
| `@node-llama-cpp/win-x64-cuda-ext` | 409 MB | estensione del pacchetto CUDA |
| `@node-llama-cpp/win-arm64` | 12 MB | solo CPU; non c'è una variante Vulkan arm64 |

**Binari ufficiali di llama.cpp** (release `b12651`, 23 nov 2026, [V] [GitHub](https://github.com/ggml-org/llama.cpp/releases)), zip:
- `win-cpu-x64` 23 MB; `win-vulkan-x64` 37 MB
- `win-cpu-arm64` 12 MB; `win-vulkan-arm64` 25 MB; `win-opencl-adreno-arm64` 13 MB (Snapdragon)
- `win-cuda-12.4-x64` 341 MB più runtime `cudart` 373 MB; `win-cuda-13.5-x64` 215 MB più 406 MB
- SYCL 165 MB (Intel), ROCm 271 MB (AMD), OpenVINO 100 MB

[V] Il **13 novembre 2026 è uscito llama.cpp v1.0.0**, che **rimuove la vecchia API pubblica deprecata** ([note](https://github.com/ggml-org/llama.cpp/releases/tag/v1.0.0), [blog](https://huggingface.co/blog/ggml-org/llama-cpp-v1)). [D] Il motore Mac è su v0.5.0: per la parità conviene fissare la stessa versione anche su Windows, oppure aggiornare i due insieme.

[V] **Novità utile:** Electron 45 aggiunge il supporto alla **Prompt API** (`LanguageModel`) tramite `session.registerLocalAIHandler(utilityProcess)`, sperimentale ([note v45.0.0](https://github.com/electron/electron/releases/tag/v45.0.0), [session.md](https://github.com/electron/electron/blob/main/docs/api/session.md)). [D] Permetterebbe di offrire il modello locale anche alle pagine web e alle estensioni con l'API standard di Chrome.

**Accelerazione consigliata [D]:**
- Vulkan come predefinito su x64, con ripiego automatico sulla CPU.
- CUDA come download facoltativo per chi ha NVIDIA: aggiunge 550-800 MB, troppo per l'installer base.
- Su ARM, CPU (più eventualmente Vulkan arm64 o OpenCL Adreno).
- Installer base con motore CPU + Vulkan: circa 40-80 MB oltre a Electron; il modello si scarica a parte come su Mac.

---

## 8. Raccomandazioni finali

1. **Electron 45.x fissato + librerie di Maddock (ora MIT) + strato di API scritto da noi**, con una suite di prove su estensioni reali eseguita su GitHub Actions Windows a ogni cambio di Electron. Seguire le PR #55729, #55552 e #55270: sbloccano DNR statico (uBlock Origin Lite), attivazione e disattivazione, pannelli laterali.
2. **Prima di tutto, tre prove di fattibilità su Windows (VM e Actions):** accesso a Google, uBlock Origin Lite e 1Password o Bitwarden, Mica con `titleBarOverlay`. Se l'accesso a Google fallisce, il progetto va ripensato.
3. **Import:** diretto per segnalibri, cronologia, schede ed estensioni; password con DPAPI solo per i dati `v10` e con consenso; procedura CSV guidata per i dati `v20`; niente cookie da Chrome, Edge e Brave, spiegando il motivo.
4. **Build:** sviluppo e prove rapide su Mac; build di rilascio, node-llama-cpp o motore C++, MSIX e firma su GitHub Actions (`windows-latest` e `windows-11-arm`). Repository delle release pubblico.
5. **Firma:** Artifact Signing a nome di Office Commun (se è un'organizzazione UE), più Microsoft Store in MSIX. Senza firma l'app è utilizzabile solo da chi accetta "Esegui comunque", e Smart App Control può bloccarla.
6. **Prove visive:** una VM Windows 11 ARM attivata con Parallels o VMware Fusion; prima di ogni rilascio, una prova su un PC vero, anche prestato, per GPU, Hello e browser predefinito.
7. **Widevine:** se serve lo streaming con DRM, Electron di castLabs con firma VMP (EVS).
