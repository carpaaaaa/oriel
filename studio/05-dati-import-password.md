# 05 · Dati dell'utente, import, password, sync

Studio del sorgente Mac di Search 1.0.19 (`ref/search-mac`) per la versione Windows (Electron). Solo lettura: niente codice, niente avvio dell'app.

Convenzioni di questo documento:

- Identificatori, chiavi e testi dell'interfaccia sono copiati esatti, in inglese, tra backtick.
- Dove un testo originale contiene il trattino lungo, qui è scritto come escape `\u2014` (com'è anche in un sorgente JavaScript): il testo resta identico, il carattere non compare.
- I segnaposto Swift restano come nel sorgente: `\(source.name)` vuol dire "nome del browser".
- Per ogni affermazione su Windows è indicato **verificato** (fonte ufficiale o documentazione), **fonte terza** (forum, guide, repository non ufficiali) o **dedotto** (ragionamento, da provare su una macchina Windows).

---

## 0. In breve

- Search Mac importa da **24 browser** in tre famiglie: Chromium (21 voci), Gecko/Mozilla (6), WebKit (3), più **file esportati** (HTML segnalibri, CSV password, ZIP di Safari).
- Cosa porta: segnalibri, cronologia (ultimi 3000 posti), password (Chromium e Gecko), schede aperte e gruppi (Chromium e Gecko), spazi e pin (Arc e Zen), estensioni dal Chrome Web Store (Chromium), icone dei siti. **Non importa mai** cookie o sessioni (i "login" come stato di accesso), moduli, indirizzi, carte, motori di ricerca, impostazioni.
- Password Chromium sul Mac: chiave `<Nome> Safe Storage` dal portachiavi macOS (un solo prompt), PBKDF2-SHA1 `saltysalt` 1003 giri, AES-128-CBC con IV di 16 spazi, prefisso `v10`. Firefox: NSS `key4.db` + `logins.json` con password primaria vuota.
- Le password di Search stanno nel **portachiavi macOS** (internet password con etichetta `Search`); il resto in **piccoli JSON** in `~/Library/Application Support/Search/`.
- Sync: **iCloud** (CloudKit, cifrato end to end, anche con l'iPhone) oppure **cartella condivisa** (iCloud Drive, Dropbox: file JSON per dispositivo). Mai cronologia, password, cookie. **Handoff** della pagina in primo piano.
- Su Windows il punto più delicato: **Chrome, Edge e Brave recenti cifrano password e cookie con App-Bound Encryption (prefisso `v20`)**, che un'altra app non può aprire in modo pulito. Per loro serve la via CSV. Opera, Opera GX, Vivaldi e Firefox restano leggibili (dedotto per gli Opera, da provare).

---

## 1. IMPORT

### 1.1 Architettura comune

Tutto passa da un tipo unico, `ImportSource` (`Import.swift:1363`), con tre casi:

| Caso | Famiglia | Legge |
|---|---|---|
| `.chromium(Chromium.Source)` | Chrome e derivati | `Bookmarks` (JSON), `History` (SQLite), `Login Data` e `Login Data For Account` (SQLite), `Favicons` (SQLite), `Preferences` e `Secure Preferences` (JSON), `Sessions/Session_*` o `Current Session` (SNSS), `Local State` (JSON) |
| `.mozilla(Mozilla.Source)` | Firefox e derivati | `places.sqlite`, `favicons.sqlite`, `key4.db`, `logins.json`, `profiles.ini`, `sessionstore*.jsonlz4`; per Zen anche `zen-sessions.jsonlz4` |
| `.webkit(WebKitBrowser.Source)` | Safari, Orion | `Bookmarks.plist`, `History.db` (Safari); `favourites.plist`, `history`, `profiles` (Orion) |

Regole fisse, valide per ogni famiglia:

1. **Conteggio senza chiave** (`preview`, `Import.swift:486`, `:1109`; `ImportWebKit.swift:313`). All'apertura del pannello si contano segnalibri, posti, password (righe non vuote, non "never"), estensioni e schede aperte **leggendo solo i file**: nessuna chiave chiesta, niente decifrato, quindi nessun prompt. Il prompt arriva solo al clic su `Bring them in`. Un contatore `keyAsks` (`Import.swift:577`) serve ai test per verificarlo.
2. **Copia prima di leggere** (`Snapshot`, `Import.swift:1608`). Ogni SQLite viene copiato in una cartella temporanea propria (`office-import-<pid>-<uuid>`, `ImportFile.swift:19`) insieme a `-wal` e `-shm`, perché il browser di origine di solito è aperto e le ultime scritture stanno nel WAL. La copia sparisce con l'oggetto. All'avvio `sweepScratch` (`ImportFile.swift:27`) cancella le cartelle di processi morti.
3. **Lettura difensiva** (`ImportRead`, `Import.swift:1565`). Apertura con `O_NOFOLLOW`, solo file regolari, controllo che il descrittore aperto stia dentro la cartella del browser (`F_GETPATH`), JSON al massimo **64 MB**. Profili e file che puntano fuori dalla radice vengono scartati (`Import.swift:81-99`).
4. **Solo http e https**: ogni URL con altro schema è scartato; utente e password dentro un URL vengono tolti (`Arc.page`, `ImportArc.swift:181`).
5. **Profili**. Ogni lettura accetta un profilo (nome della cartella) o `nil` = tutti. Il profilo proposto è quello usato per ultimo (`usual`, `Import.swift:1505`): per Chromium `Local State` › `profile.last_used`, poi `last_active_profiles`, poi la cartella con file modificati più di recente; per Gecko la sezione `Install*` di `profiles.ini` (`Default=`), poi `Default=1`, poi il più recente; per WebKit il primo. I nomi leggibili vengono da `Local State` › `profile.info_cache.<cartella>.name` o da `profiles.ini` › `Name=`. `Guest Profile` e `System Profile` non sono mai offerti (`Import.swift:1486`).
6. **Browser presente ma illeggibile** (`Chromium.unreadable`, `Import.swift:243`; messaggi `Import.swift:212-231`). Se l'app è in `/Applications` o `~/Applications` ma la cartella dati manca o macOS nega l'accesso, il pannello lo dice per nome e offre `Choose folder…`: la cartella scelta vale **solo per la sessione** (non viene salvata, perché un percorso salvato potrebbe essere cambiato da un altro processo, `Import.swift:189-205`).

### 1.2 Browser riconosciuti e cosa portano

**Famiglia Chromium** (`Chromium.known`, `Import.swift:145-174`). Cartella sotto `~/Library/Application Support/`, servizio e account del portachiavi per la chiave, app cercata.

| Nome | Cartella Mac | Chiave portachiavi (service / account) | Password |
|---|---|---|---|
| Dia | `Dia/User Data` | `Dia Safe Storage` / `Dia` | sì |
| Chrome | `Google/Chrome` | `Chrome Safe Storage` / `Chrome` | sì |
| ego lite | `Citro Labs/ego lite` | nessuna | **no** |
| Arc | `Arc/User Data` | `Arc Safe Storage` / `Arc` | sì |
| Brave | `BraveSoftware/Brave-Browser` | `Brave Safe Storage` / `Brave` | sì |
| Edge | `Microsoft Edge` | `Microsoft Edge Safe Storage` / `Microsoft Edge` | sì |
| Vivaldi | `Vivaldi` | `Vivaldi Safe Storage` / `Vivaldi` | sì |
| Chromium | `Chromium` | `Chromium Safe Storage` / `Chromium` | sì |
| Chrome Beta, Dev, Canary | `Google/Chrome Beta` ecc. | stessa chiave di Chrome | sì |
| Opera | `com.operasoftware.Opera` | `Opera Safe Storage` / `Opera` | sì |
| Opera GX | `com.operasoftware.OperaGX` | `Opera Safe Storage` / `Opera` | sì |
| Helium | `net.imput.helium` | `Helium Storage Key` / `Helium` | sì |
| Comet | `Comet` | `Comet Safe Storage` / `Comet` | sì |
| Thorium | `Thorium` | `Thorium Safe Storage` / `Thorium` | sì |
| Naver Whale | `Naver/Whale` | `Whale Safe Storage` / `Whale` | sì |
| Island | `Island` | `Island Safe Storage` / `Island` | sì |
| Sidekick | `Sidekick` | `Sidekick Safe Storage` / `Sidekick` | sì |
| Yandex | `Yandex/YandexBrowser` | nessuna (usa "Ya Passman Data") | **no** |
| ChatGPT Atlas | `com.openai.atlas/browser-data/host` | nessuna (chiave riservata alle app OpenAI) | **no** |

Per ognuno: segnalibri, cronologia, password (se sì), schede aperte e gruppi, estensioni del Web Store, icone. Solo **Arc** porta anche spazi e pin. Opera tiene il profilo nella cartella stessa (la ricerca profili include la radice, `Import.swift:64`).

**Famiglia Gecko** (`Mozilla.known`, `Import.swift:799-806`). Tutti: segnalibri, cronologia, password (se nessuna password primaria), schede aperte e gruppi, icone. **Zen** anche spazi, pin, cartelle, Essentials.

| Nome | Cartelle cercate (sotto Application Support) |
|---|---|
| Firefox | `Firefox/Profiles`, `Firefox` |
| Zen | `zen/Profiles`, `Zen/Profiles`, `zen`, `Zen` |
| Floorp | `Floorp/Profiles`, `Floorp` |
| LibreWolf | `librewolf/Profiles`, `LibreWolf/Profiles`, `librewolf`, `LibreWolf` |
| Waterfox | `Waterfox/Profiles`, `Waterfox` |
| Mullvad Browser | `MullvadBrowser/Profiles`, `MullvadBrowser` |

**Famiglia WebKit** (`WebKitBrowser.known`, `ImportWebKit.swift:84-88`): Orion, Orion RC (segnalibri e cronologia), Safari (segnalibri, Reading List, cronologia; **solo se macOS lascia aprire i file**, cioè con Accesso completo al disco, che Search non chiede mai). Password: mai, stanno nel Portachiavi e nell'app Passwords.

Riga "cosa può portare" sotto ogni browser (`canBring`, `Import.swift:1439`): `bookmarks`, `history`, `passwords` (se supportate), `spaces & pins` (Arc, Zen), `open tabs` (non WebKit), uniti con `ListFormatter` e iniziale maiuscola: per esempio `Bookmarks, history, passwords and open tabs`.

### 1.3 Chromium nel dettaglio

**Segnalibri** (`Import.swift:316-367`). JSON `Bookmarks` › `roots`: i figli di `bookmark_bar` vanno in cima; `other` diventa una cartella `Other`, `synced` una cartella `Mobile` (solo se non vuote). Nodi `type` = `folder` o `url`. Ogni profilo letto si somma. `complete` è falso se un file `Bookmarks` esiste ma non si legge (serve a `Replace`, vedi 1.11). Nota per Opera: le radici proprie di Opera (Speed Dial e simili, dentro `custom_root`, **dedotto**) non vengono lette.

**Cronologia** (`Import.swift:433-477`): tabella `urls`, `hidden = 0 AND visit_count > 0`, ordinata per `last_visit_time` decrescente, limite **3000**. Data Chromium = microsecondi dal 1601: `stamp / 1_000_000 - 11_644_473_600`.

**Password: lettura** (`Import.swift:659-697`): `SELECT origin_url, username_value, password_value, blacklisted_by_user, date_last_used FROM logins`. Legge sia `Login Data` sia `Login Data For Account` (Chrome connesso a un account Google senza sync salva lì; letto da solo il primo può sembrare vuoto, `Import.swift:108-117`). Le righe `blacklisted_by_user` diventano siti "never". Host normalizzato da `Vault.host(of:)`: minuscolo, senza `www.`, solo http e https (un `android://` viene scartato, `Vault.swift:377-388`). Righe senza host: contate come `skipped`. Deduplica per `host + \u0001 + user`. `clear = true` se l'origine era `http://`.

**Password: decifratura su Mac** (`Import.swift:579-647`):

1. `SecItemCopyMatching` di una generic password con `service` e `account` della tabella sopra: **macOS mostra il suo dialogo** ("Search vuole usare la chiave…"), l'unico sì richiesto. In test la chiave è un file `Safe Storage` accanto ai profili finti.
2. Chiave = PBKDF2-HMAC-SHA1(passphrase, salt `saltysalt`, **1003** giri, 16 byte).
3. Blob = `v10` + AES-128-CBC, IV = 16 byte `0x20` (spazi), padding PKCS7.
4. Se il testo in chiaro non è UTF-8, si saltano i primi **32 byte** (hash del dominio che le build recenti antepongono) e si riprova.
5. Un blob senza prefisso `v10` è rifiutato di proposito: una password in chiaro nei file del profilo può averla messa solo un programma ostile.
6. Le righe che non si decifrano sono contate (`undecrypted`) e dette all'utente, mai taciute.

**Estensioni** (`Import.swift:528-571`): da `Preferences` e `Secure Preferences` › `extensions.settings`. Tenute solo quelle aggiunte dalla persona (`location == 1` o `from_webstore == true`), non `was_installed_by_default`, non `was_installed_by_oem`, non temi, e con `update_url` di `google.com` (quelle dello store di Edge sono escluse). Id validi: 32 lettere da `a` a `p`. Senza file di impostazioni si usano i nomi delle cartelle in `Extensions/`. Vengono **reinstallate fresche dal Chrome Web Store**, mai copiate, con conferma una per una (`ImportPanel.swift:577-581`). Richiede macOS 15.4.

**Schede aperte e gruppi** (`ImportSession.swift`, contributo #841). File più recente `Sessions/Session_*`, altrimenti `Current Session`. Formato **SNSS** versione 1 o 3: frame `u16 size` + `u8 comando` + corpo. Comandi letti: `0` window, `2` index, `6` navigation, `7` selectedNavigation, `9` windowType, `12` pinned, `16` tabClosed, `17` windowClosed, `24` pruned, `25` group, `27` groupMetadata (`ImportSession.swift:66-78`). Solo finestre normali (tipo 0), voce selezionata di ogni scheda, gruppi con nome e stato chiuso; gruppo senza nome diventa `Group 1`, `Group 2`... Limite **300 schede** (`SessionImport.limit`). Titoli tagliati a 300 caratteri, vuoti sostituiti dall'host. Non legge `Tabs_*` (chiuse di recente) né i gruppi salvati.

**Icone** (`Import.swift:372-420`): file `Favicons`, `icon_mapping` JOIN `favicon_bitmaps`, larghezza 16..256, la più grande, per la pagina o per la home del sito; al massimo 400 host; scartate se sotto 60 byte. Adottate nella cache icone di Search dopo segnalibri, pin e schede.

### 1.4 Arc

`ImportArc.swift`. File `~/Library/Application Support/Arc/StorableSidebar.json` (JSON in chiaro, nessuna chiave), massimo 32 MB.

- `sidebar.containers[]`: il primo con `spaces`. `items[]` per id, collegati da `childrenIds`; un item è una scheda (`data.tab.savedURL`, `savedTitle`) o una cartella (`data.list`).
- Ogni spazio: `title`, icona da `customInfo.iconType.emoji_v2` o `icon`, contenitore `pinned` da `newContainerIDs` o `containerIDs` (etichetta stringa o oggetto). Il contenitore `unpinned` (Today) **non** viene portato.
- Preferiti in alto: `topAppsContainerIDs`, alternanza profilo/id; profilo `{"default":{}}` o `{"custom":{"_0":{"directoryBasename":...}}}`.
- Nomi dei profili Arc da `Arc/User Data/Local State` (solo `info_cache.*.name`, 60 caratteri).
- Limiti: 64 livelli di cartelle, 5000 elementi.
- Icona dello spazio: tabella emoji/icona Arc/parole del nome verso simboli SF (`Arc.symbol`, `ImportArc.swift:208-312`); da rimappare sulle icone Windows.

Come atterra (`Browser.takeArc`, `Browser.swift:3820-3956`):

- Ogni spazio Arc diventa uno spazio di Search (o quello con lo stesso nome); più di uno accende gli spazi.
- Ogni altro profilo Arc diventa un **profilo Search** con lo stesso nome e cookie propri.
- I preferiti diventano **pin** di ogni spazio del loro profilo (senza doppioni: `samePin` confronta sito e percorso contenuto, `Browser.swift:4056`).
- Le pagine fissate: con `Pinned rows` acceso diventano righe fissate; quelle in cartella restano schede in un gruppo con il nome della cartella; con anche `Folders in pinned rows` le cartelle restano cartelle annidate. Altrimenti tutte schede addormentate in fondo allo spazio.
- Lo spazio iniziale vuoto e intatto viene sostituito dagli spazi arrivati.
- Le schede aperte di Arc non vengono offerte insieme agli spazi (`sessionRepeatsSpaces`), perché ripetono gli stessi pin.
- Dopo l'import compare l'offerta `Set Up Like Arc` (1.12).

### 1.5 Gecko (Firefox e derivati)

**Profili**: ogni `places.sqlite` trovato nelle cartelle sopra, dal più recente; duplicati per inode (`zen` e `Zen` sono la stessa cartella su APFS).

**Segnalibri** (`Import.swift:854-927`): `moz_bookmarks` LEFT JOIN `moz_places`, `type` 1 pagina, 2 cartella, per `position`. Si ricostruisce l'albero per `parent`. In cima: figli di `toolbar_____` poi di `menu________`; `unfiled_____` diventa `Other`, `mobile______` diventa `Mobile`; `tags________` escluso. Cartelle senza nome: `Folder`. Protezione da cicli, profondità 64.

**Cronologia** (`Import.swift:996-1032`): `moz_places`, `hidden = 0 AND visit_count > 0 AND last_visit_date IS NOT NULL`, limite 3000. Data = microsecondi dal **1970** (nessun offset 1601).

**Icone**: `favicons.sqlite`, `moz_pages_w_icons` JOIN `moz_icons_to_pages` JOIN `moz_icons`.

**Password** (`Import.swift:1047-1355`), algoritmo completo e portabile:

1. `key4.db` › `metaData` riga `id = 'password'`: `item1` = global salt, `item2` = verifica.
2. Si sblocca `item2` con password **vuota**: deve iniziare con `password-check`. Se no, c'è una **password primaria**: errore `primaryPassword`, si dice all'utente di esportare il CSV (non si chiede mai la password).
3. `nssPrivate`: riga con `a102` = `F8 00..00 01` (16 byte), `a11` = chiave avvolta, sbloccata allo stesso modo.
4. Sblocco: PBES2 (OID `1.2.840.113549.1.5.13`): PBKDF2-HMAC-SHA256 sulla SHA-256 di `globalSalt + password`, sale e giri dal DER (massimo 10.000.000), AES-256-CBC con IV = `04 0E` + 14 byte. Oppure il vecchio PBE-SHA1-3DES (OID `1.2.840.113549.1.12.5.1.3`).
5. `logins.json` › `logins[]`: `hostname`, `encryptedUsername`, `encryptedPassword`, base64 di DER (id chiave, algoritmo + IV, testo cifrato). OID `2.16.840.1.101.3.4.1.42` = AES-256-CBC (IV 14 byte da completare con `04 0E`), altrimenti 3DES-CBC.
6. `disabledHosts` diventano siti "never". `used` non è letto (nil).

**Schede aperte** (`ImportGeckoTabs.swift`, `ImportZen.swift:407-435`): il session store più recente tra `sessionstore-backups/recovery.jsonlz4`, `sessionstore.jsonlz4`, `sessionstore-backups/recovery.baklz4`. Formato `mozLz40\0` + dimensione 4 byte LE + blocco LZ4 raw (massimo 160 MB scompattato). Finestre normali (non popup, non private, non `isTaskbarTab`); scheda = voce `index` di `entries`; gruppi da `groups[]` (esclusi `splitView`); pin come pin. Per Zen i pin restano fuori (arrivano con gli spazi); esclusi `zenIsGlance`, `zenIsEmpty`.

### 1.6 Zen

`ImportZen.swift`. Tre formati storici, letti in ordine:

1. Dalla 1.18 (dicembre 2025): `zen-sessions.jsonlz4` nel profilo, poi `zen-sessions-backup/clean.jsonlz4`, `recovery.baklz4`, e i 5 backup datati più recenti.
2. Prima: tabelle `zen_workspaces` e `zen_pins` in `places.sqlite` (colonne lette per nome).
3. Ancora prima: finestra del session store + `zen-workspaces.json`.

Spazi (`spaces[]`: `uuid`, `name`, `icon` emoji o `.svg`, `theme.gradientColors`, `rotation`, `texture`) diventano spazi con colore più vicino (blu, verde, arancio, rosso, viola) e **gradiente** fino a `SpaceGradient.most` colori. Pin = schede `pinned` con `zenWorkspace`; cartelle (`folders[]`, escluse quelle split e le live folder); **Essentials** (`zenEssential`) diventano pin di ogni spazio. Pagina del pin: quella iniziale (`_zenPinnedInitialState`), titolo `zenStaticLabel`. Limiti: 200 spazi, 5000 pin, profondità 64.

### 1.7 Safari e Orion

- **Safari diretto** (`ImportWebKit.swift:196-281`): `~/Library/Safari/Bookmarks.plist` (`WebBookmarkTypeList` / `WebBookmarkTypeLeaf`; `BookmarksBar` in cima, `BookmarksMenu` diventa `Bookmarks Menu`, `com.apple.ReadingList` diventa `Reading List`) e `History.db` (`history_items` JOIN `history_visits`, secondi dal 2001). Solo se il file si apre: altrimenti Safari non compare e il pannello spiega l'export.
- **Orion**: `~/Library/Application Support/Orion/<profilo>/favourites.plist` (dizionario piatto con `parentId`, `type`, `index`) e `history` (SQLite `history_items`, data in secondi dal 2001 o testo ISO). Nomi profili da `Orion/profiles`. Cartelle `bk_*` escluse.

### 1.8 File esportati

`ImportFile.swift`, `BookmarksFile.swift`, `Vault.take(csv:)`. Un solo selettore (`Browser.importFile`, `Browser.swift:1706`):

- Prompt `Bring In`, messaggio `A file another browser exported: bookmarks (.html), passwords (.csv), or Safari's File › Export Browsing Data (.zip).`
- Tipi: `.html`, `.csv`, `.txt`, `.zip`, `.json`, e cartelle.
- Una cartella viene letta al primo livello e nelle sottocartelle dirette (non oltre); file `html`, `htm`, `csv`, `json`; ordinati per percorso; un file rotto non blocca gli altri.
- **ZIP** scompattato con `/usr/bin/ditto -x -k` in cartella temporanea (su Windows serve una libreria zip).
- **HTML** (formato Netscape): regex su `<H3>`, `<A HREF>`, `<DL>`; `PERSONAL_TOOLBAR_FOLDER="true"` porta in cima il contenuto della barra; entità HTML decodificate; profondità 64.
- **CSV password**: colonna URL tra `url`, `login_uri`, `website`, `site`; utente tra `username`, `login_username`, `user`, `email`; password tra `password`, `login_password` (intestazione in minuscolo). Campi tra virgolette, virgolette doppie, a capo dentro i campi. Righe senza host o password: `skipped`.
- **JSON**: solo la cronologia dell'export di Safari (`metadata.data_type == "history"`, voci `url`, `title`, `time_usec`, `visits_count`; esclusi redirect intermedi `destination_url` e caricamenti falliti). La presenza di questo file marca l'export come **Safari**.
- Avanzamento (al massimo 10 aggiornamenti al secondo) e annullamento: `Reading…`, `Merging bookmarks…`, `Adding history…`, `Saving passwords…`, `Cancelling…`.
- Esito, in una riga (`Browser.swift:1818-1835`): `N bookmarks` o `N new bookmarks, M already here`, `N places`, `N passwords` o `N passwords, M skipped`, separati da ` · `. Varianti: `Import cancelled; nothing was changed`, `Import cancelled after merging bookmarks`, `Import cancelled after …`, `That file couldn't be read`, `Import stopped after …`, `Bookmark folders imported`, `Nothing to bring in from that file`, `An import is already running`. Dopo un export Safari con password si aggiunge ` \u2014 the exported file holds your passwords in the clear: delete it now`.
- Il nome "browser" registrato è `Safari` per l'export Safari, altrimenti il nome del file senza estensione.

### 1.9 Cosa Search **non** importa

| Dato | Stato sul Mac | Note |
|---|---|---|
| Cookie, sessioni, "login" attivi | **mai** | README e SYNC.md: sign-in e cookie non lasciano mai il browser. La ROADMAP (`ROADMAP.md:242`) dice che "importing is the way in" per account e sync, intendendo password. |
| Moduli, indirizzi, carte (Chromium `Web Data`, Firefox `formhistory.sqlite`) | no | I dati personali vengono solo dalla scheda "Io" di Contatti (2.9). |
| Motori di ricerca, parole chiave | no | |
| Impostazioni, temi | no | La ROADMAP prevede un export/import impostazioni proprio (`ROADMAP.md:134`). |
| Schede chiuse di recente, gruppi salvati | no | |
| Download, permessi dei siti | no | |
| Password di Safari, Orion, Yandex, Atlas, ego lite | no | Safari: via CSV dall'app Passwords o ZIP di export. |
| Spazi/pin di Dia | no | In ROADMAP (`ROADMAP.md:151`). |

### 1.10 Dove finisce ogni cosa

- **Segnalibri** (`Bookmarks.takeNoting`, `Bookmarks.swift:395-419`; `takeFile` per i file, `:423`): se Search non ha segnalibri, quelli arrivati diventano la radice e il nome del browser viene salvato in `bookmarks.top`. Se il browser è quello di `bookmarks.top`, o almeno metà dei suoi URL è già in cima, si fondono in cima; altrimenti in una **cartella col nome del browser** (`Chrome`, `Firefox`...). Fusione livello per livello: cartella con lo stesso titolo = ci si entra; pagina con lo stesso URL allo stesso livello = `already`. Poi le icone dal browser di origine. Annuncio (`Browser.swift:300-306`): `\(count) bookmarks from \(name)`, `\(count) new bookmarks from \(name), \(already) already here`, `The bookmarks from \(name) were all here already`, `No bookmarks in \(name)`, `Couldn't read all of \(name)'s bookmarks: what came from it before was kept`.
- **Cronologia** (`History.take`, `History.swift:400-419`): per ogni posto si tiene il **massimo** dei conteggi (non la somma, così reimportare non raddoppia), la data più recente, il titolo solo se mancante. Va nella cronologia del **profilo** (`Profiles.history(profileID)`), non in quella di uno spazio separato. Attenzione: il file di cronologia di Search tiene comunque solo i **2000** posti con punteggio più alto (3.5).
- **Password**: `Vault.save` per ciascuna (aggiorna se esiste, quindi reimportare non duplica), poi i siti "never" vengono aggiunti a `passwords.never`. Le password **non vengono mai tolte** da un import (`ImportPanel.swift:358`).
- **Schede aperte** (`Browser.takeSession`, `Browser.swift:3976-4027`): pin come pin dello spazio corrente, il resto **addormentate in fondo allo spazio corrente**, gruppi creati o riusati per nome, chiusi come erano; niente doppioni.
- **Spazi e pin**: 1.4.
- **Estensioni**: installazione dal Web Store, una conferma ciascuna.

### 1.11 Come "ricorda cosa è arrivato da dove"

`ImportRecord` (`ImportRecord.swift`), in `UserDefaults` chiave `import.records`: dizionario JSON **nome del browser** (qualunque profilo) verso:

```
{ date, bookmarks, places, passwords, bookmarkIDs: [UUID], spaces?, pinned? }
```

- `note` somma ogni import al precedente e aggiorna la data.
- `bookmarkIDs` contiene ogni segnalibro e cartella aggiunti da quel browser: serve a **`Replace what came from X before`**, che toglie esattamente quelli (`Bookmarks.withdraw`, `Bookmarks.swift:482`: le cartelle importate restano se ci hai messo qualcosa di tuo) e poi importa da capo. Solo se **tutti** i profili si sono letti bene (bug #375: un file illeggibile non è un browser vuoto). Un import più vecchio del record non viene mai indovinato.
- `bookmarks.top` ricorda quale browser ha riempito la radice vuota (`Bookmarks.swift:571`).
- Il pannello mostra `brought <giorno mese>` nella riga del browser e una riga `Brought before` con il riepilogo.

### 1.12 Interfaccia e momenti in cui viene proposto

**Dove si apre il pannello** (pagina interna in una scheda, `InternalPage(.importing)`, titolo scheda `Bring Things Over`, icona `square.and.arrow.down`, `InternalPages.swift:59,72`):

- Menu **File › `Bring Things Over…`** (comando `file.import`, `App.swift:97`; anche nella barra comandi, `Shortcuts.swift:221`).
- **Settings › General › `Bring things over`** (`Bookmarks, history, passwords and extensions from another browser`; più: `From another browser on this Mac, or from a file it exported. Nothing leaves your Mac.`), pulsante `Bring Things Over…` (`Settings.swift:567`, `SettingsIndex.swift:126-129`).
- **Settings › Spaces & Pins › `Bring Arc's spaces and pins over`** (`Your spaces, pinned tabs and folders, read from Arc on this Mac`), pulsante `Bring Over…`, apre il pannello già su Arc; disattivato se Arc manca (`Arc isn't on this Mac. Bring Things Over can read an export`).
- Piede dei pannelli **Bookmarks** e **Passwords**: `Bring in from` + `Bring in…` + `File…`.
- **Settings › Extensions**: apre il pannello in modalità solo estensioni (attivo il primo browser che ne ha).
- **Benvenuto**, pagina 2 di 5 (vedi sotto).

**Il pannello** (`ImportPanel.swift`), lastra `Bring things over`, larghezza 580, scorre se non entra:

- Riga fissa: `Nothing in the other browser changes. Passwords go into your keychain.`
- Mentre cerca: `Looking on this Mac…`. Nessun browser: `No other browser found on this Mac.` oppure `Choose a browser's data folder below to allow Search to read it.`
- Didascalia `On this Mac`, poi una riga per browser con pallino di scelta: nome; dettaglio (`Counting…`, poi per esempio `2 profiles · 312 bookmarks · 3,000 places · 58 passwords · 14 open tabs · 3 spaces · brought 27 Sep`, oppure `Nothing to bring in`); riga `canBringLine`.
- Note sotto la lista:
  - Safari non leggibile: `Safari \u2014 macOS keeps its files from other apps, so it comes over from a file it exports.` con pulsante `How` / `Hide`, che mostra `In Safari, choose File › Export Browsing Data to File…, keep Bookmarks, History and Passwords, and save. Then press File… below and choose the ZIP it made.`
  - Browser illeggibili: il messaggio di 1.1 punto 6 + `Choose folder…` (pannello di sistema con messaggio `Choose \(source.name)'s browser data folder`, pulsante `Use Folder`; errore `No browser profile was found in \(path). Choose the folder that contains Default or Profile 1.`).
- Scheda opzioni del browser scelto, righe con interruttore (un tipo assente è spento e grigio):
  - (se cartella scelta a mano) `From ~/…`
  - (se importato prima) `Brought before` › per esempio `312 bookmarks, 1,204 places and 58 passwords, 27 Sep`
  - (se più profili) `Profile` con menu: `Most recent: <nome>`, gli altri, separatore, `All profiles`
  - `Passwords`: `Not supported for \(name)` | `\(name) keeps them in the Passwords app: export them from there and bring in the CSV file` | `None in \(name)` | `macOS asks once for \(name)'s keychain key` (Chromium) | `Read from \(name)'s own files, unless it has a primary password` (Gecko). Predefinito acceso.
  - `Bookmarks`: `None in \(name)` | `In a “\(name)” folder, or at the top if you have none yet`. Acceso.
  - (se importato prima) `Replace what came from \(name) before`: `Its bookmarks from <giorno mese> go, and these come fresh; passwords only ever add` | `Nothing recorded from \(name) yet \u2014 only what is new comes`. Spento.
  - `History`: `None in \(name)` | `The last 3,000 places` (il numero contato). Acceso.
  - (non WebKit) `Open tabs & tab groups`: `None open in \(name)` | `They come with Arc's spaces; turn those off to bring its open tabs instead` | `<N> tabs in <M> groups \u2014 asleep at the end of this space, pinned tabs as pins` (Zen: `… \u2014 asleep at the end of this space; its pinned tabs come with its spaces`); oltre 300: `The first 300 of 1,234 tabs`. Spento.
  - (Arc, Zen) `Spaces and pinned tabs`: `3 spaces, 40 pinned \u2014 each a space here, the favourites as pins` (Zen: `Essentials`) + coda che dipende dalle preferenze: `, its pinned tabs asleep in it` | `, its pinned pages as rows under them, and the ones it filed in a folder as tabs in a group of that name` | `, its pinned pages as rows under them, in its folders as folders of rows`. Acceso.
  - (Arc/Zen con pin, righe fissate spente) `Keep them as pinned rows` › `As in \(name): each pinned page a row with its name, under your pins. Turned on, it stays in Settings › Spaces & Pins › Pinned rows` (+ `; rows show with the tabs down the side` se la barra è in alto), pulsante `Turn on pinned rows`.
  - (righe accese, cartelle spente) `Keep its folders as folders` › `As in \(name): each folder of pinned pages a folder of rows, nested as it was, rather than a tab group. Turned on, it stays in Settings › Spaces & Pins › Folders in pinned rows`, pulsante `Turn on folders`.
  - (estensioni nuove) `Extensions` › `\(n) found \u2014 installed fresh from the Chrome Web Store, you say yes to each one`. Spento (acceso solo in modalità estensioni).
- Piede: `Bring them in` (pieno; diventa `Bringing…` con anello), `File…` a destra. Dopo l'import: righe di esito con spunta o punto esclamativo, poi `Show bookmarks`, `Show the bookmarks bar` (solo se sono arrivati segnalibri e la barra è spenta), `Show passwords`.
- Righe di esito (`ImportPanel.swift:517-604`): `N passwords` + ` (N skipped: no address)` + ` \u2014 N couldn't be decrypted with \(name)'s key`; `macOS didn't hand over \(name)'s key \u2014 allow it and try again`; `\(name) has a primary password: export your passwords from it and bring in the CSV file`; `No passwords readable in \(name)`; `N bookmarks` / `N new bookmarks, M already here` / `No bookmarks in \(name)` / `Couldn't read all of \(name)'s bookmarks: what came from it before was kept, N new`; `N places`; `1 extension to confirm` / `N extensions to confirm`; `N new spaces, N pins, N pinned tabs` / `\(name)'s spaces and pins were all here already`; `N open tabs, N new groups, N pins` / `\(name)'s open tabs were all here already`.
- Offerta Arc dopo l'import: `Tabs on the left, pinned rows, and Arc's habits too?` + `Set Up Like Arc`, poi la riga di cosa ha acceso + `Undo`.

**Benvenuto** (`Welcome.swift`), 5 pagine: 0 presentazione con interruttori Sync e Handoff, **1 "Bring things over."**, 2 layout, 3 browser predefinito, 4 consigli.

- Titolo `Bring things over.`, sottotitolo `Passwords go into your keychain, bookmarks into the menu, and history means the address field already knows where you go. Nothing in the other browser changes.`
- Più browser: controllo segmentato; uno solo: `From \(name)`. Riga `\(name) can bring: bookmarks, history, passwords and open tabs` (minuscolo).
- Scelte: `Passwords` (`macOS will ask once for that browser's keychain key`) oppure il testo `\(name) keeps passwords in the Passwords app: export them there, then bring in the file below.` / `Passwords from \(name) aren't supported yet.`; `Bookmarks` (`Folders and all, behind the bookmark button`); `History` (`The last few thousand places, for finishing addresses`).
- Pulsante `Bring them in` / `Bringing…`, esito in riga: `N passwords · N bookmarks · N places`, oppure `passwords: macOS didn't hand over the key \u2014 allow it and try again`, `passwords: \(name) has a primary password \u2014 export them from it and bring in the CSV`, `passwords: nothing readable`.
- Nessun browser: `No other browser found on this Mac \u2014 nothing to bring.`
- Sempre: `From a file another browser exported…`.
- Il benvenuto usa sempre il profilo più recente; spazi e schede aperte solo nel pannello completo.

### 1.13 Porting dell'import su Windows

**Percorsi**: tabella finale (sezione 8). I formati dei file Chromium (`Bookmarks`, `History`, `Favicons`, `Preferences`, `Sessions`, `Local State`) e Gecko sono **gli stessi** su Windows; il codice di lettura si porta 1:1 (SQLite via `better-sqlite3` o simile, LZ4 block per i `.jsonlz4`, zip via libreria). Date: identiche (Chromium 1601, Firefox 1970).

**Password Chromium su Windows: è tutto diverso.**

1. `Local State` › `os_crypt.encrypted_key` = base64 di `"DPAPI"` + blob DPAPI. Si toglie il prefisso di 5 byte e si chiama `CryptUnprotectData` come utente corrente: esce una chiave **AES-256** di 32 byte. **Nessun prompt**: qualsiasi processo dell'utente può farlo (verificato, schema noto e documentato da terzi; Electron `safeStorage` **non** basta, perché decifra solo i propri dati: serve un addon nativo per `CryptUnprotectData`).
2. `password_value` = `v10` (o `v11`) + nonce 12 byte + testo cifrato + tag 16 byte, **AES-256-GCM**. Valori senza prefisso (Chrome prima della 80) = blob DPAPI diretto.
3. **`v20` = App-Bound Encryption** (Chrome 127+, luglio 2024, inizialmente per i cookie; Google ha annunciato l'estensione a password e dati di pagamento). La chiave è in `os_crypt.app_bound_encrypted_key` e si apre solo tramite il servizio di elevazione di Chrome (COM `IElevator`, da Chrome 144 `IElevator2`), che verifica che a chiedere sia l'eseguibile di Chrome stesso. Secondo fonti terze recenti, in Chrome, Edge e Brave **password, cookie, metodi di pagamento e IBAN** sono oggi `v20`. Gli unici modi per aprirli sono iniezione di codice nel processo del browser o tecniche da infostealer: **da escludere**. Verificato (Google, sorgente Chromium) per il meccanismo; fonte terza per l'estensione alle password.
4. Conseguenza pratica per Search Windows:
   - **Chrome, Edge, Brave** (versioni recenti): password **solo via CSV** (`chrome://password-manager/settings` › Export passwords; Edge `edge://settings/passwords`; Brave `brave://password-manager/settings`). Il pannello deve dirlo chiaramente al posto di `macOS asks once…`. Le righe `v10` eventualmente rimaste si possono leggere: conviene contare in anteprima quante sono `v10` e quante `v20`.
   - **Opera, Opera GX, Vivaldi, Yandex, Arc Windows**: probabilmente ancora `v10` con DPAPI, quindi leggibili senza prompt (**dedotto**: lo strumento terzo di riferimento elenca solo Chrome, Edge, Brave, Avast tra i browser con ABE; da provare per ciascuno).
   - **Firefox e derivati**: algoritmo NSS identico al Mac, nessuna dipendenza da Windows. Verificare che il `crypto` di Electron (BoringSSL) offra `des-ede3-cbc` per i profili vecchi.
5. **Nessun prompt di sistema** su Windows per i `v10`: oggi il prompt del portachiavi è la "barriera di consenso" del Mac. Su Windows va sostituita da una conferma esplicita nell'app (il clic su `Bring them in` già lo è) e da un testo onesto.
6. **Antivirus ed EDR**: un processo che legge `Login Data` e `Local State` di altri browser e chiama `CryptUnprotectData` è esattamente il comportamento che Defender e gli EDR cercano negli infostealer (**dedotto**, rischio concreto). Servono: binario firmato (Authenticode, possibilmente EV), lettura solo dopo il clic, nessun accesso in background, nessuna rete durante l'import, test con Defender attivo.
7. **File bloccati**: su Windows Chrome può tenere aperti i suoi SQLite con condivisione limitata; la copia con `-wal` può fallire mentre il browser è aperto (**dedotto**; noto per `Network\Cookies`). Prevedere il messaggio "chiudi \(name) e riprova".
8. **Profili Windows**: Opera recente usa `Opera Stable\Default` e profili laterali in `Opera Stable\_side_profiles\<id>` (fonte terza, forum Opera). La ricerca dei profili deve scendere anche lì.

**Cookie e sessioni ("accessi") su Windows**: oggi Search non li importa e su Windows la cosa è ancora più difficile:

- Chrome, Edge, Brave: cookie `v20` (App-Bound), non leggibili in modo legittimo.
- Firefox: `cookies.sqlite` › `moz_cookies` è **in chiaro**; importabile in una sessione Electron con `session.cookies.set`.
- Opera, Vivaldi: `Network\Cookies` probabilmente `v10` (dedotto).
- Anche quando leggibili, molte sessioni non sopravvivono al trasloco (cambio di user agent e impronta, cookie legati al dispositivo come le Device Bound Session Credentials di Google, **dedotto**).
- Proposta: P2 opzionale "Bring sign-ins from Firefox" con avviso, mai per i browser ABE; la strada principale per "rientrare" resta l'import delle password più il riempimento.

**Testi da adattare** (non possono restare identici): ogni frase con `macOS`, `keychain`, `Touch ID`, `Finder`, `Passwords app`, `Contacts`, `this Mac`. Esempi: `Passwords go into your keychain.`, `macOS asks once for \(name)'s keychain key`, `macOS didn't hand over \(name)'s key \u2014 allow it and try again`, `Looking on this Mac…`, `On this Mac`, `No other browser found on this Mac.`. Proposta: mantenere struttura e tono, sostituire con `this PC`, `Windows`, `Windows Hello`, e per gli ABE una riga tipo `\(name) locks its passwords to itself: export them from it and bring in the CSV file` (da approvare).

---

## 2. PASSWORD

### 2.1 Il deposito (Vault)

`Vault.swift`. Le password stanno nel **portachiavi di login di macOS** come `kSecClassInternetPassword`:

| Attributo | Valore |
|---|---|
| `kSecAttrServer` | host normalizzato (minuscolo, senza `www.`) |
| `kSecAttrAccount` | nome utente (può mancare: account senza nome) |
| `kSecAttrLabel` | `Search` (in test `Search (<mondo>)`) |
| `kSecAttrAuthenticationType` | `HTMLForm` |
| `kSecAttrProtocol` | `HTTPS`, oppure `HTTP` se salvata da una pagina in chiaro (`clear`) |
| `kSecAttrComment` | ultimo uso, secondi dal 1970 come stringa |
| `kSecAttrAccessible` | `WhenUnlocked` |

Principi (`Vault.swift:46-182`):

- **Liste senza segreti** (`Kept`): il pannello e la lista sotto il campo leggono solo attributi; il segreto si legge con una chiamata separata solo per l'account scelto (mostra, copia, riempi). Tipi diversi (`Kept` senza password, `Login` con password) impediscono di passare per errore un segreto.
- Identità solo con etichetta `Search`, così non tocca le voci di altre app (per esempio il token di git per github.com).
- `save` prima prova `SecItemUpdate`, poi `SecItemAdd`: reimportare aggiorna, non duplica.
- `touch` aggiorna l'ultimo uso a ogni riempimento: le liste mostrano prima i più recenti.
- `kept(matching:wide:)`: prima l'host esatto, poi (se `wide`) gli altri host dello stesso **dominio registrabile** (Public Suffix List, `Vault.registrable`, `Vault.swift:373`), ciascun gruppo dal più recente.
- Le build firmate da altri vedono le voci ma macOS chiede la password di login per ogni lettura: per questo le liste non leggono segreti.
- I profili di Search **condividono** le password (come Safari).

### 2.2 Il pannello Passwords

`Passwords.swift`, scheda interna `Passwords` (icona `key`), scorciatoia `⌥⌘L`, lastra larga 620:

- Ricerca `Search sites and accounts` (cerca in host e utente); pulsante `Add` / `Cancel`.
- Modulo aggiunta: `Site`, `Username`, `Password` (campo segreto), `Save` (attivo solo con host valido e password). Annuncio `Kept for \(host)` o `The keychain refused it`.
- Vuoto: `Nothing kept yet. Sign in somewhere and say yes, or bring yours in below.`; ricerca senza esito: `Nothing matches.`
- Una riga per sito (icona o lettera, host, `N accounts` oppure il nome utente), si apre con freccia. Per account: utente (`No username` se vuoto, selezionabile), **sempre 10 pallini** (la lunghezza non trapela), al passaggio `Show`/`Hide`, `Copy`, `Remove` (rosso).
- `Show`: prova d'identità (`Vault.prove("show the password for \(host)")`), poi segreto visibile **15 secondi**, dimenticato quando la riga sparisce.
- `Copy`: prova, poi negli appunti **solo di questo Mac**, marcato `org.nspasteboard.ConcealedType` e `TransientType` (i gestori di appunti lo ignorano), cancellato dopo **90 secondi** se nessuno ha copiato altro. Annuncio `Password copied`.
- `Remove` singolo: **immediato, senza conferma né prova**.
- Piede: `Bring in from` `Bring in…` `File…`, `Remove All…` (o `Remove N…` se la ricerca filtra: toglie solo quelle visibili), conteggio `N passwords`; nota `macOS asks once for that browser's keychain key. Nothing is changed there; everything lands in your own keychain, under Search.`
- `Remove All…`: dialogo `Remove N Passwords?` / `Remove 1 Password?`, dettaglio `They're taken out of your keychain. Only the passwords Search keeps are removed: password managers, other apps and other browsers keep theirs. This can't be undone.`, pulsante `Remove`, Invio = Annulla; poi prova d'identità, cancellazione fuori dal thread principale, esito `Removed N passwords` / `The keychain refused them` / `Removed N of M passwords` (`Browser.swift:1591-1622`).

### 2.3 Quando propone di salvare

Catena (`Forms.swift` lato pagina, `Tab.swift:1338-1425`, `Browser.swift:7606-7632`):

1. Lo script di pagina segna come "toccate" solo le caselle password in cui si è **digitato, incollato o riempito** (eventi `input`/`change`); una password messa dalla pagina da sola non è mai offerta.
2. Invia `submit` (utente + password) su: evento `submit`; `Enter` in nome o password; **clic su un pulsante** (`button`, `input[type=submit]`, `[role=button]`, con `setTimeout 0`); `form.submit()` intercettato dal lato nativo (`formSent`). Se l'ultima casella digitata non è quella scelta, si usa la coppia di quella (evita di salvare il modulo di registrazione sopra).
3. Accesso in due passi (Google, Microsoft, Okta, impots.gouv.fr): la pagina col solo nome invia `name`; il nome è tenuto **in memoria, 5 minuti, solo per la stessa scheda e lo stesso dominio registrabile**, e completa la password della pagina dopo.
4. Il lato nativo **trattiene** la coppia con l'host del momento dell'invio (senza `www.`), per 45 secondi.
5. **Successo** = nuovo documento caricato (giudicato subito) oppure caselle sparite senza navigazione (`settled`, controllo dopo 250 ms di quiete + 400 ms, poi attesa di 1,5 s). Se la casella password c'è ancora: accesso rifiutato o secondo passo, si continua ad aspettare.
6. Condizioni per offrire: `Offer to save passwords` acceso; password non vuota; **non in scheda privata**; non in una scheda di un agente; sito non in "never" (host o dominio registrabile); non una pagina di estensione; nessuna estensione ha chiesto di salvare lei (`privacy.services.passwordSavingEnabled = false`, per esempio 1Password); non appena riempita da Apple Passwords con gli stessi valori.
7. Stesso utente e stessa password già salvati: nessuna domanda, solo `touch` (e il flag `clear` aggiornato). Stesso utente, password diversa: domanda di **aggiornamento**.

Il fumetto (`PageQuestions.swift:127-180`, anche nelle finestre popup):

- `Save the password for \(user) on \(host)?` | `Save this password for \(host)?` (senza utente) | `Update the password for \(user) on \(host)?`
- Pulsanti `Save` / `Update` (pieno), `Not now`, `Never here` (solo per un salvataggio nuovo).
- Esiti: `Password saved for \(host)`, `Password updated for \(host)`, `Never for \(host)`, `The keychain refused it`.

### 2.4 Riempimento

Lo script (`FormRelay.script`, `Forms.swift:224-1206`) gira in un mondo JavaScript separato dalla pagina, nella pagina principale e solo nei frame **della stessa origine** lungo tutta la catena. Dice al lato nativo dove sta il cursore (`focus` con rettangolo) e cosa è la casella:

- **Coppia nome + password** (`pair`): la casella password vicina al cursore (stesso modulo, la prima dopo), visibile e mascherata; il nome è l'ultima casella testo/email/tel prima, visibile, non una ricerca, un codice, un titolo, un messaggio (regex multilingua `aside`, `foreign`, `who`).
- **Primo passo** (`firstStep`): casella che dichiara nome/email/telefono, quasi sola nel suo modulo, con un pulsante; `wide` se la pagina sembra un accesso (host `login.`, `accounts.`..., percorso `/signin`..., pulsante `Next`, `Sign in`, `Continuer`, `Avanti`, `Accedi`... in più lingue), altrimenti solo gli account di **questo** host.
- Nuove password (`autocomplete=new-password`) mai offerte.
- Caselle nascoste, trasparenti, tagliate o fuori pagina ignorate (trappole per robot).
- Codici di verifica (`one-time-code`, righe di caselle da un carattere, parole come `otp`, `2fa`, `verification code`) solo per Apple Passwords.
- Contatti (2.9) se attivi.

La lista sotto la casella (`Browser.hang`, `Browser.swift:1050-1157`; vista `AccountList`, `Accounts.swift`):

- Ordine: passkey della pagina, poi fino a **5** account propri (prima quello del nome dato al passo precedente), poi fino a 5 di Apple Passwords (senza doppioni), `Connect Apple Passwords…`, `Use your Apple passwords?`, oppure le righe della scheda contatti.
- Pagina in **http**: offerti solo account salvati da http (`clear`), mai quelli https dello stesso nome.
- Un clic nei primi **0,5 secondi** dalla comparsa è ignorato (la pagina può mettere il cursore in una casella invisibile sotto il puntatore).
- `↓`/`↑` illuminano una riga, `Invio` la prende; senza riga illuminata Invio resta della pagina.
- Si sposta con lo scorrimento, va sotto o sopra la casella secondo lo spazio, scorre con molti account; sparisce 0,2 s dopo che il cursore esce.
- Righe: lettera + nome (`No name` se vuoto) + host; `Passkey · <provider>`; `Apple Passwords`; `Verification code · Apple Passwords`; `Connect Apple Passwords…` / `Pair once with a code from your Mac`; contatto (`Fills the form. Shift-click fills only this box.`). Separatore `Other accounts on \(dominio)`.
- Piede: `From your keychain` | `From your keychain and Apple Passwords` | `From Apple Passwords` | `Passkeys on this Mac` | `From your card in Contacts`.
- **Mai riempimento automatico** al caricamento: solo dopo una scelta.

Il riempimento (`Browser.choose(_ login: Kept)`, `Browser.swift:1433-1481`; `Tab.fill`, `Tab.swift:1435-1465`):

- Controlla che la scheda sia ancora sullo stesso host e schema; con primo passo mette **solo il nome**.
- Valori passati come argomenti allo script, mai scritti nel sorgente; lo script verifica che `location.origin` sia ancora quello (porta inclusa).
- Usa il **setter nativo** di `value` e lancia `input` e `change` (altrimenti React e simili non vedono il valore); il nome solo se la casella è vuota.
- Frame della stessa origine con il cursore: il riempimento va a quel frame; cursore in un frame di altra origine: **niente** da nessuna parte.
- Errore: `Couldn't find the sign-in fields anymore`.

### 2.5 Touch ID prima di riempire, mostra, copia

- `Vault.prove` (`Vault.swift:253-281`): `LAContext.deviceOwnerAuthentication` = Touch ID, Apple Watch o password del Mac. Se il Mac non può chiedere: si passa **solo** se non c'è nessuna password impostata (`passcodeNotSet`); ogni altro errore è un no.
- `Ask for Touch ID before filling` (spento di default, `Vault.FillProof`, `Vault.swift:304-367`): prima di riempire una password **propria** chiede la prova, con motivo `fill your password for \(host)`. Il segreto non viene letto finché non si dice sì. Un sì vale **60 secondi** per quel dominio registrabile, separatamente per schede private e normali; scade prima con schermo spento, sospensione, sessione utente cambiata, blocco schermo (`com.apple.screenIsLocked`). Una seconda scelta mentre la domanda è aperta non riempie nulla. Apple Passwords ed estensioni gestiscono la loro prova.

### 2.6 Siti "never"

`UserDefaults` chiave `passwords.never`, array ordinato di host. Un sito è "never" se lo è l'host o il dominio registrabile. Riempito da `Never here` e dagli import (`blacklisted_by_user` di Chromium, `disabledHosts` di Firefox). In Settings, sotto `Offer passkeys` (se non vuoto): `Sites never asked` · `N sites told to stop offering` · `Forget` (`Every site can ask again`).

### 2.7 Passkey

`Passkeys.swift`, `Forms.swift:111-222`, `Prefs.swift:595-613`.

- Richiede l'entitlement Apple `com.apple.developer.web-browser.public-key-credential` (build ufficiali). Senza: `Needs an Apple entitlement this build doesn't have`.
- Search **esegue la cerimonia da sé** invece di lasciarla a WebKit (un'operazione lasciata aperta dall'agente di sistema bloccava tutte le passkey fino al riavvio): prende la richiesta dalla pagina, la verifica contro l'origine reale del frame, scrive lei il client data e la passa ad `ASAuthorizationWebBrowserPublicKeyCredentialManager`. Supporta iCloud Keychain, app di password, iPhone via QR, chiavi di sicurezza, estensione **PRF** (risultati sigillati per la pagina con ECDH P-256 + HKDF + AES-GCM).
- **Mediazione condizionale** (passkey sotto il campo nome): la richiesta resta in attesa, il Mac viene interrogato solo su quali passkey ha per il sito (senza foglio), che compaiono nella lista sotto il campo; scelta = foglio di sistema per quella sola passkey.
- Prima cerimonia: macOS chiede una volta il permesso (System Settings › Privacy & Security › Passkeys); negato: `macOS was told no: System Settings › Privacy & Security › Passkeys`.
- `Offer passkeys` spento: lo script `withoutPasskeys` lascia l'oggetto `PublicKeyCredential` ma dice che non ci sono passkey (`isConditionalMediationAvailable` e `isUserVerifyingPlatformAuthenticatorAvailable` false, capacità a false, `get`/`create` rifiutati subito con `NotAllowedError`), così i siti passano alla password. Eccezioni: estensioni che gestiscono le passkey (1Password) e richieste per **chiave di sicurezza** USB/NFC/BLE.

### 2.8 Apple Passwords (non ufficiale)

`ApplePasswords*.swift`. Search avvia l'helper di Apple per l'estensione Chrome (`PasswordManagerBrowserExtensionHelper.app` sul volume di sistema, verificato firmato Apple) e si presenta come l'estensione iCloud Passwords (`chrome-extension://pejdijmoenmkgeppbflobdenhhabjlaj/`). Abbinamento SRP-6a (gruppo RFC 5054 3072 bit, SHA-256) con codice a 6 cifre mostrato dal Mac, poi messaggi AES-GCM; chiave **solo in memoria**, nuovo codice a ogni avvio. Comandi: `hello` 14, `handshake` 2, `loginNames` 4, `password` 5, `tabEvent` 8 (tenuta in vita ogni 240 s), `codes` 16, `codeFilled` 17. Solo https, mai schede private, mai frame, solo per l'host della pagina. Offerta discreta `Use your Apple passwords?` sotto il campo: solo dove Search non ha account propri, una volta per sito, mai più dopo 2 offerte ignorate o la ✕ (`passwords.apple.offered`, `passwords.apple.offer.unanswered`, `passwords.apple.offer.never`).

### 2.9 Dati di contatto

`MeCard.swift`. Interruttore `Fill in your contact details` (spento): legge **solo la scheda "Io"** di Contatti (con permesso macOS), mai scritta da nessuna parte. Sotto caselle nome, email, telefono, indirizzo (per `autocomplete` o per parole del nome/etichetta, in più lingue) compaiono fino a 4 righe (una per email, numero o indirizzo). Un clic riempie la casella e le **altre caselle vuote e visibili** dello stesso modulo e dello stesso indirizzo (spedizione o fatturazione), con un lampo nel colore d'accento; Maiusc-clic solo quella casella. Errori: `Search may not read Contacts: System Settings › Privacy & Security › Contacts`, `No card of yours in Contacts: pick yours there, then Card › Make This My Card`.

### 2.10 Impostazioni › Passwords (testi e default)

`SettingsIndex.swift:542-565`, `Prefs.swift:1361-1366`.

| Riga | Titolo | Dettaglio | Chiave | Default |
|---|---|---|---|---|
| `passwords.open` | `Your passwords` | `In the macOS keychain, shown with Touch ID` | pulsante `Open…` | |
| `passwords.save` | `Offer to save passwords` | `Asked once per site, never again for a site you refuse` (oppure `\(ext) does the saving; it asked Search not to offer`) | `passwords.save` | acceso |
| `passwords.fill` | `Fill in sign-ins` | `Click a sign-in box and your accounts for the site hang from it` | `passwords.fill` | acceso |
| `passwords.fill.prove` | `Ask for Touch ID before filling` | `Or your Mac's password, before a saved password goes into a page`; più: `Once you've said yes, Search doesn't ask again for a minute, until your Mac sleeps or locks. Apple Passwords and extensions ask in their own way.` | `passwords.fill.prove` | spento |
| `passkeys` | `Offer passkeys` | `Touch ID or an iCloud passkey, on sites that offer one` | `passkeys` | = entitlement |
| `passwords.apple` | `Passwords from Apple's Passwords app` | `Your Passwords app's accounts and verification codes under their box. Unofficial` | `passwords.apple` | spento |
| `contacts.fill` | `Fill in your contact details` | `Your card in Contacts under name, email, phone and address boxes` | `contacts.fill` | spento |

### 2.11 Cosa usare su Windows

**Deposito delle password**: due strade, consiglio la prima.

1. **Deposito proprio cifrato con DPAPI** (come fa Chrome): file SQLite o JSON (`vault.db`) con una riga per account (host, user, used, clear, ciphertext), ogni password AES-256-GCM con una chiave casuale protetta da DPAPI tramite Electron `safeStorage` (su Windows usa DPAPI, verificato). Pro: liste senza leggere segreti (stesso principio del Mac), metadati liberi, veloce con centinaia di voci. Contro: DPAPI protegge dall'esterno dell'account, **non** da altri processi dello stesso utente (sul Mac il portachiavi ha un controllo per app firmata, su Windows no).
2. **Credential Manager** (`CredWrite`/`CredEnumerate`, tipo `CRED_TYPE_GENERIC`, target per esempio `Search/<host>/<user>`). Pro: deposito di sistema, visibile in Pannello di controllo come il Portachiavi. Contro: blob massimo 2560 byte, `CredEnumerate` restituisce anche i segreti, stessa debolezza verso processi dello stesso utente.

**Prova d'identità** (equivalente di `Vault.prove` e `FillProof`): **Windows Hello** con `UserConsentVerifier` (per app desktop `IUserConsentVerifierInterop::RequestVerificationForWindowAsync(hwnd)`, così il dialogo sta sopra la finestra; serve un addon nativo). Se Hello non è configurato: chiedere la password di Windows con `CredUIPromptForWindowsCredentials` e verificarla, come fa Chrome su Windows (dedotto dal comportamento di Chrome). Grazia di 60 s per dominio e per privato/normale; azzerare con `powerMonitor` eventi `lock-screen` e `suspend` (verificato: Electron li espone su Windows). La regola "nessuna password impostata = si passa" va mantenuta.

**Appunti**: equivalente di `ConcealedType`/`TransientType` sono i formati Windows `ExcludeClipboardContentFromMonitorProcessing`, `CanIncludeInClipboardHistory` = 0 e `CanUploadToCloudClipboard` = 0 (escludono cronologia appunti e appunti cloud). Cancellazione dopo 90 s se `clipboard` non è cambiato. Probabile addon nativo per scrivere più formati insieme (**dedotto**).

**Script dei moduli**: si porta quasi identico (è JavaScript). In Electron: preload in mondo isolato (`contextIsolation`), messaggi via `ipcRenderer` al posto di `window.webkit.messageHandlers.officeForms`, `nodeIntegrationInSubFrames` per i frame, ripetendo nello script il controllo della catena di origini; `executeJavaScriptInIsolatedWorld` per `fill`, `name`, `code`, `hasPassword`. Le 35 pagine di `Tests/FieldFixtures` e `FormFieldCorpusTests` sono riusabili come test.

**Dominio registrabile**: libreria con Public Suffix List (per esempio `tldts`), al posto di `Registrable.swift`.

**Passkey**: in Electron il Chromium interno usa già `webauthn.dll` su Windows, quindi Windows Hello, chiavi di sicurezza e telefono via QR funzionano per pagine https (fonte terza: documentazione Clerk e prove di sviluppatori; non c'è una pagina ufficiale Electron). Da verificare: la **mediazione condizionale** in Electron (manca l'interfaccia di autocompletamento di Chrome: rischio di richieste "appese", lo stesso problema che il Mac ha risolto). Opzioni: dire `false` a `isConditionalMediationAvailable`, oppure costruire la lista sotto il campo con `WebAuthNGetPlatformCredentialList` di `webauthn.dll` (Windows 11). `Offer passkeys` spento: iniettare lo stesso `withoutPasskeys`. Nessun entitlement Apple da gestire.

**Apple Passwords su Windows**: iCloud per Windows installa l'app iCloud Passwords e lo stesso tipo di estensione per Chrome/Edge con un host di native messaging (**dedotto**: protocollo probabilmente uguale, stesso id estensione, eseguibile e percorso da trovare nel registro `HKCU\Software\Google\Chrome\NativeMessagingHosts`). Electron non supporta il native messaging delle estensioni, quindi andrebbe reimplementato come sul Mac. P2.

**Contatti**: Windows non ha una scheda "Io". Proposta: una scheda `Your details` propria in Settings (P2), oppure leggere gli indirizzi da Chromium `Web Data` (tabelle indirizzi in chiaro, **dedotto**, schema da verificare per versione).

**Estensioni che salvano da sé**: mantenere il controllo su `privacy.services.passwordSavingEnabled` (dipende dal sistema estensioni, altro studio).

---

## 3. Segnalibri, barra, cronologia

### 3.1 Modello dei segnalibri

`Bookmarks.swift:11-48`:

```
Bookmark { id: UUID, title: String, url: String?, children: [Bookmark]? }   // url nil = cartella
```

- File `bookmarks.json` (profilo Personal) o `bookmarks-<uuid>.json` (altri profili), array JSON di radici, scritto in background con scrittura atomica (`Disk`, `Store.swift:186`), notifica `SearchBookmarksSaved` per la sync.
- File illeggibile: spostato in `bookmarks.unreadable-<timestamp>.json` (`Store.quarantine`), mai sovrascritto.
- Segnalibro senza nome: sulla barra mostra solo l'icona; la lista lo mostra con l'indirizzo.
- Ricerca: tutte le parole in titolo + URL, con il percorso delle cartelle (stessa regola di `chrome.bookmarks.search`).
- Nella barra indirizzi: i segnalibri del profilo sono suggerimenti di tipo `bookmark`.

### 3.2 Comportamenti

- `⇧⌘B` (`Browser.bookmarkCurrent`, `Browser.swift:250`): aggiunge in fondo, nella cartella scelta l'ultima volta (`lastFolder`), apre la scheda per rinominare e spostare; se già salvato apre la sua scheda. Con le schede nascoste: annuncio `Bookmarked`, `Bookmarked in \(folder)`, `Already a bookmark`.
- Un URL già presente non viene aggiunto due volte (`contains` su `absoluteString`).
- Spostare: trascinamento nell'albero o `Move to` (`Top Level`); una cartella non può entrare in se stessa.
- `Remove`: cartella con contenuto chiede `Remove “\(name)”?` con `The bookmark in it goes too.` / `The \(n) bookmarks in it go too.` / `The empty folders in it go too.`; il resto sparisce subito.
- `Rename…`: cartella (`Rename Folder`) e segnalibro (`Rename Bookmark`, `Without a name, the bookmarks bar shows its icon alone.`).
- `Edit Address…` (`Edit Address`, segnaposto `https://example.com`): indirizzo letto come la barra indirizzi; rifiutato: `Search can’t open “\(typed)” as a page. Cancel keeps the address the bookmark has.`
- `New Folder…` (`New Folder`, `Folder name`, `Make`).
- Pannello aperto su una radice fatta di una sola cartella (tipico dopo un import): la cartella è già aperta.
- API estensioni `chrome.bookmarks` servite dallo stesso modello (`insert`, `update`).

### 3.3 Pannello Bookmarks

Lastra `Bookmarks`, larga 600 (`Bookmarks.swift:1434`): ricerca `Search bookmarks` (Invio apre il primo), vuoto `Nothing kept yet. Add this page with ⇧⌘B, or bring yours in below.`, `Nothing matches.`, albero con trascinamento, risultati piatti con il percorso; piede `Bring in from` `Bring in…` `File…` · `New Folder…` · `N bookmarks`. Menu: `Open`, `Rename…`, `New Folder Inside…`, `Move to`, `Remove`, `Open All in New Tabs`, `Show in Folder`.

### 3.4 Barra dei segnalibri

`BookmarksBar.swift`. **Spenta di default** (`bookmarks.bar`): attivabile da Settings (`Show the bookmarks bar` · `Your bookmarks in a row above the page`), dal menu Bookmarks, o dall'offerta dopo un import. Alta 30 pt, le radici in fila; una cartella apre un menu; quello che non entra va in un `»` (`More Bookmarks`). Si nasconde con le schede (`⌘S`) e con un video a tutto schermo. Varianti: `Show the bookmarks bar in the sidebar` (`bookmarks.side`: righe in cima alla colonna in ogni spazio) e `Show icons only on the bookmarks bar` (`bookmarks.iconsOnly`; le cartelle tengono il nome). Menu della barra: `New Folder…`, `Show Icons Only`, `Show Bookmarks…`, `Hide Bookmarks Bar`. Menu di un segnalibro: `Open in New Tab`, `Open in New Window`, `Open in Split View`, `Open in Private Tab`, `Rename…`, `Edit Address…`, `Copy Link`, `Remove`; di una cartella: `Open All in New Tabs`, `Open All in New Window`, `Open All in Tab Group`.

### 3.5 Cronologia

`History.swift`.

- Voce su disco: `Visit { url, key, title, count, last }` (date con l'encoder JSON predefinito, secondi dal 2001). File `history.json` (Personal) o `history-<uuid>.json`.
- Chiave = identità URL: schema e host minuscoli, niente frammento, niente utente/password, percorso vuoto = `/` (`History.swift:213`). Un URL con credenziali viene **ripulito** prima di essere salvato e anche nei file vecchi.
- Solo http/https; mai schede private (gestito a monte), mai schede di test.
- Ogni pagina profonda conta anche come visita alla home del sito (la barra indirizzi così propone il sito, non l'articolo di settimana scorsa).
- **Limite 2000 posti** nel file, scelti per punteggio `count × e^(-giorni/30)`; in memoria fino a 2250, poi taglio che tiene comunque i 250 più recenti.
- Scritture raggruppate: al massimo una ogni 1,5 s, fuori dal thread principale; titoli che cambiano di continuo (contatori di posta) scritti alla visita successiva o all'uscita; scrittura forzata all'uscita (`flush`).
- 45 siti noti (`google.com`, `github.com`, `claude.ai`...) proposti il primo giorno, sotto qualsiasi visita reale.
- Cancellare la cronologia toglie anche gli indirizzi d'origine dei download (`Loot.forgetAddresses`) e le icone dei siti dimenticati.
- Pannello History (`Recall.swift`): `Everywhere you have been`, ricerca `Search everywhere you have been`, gruppi `Today`/`Yesterday`/data, `Remove`, `Clear…` con opzioni (`Cookies and sign-ins` · `Signs you out of every site` · `Sign out of everything`, `Cache` · `Only what was fetched to draw pages`...).

### 3.6 Profili e spazi (dove stanno i login)

- Profilo = insieme di spazi con **cookie, sessioni, cronologia e segnalibri propri** (`Profiles.swift:1-25`); Personal ha id fisso `00000000-0000-0000-0000-0000000000A1`. Password, impostazioni, estensioni, download e icone sono **condivisi**.
- Uno spazio può avere accessi propri (`sharesSignIns == false`): store WebKit separato (`WKWebsiteDataStore(forIdentifier:)`).
- Su Windows: partizioni di sessione Electron, per esempio `persist:profile-<uuid>` e `persist:space-<uuid>`; scheda privata = partizione senza `persist:`.

---

## 4. SYNC e Handoff

### 4.1 Sync with iCloud

`SYNC.md`, `ICloudSync.swift`, `SyncDefault.swift`.

- CloudKit, contenitore `iCloud.com.officecommun.search`, **database privato** dell'utente, zona `Search`, tipo di record `Item`, `CKSyncEngine`, ambiente Production anche in debug.
- Solo il profilo **Personal**.
- Record (nome = contenuto, JSON in `encryptedValues["data"]`, **cifrato end to end**; campo `at` = data di modifica in chiaro; mai altri campi):
  - `device.<uuid>`: schede aperte di quel dispositivo (`DeviceTabs { name, platform: "ios"|"macos", at, tabs: [{url, title}] }`), mai private, mai pin; il nome è il nome del computer.
  - `pins.<space-uuid>`: `[PinDef]` di uno spazio.
  - `pinfolders.<space-uuid>`: cartelle dei pin.
  - `bookmarks`: tutto l'albero `[Bookmark]`.
  - `spaces`: `[Space]`.
  - `settings`: `SharedSettings { engine, custom, look }` (motori `google duckduckgo bing ecosia startpage kagi brave qwant custom`, aspetto `light dark system`).
- Regole: l'ultimo scritto vince per record (`at`); entrare = prima scaricare tutto, poi unire pin e segnalibri locali (per `id`, poi per indirizzo), impostazioni di iCloud vincono; nessuna eco (si invia solo JSON canonico diverso dall'ultimo); campi sconosciuti viaggiano intatti; spegnere cancella il proprio `device.<uuid>`; `Delete Search's data from iCloud` cancella la zona per tutti e spegne la sync sugli altri (`Off: Search's data was deleted from iCloud, on another device. Turn on to start again`).
- **Mai**: cronologia, password, cookie, accessi, schede private.
- Le schede degli altri dispositivi compaiono nella barra indirizzi come `On \(device)` e sotto History.
- Stato in Settings: `Signed in to iCloud · synced <quando> · N other devices`, `Not signed in to iCloud: System Settings › Apple Account`, `Your iCloud is full`, `Offline. Sync carries on when you're back`, `Needs a build of Search signed for iCloud`, `Turn off Sync with your other Macs first`.
- Default: acceso per una nuova installazione dal momento in cui si lascia il benvenuto (dove ci sono i due interruttori, `Nothing starts until you leave this welcome. Both are in Settings › General.`); per chi aveva già Search, spento e offerto nella scheda What's New. Chiavi `icloud.sync`, `icloud.off`, `icloud.default`; stato locale in `icloud.json` (`ICloudLedger`).

### 4.2 Sync with your other Macs (cartella)

`Sync.swift`, `SyncMerge.swift`. Scelta dichiarata (17 nov 2026): una cartella, non le API di iCloud.

- L'utente sceglie una cartella condivisa (iCloud Drive, Dropbox, disco di rete); Search scrive `Search Sync/<scope>/<device>.json`, un file per dispositivo e per ambito, scritto solo da quel dispositivo.
- Ambiti: `app` (impostazioni) e `profile-<uuid>` per ogni profilo (spazi, pin, cartelle dei pin, segnalibri).
- Formato file: `SyncFile { format: 1, device, name, scope, written, items: { chiave: { v: JSON|null, t: secondi dal 1970, d: device } } }`, chiavi ordinate. Chiavi: `space:<uuid>`, `order:spaces`, `pin:<space>:<uuid>`, `order:pins:<space>`, `title:pin:<uuid>`, `infolder:<pin>`, `pinfolder:<space>:<uuid>`, `pinfolders:<space>`, `bm:<uuid>`, `kids:<cartella|root>`, `set:<impostazione>`.
- Unione: vince il timestamp più alto (sempre oltre il massimo già visto), poi l'id dispositivo, poi la cancellazione, poi il testo maggiore; cancellazioni ricordate 1 anno; chi entra timbra a 0 (vince la cartella); se sparisce tutto un tipo insieme (almeno 5 voci) non è una cancellazione; le voci non capite viaggiano intatte. Stato locale `sync-<scope>.json`.
- Impostazioni sincronizzate (`SyncSettings.all`): `look`, `glyph`, `search.engine`, `search.custom`, `search.suggest`, `search.keywords`, `spaces`, `pins.list`, `pins.home`, `tabs.close.after`, `tabs.newPlace`, `tabs.shortcuts`, `shield`, `privacy.clickIDs`, `privacy.gpc`, `bookmarks.bar`, `bookmarks.side`, `quit.confirm`.
- Mai: cronologia, password, cookie, schede aperte non fissate, gruppi, finestre private, estensioni, cartella download, dimensioni delle finestre.
- Passaggi: 1 s dopo l'accensione, 2 s dopo un cambiamento, quando un file nella cartella cambia, ogni 30 s, quando l'app torna in primo piano. Gestisce i segnaposto di iCloud Drive (`.nome.json.icloud`, download richiesto e file saltato).
- **Mai insieme a Sync with iCloud** (ciascun interruttore è bloccato mentre l'altro è acceso).
- Settings: `Sync with your other Macs` · `Spaces, pins, bookmarks and settings, through a folder you choose`; pannello cartella `Choose a folder your Macs share, in iCloud Drive or Dropbox for example. Turn on sync with the same folder in Search on each Mac.`, pulsante `Sync Here`; riga stato `<cartella> · <altri Mac o "no other Mac yet"> · <quando>`; problemi `The folder isn’t there`, `Search can’t write in that folder`.

### 4.3 Handoff

`Handoff.swift`. La pagina in primo piano diventa una `NSUserActivity` di tipo `NSUserActivityTypeBrowsingWeb` (URL + titolo) sulla finestra principale: macOS la offre a iPhone, iPad e altri Mac. Mai schede private, spazi con accessi separati, indirizzi non web. In entrata apre solo http/https se Search è il browser predefinito. Chiave `handoff`, default come la sync. Settings: `Handoff to your iPhone and iPad` · `The page in front comes up in their app switcher, as Safari's does`.

### 4.4 File collegati minori

- `IPhoneAsk.swift`: invito alla beta di Search per iPhone (`Want Search on your iPhone? Leave your email and we'll send you the beta.`, `Get the beta`, `Not now`, menu `Search for iPhone…`), un POST a `searchbrowser.app/api/ios-beta` solo alla pressione; `EmailTypo.swift` corregge refusi del dominio solo localmente. Su Windows: rivedere (l'iPhone non sincronizza con Windows, vedi 4.5).
- `Loot.swift`: elenco download (`downloads.json`, massimo 50, senza credenziali negli indirizzi).
- `Substitutions.swift`: sostituzioni testo di macOS nelle pagine; nessun equivalente Windows.
- `Trim.swift`: restituzione memoria al sistema dopo le regole delle estensioni; specifico di macOS/WebKit, non portare.

### 4.5 Cosa fare su Windows

1. **iCloud/CloudKit**: da Windows non c'è CloudKit nativo. CloudKit Web Services esiste, ma i campi `encryptedValues` sono cifrati con chiavi dei dispositivi Apple e non risultano leggibili via web (**dedotto**, da verificare sulla documentazione Apple). Quindi Search Windows **non può** parlare con il database iCloud di Search Mac e iPhone così com'è.
2. **Sync a cartella: la strada consigliata (P1)**. Il formato `SyncFile` è semplice, documentato nel codice e indipendente dalla piattaforma. Cartelle tipiche su Windows: iCloud Drive per Windows (`%USERPROFILE%\iCloudDrive`, **dedotto**), OneDrive (`%OneDrive%`), Dropbox. Requisiti: stesso id fisso del profilo Personal e del primo spazio (`00000000-0000-0000-0000-000000000001`), stesse chiavi e stessi JSON canonici (chiavi ordinate), mappa delle icone degli spazi, rispetto dei file "solo online" (OneDrive Files On-Demand), osservazione cartella + timer 30 s.
3. **Limite da comunicare**: sul Mac la sync a cartella e quella iCloud si escludono, quindi chi sincronizza Mac e iPhone via iCloud non può contemporaneamente sincronizzare con Windows. Superarlo richiede una modifica al Mac (fuori da questo studio) o la sync a cartella anche sull'iPhone.
4. **Schede su altri dispositivi**: la sync a cartella non porta le schede aperte; un nuovo tipo di voce (per esempio `device:<uuid>`) verrebbe trasportato intatto dal Mac (che non lo capisce) ma non mostrato. P2.
5. **Handoff**: nessun equivalente Windows con iPhone (la Timeline di Windows è stata ritirata). Nascondere l'opzione; eventuale P2 "manda questa scheda" tramite la cartella di sync.
6. Mai sincronizzare password, cronologia o cookie, come sul Mac.

---

## 5. Formati e posizioni di tutti i dati dell'utente

**Mac** (cartella `~/Library/Application Support/Search/`, in test `Search (<mondo>)`; migrazione automatica dalla vecchia `Office Browser`):

| Dato | File / luogo Mac | Formato | Proposta Windows |
|---|---|---|---|
| Password | Portachiavi di login, internet password etichetta `Search` | voce portachiavi | `vault.db` cifrato DPAPI (o Credential Manager) |
| Siti "never" | `UserDefaults` `passwords.never` | array di stringhe | `settings.json`, stessa chiave |
| Segnalibri | `bookmarks.json`, `bookmarks-<uuid>.json` | JSON `[Bookmark]` | stessi nomi |
| Cronologia | `history.json`, `history-<uuid>.json` | JSON `[Visit]`, max 2000 | stessi nomi |
| Sessione (schede) | `session.json`, `session-<space>.json`, `windows.json` | JSON | stessi nomi |
| Pin, spazi, cartelle pin, profili | `pins.json`, `spaces.json`, `pin-folders.json`, `profiles.json` | JSON | stessi nomi |
| Elementi nascosti, stili, siti di ricerca | `hidden.json`, `styles.json`, `search-sites.json` | JSON | stessi nomi |
| Download | `downloads.json` | JSON, max 50 | stesso nome |
| Icone dei siti | `icons/` | file immagine + indice | `icons\` |
| Record degli import | `UserDefaults` `import.records`, `bookmarks.top` | JSON / stringa | `settings.json` |
| Stato sync iCloud | `icloud.json` | JSON (`ICloudLedger`) | non applicabile |
| Stato sync cartella | `sync-app.json`, `sync-profile-<uuid>.json`; id dispositivo `sync.device`, cartella `sync.folder` | JSON | stessi nomi e chiavi |
| Impostazioni | `UserDefaults` dominio `com.officecommun.search` | plist | `settings.json` con le stesse chiavi |
| Cookie, accessi, cache, storage dei siti | store WebKit dell'app (uno per spazio con accessi propri, uno per profilo) | WebKit | partizioni Electron in `userData\Partitions\` (cookie cifrati da Electron con DPAPI) |
| Estensioni | `Extensions/` + store WebKit delle estensioni | | altro studio |
| File temporanei degli import | `$TMPDIR/office-import-<pid>-<uuid>/` | copie SQLite, ZIP scompattati | `%TEMP%\office-import-…`, stessa pulizia |
| File corrotti | `<nome>.unreadable-<timestamp>.json` accanto | | stessa regola |

Consiglio per Windows: mettere `userData` in `%LOCALAPPDATA%\Search` (Electron di default usa `%APPDATA%`, cioè Roaming, che con profili roaming si porta dietro cache e partizioni pesanti); scritture atomiche (file temporaneo + rinomina) e coda seriale come `Disk`.

---

## 6. Riferimenti file:riga

Import
- `Import.swift:21-143` `Chromium.Source` (radice, profili, file sicuri, `Local State`); `:145-174` elenco Chromium; `:179` base; `:207-251` illeggibili e messaggi; `:272-310` lettura password; `:316-367` segnalibri; `:372-420` icone; `:433-477` cronologia; `:486-519` anteprima; `:528-571` estensioni; `:579-599` chiave dal portachiavi; `:603-621` PBKDF2; `:624-647` AES-CBC `v10`; `:659-697` query `logins`.
- `Import.swift:708-806` `Mozilla.Source`, `profiles.ini`, elenco; `:854-927` segnalibri Firefox; `:996-1032` cronologia; `:1047-1103` password; `:1137-1253` `key4.db` e decifratura; `:1363-1561` `ImportSource`; `:1565-1602` `ImportRead`; `:1608-1643` `Snapshot`.
- `ImportPanel.swift:13-101` stato e contenuto; `:104-185` lastra e piede; `:191-227` testi Arc e schede; `:232-266` note Safari e illeggibili; `:270-300` scelta cartella; `:302-415` opzioni; `:430-458` righe di dettaglio; `:517-604` esecuzione ed esiti; `:608-626` offerta Arc.
- `ImportFile.swift:19-44` cartelle temporanee; `:163-282` lettura file e cartelle; `:290-321` cronologia Safari; `:348-383` ZIP.
- `ImportSession.swift:19-78` SNSS; `:80-243` lettura; `:309-340` file di sessione Chromium.
- `ImportGeckoTabs.swift:12-55`, `:66-76`.
- `ImportWebKit.swift:28-100` sorgenti; `:104-229` segnalibri Orion e Safari; `:233-281` cronologia.
- `ImportArc.swift:19-48` modello; `:53-159` lettura; `:208-312` icone; `:318-339` collegamento a `ImportSource`.
- `ImportZen.swift:29-60` MozLz4; `:90-116` ordine dei formati; `:123-177` parsing; `:316-397` tabelle `places.sqlite`; `:407-435` session store.
- `ImportRecord.swift:8-59`.
- `Browser.swift:286-316` `takeBookmarks`; `:320-345` `bringingIn` e import da file; `:1655-1702` `keep(found)`, `took`, `takePlaces`; `:1706-1837` `importFile`, `takeFile`; `:3820-3956` `takeArc`; `:3976-4047` `takeSession`, icone.
- `Welcome.swift:56-70` pagine; `:113-127` interruttori sync/handoff; `:132-198` pagina import; `:357-400` `bringAll`, `finish`.
- `App.swift:97`; `Settings.swift:563-567`, `:824-826`; `SettingsIndex.swift:126-144`, `:452-458`; `InternalPages.swift:54-72`.

Password
- `Vault.swift:14-44` `Login`, `Kept`; `:46-182` lettura; `:186-235` scrittura; `:239-247` never; `:253-284` prova; `:304-367` `FillProof`; `:373-388` dominio e host; `:395-508` CSV.
- `Passwords.swift:6-84` pannello; `:147-221` riga account; `:224-285` aggiunta.
- `Forms.swift:12-90` relay; `:111-222` passkey spente; `:224-1206` script (`pair` 379, `judge` 532, `firstStep` 517, codici 561-610, contatti 612-888, `__officeForms` 912-975, `offer` 984-1024, `tell`/`settled` 1026-1060, `caret` 1114-1168).
- `Tab.swift:1309-1425` invio e successo; `:1435-1465` riempimento.
- `Browser.swift:921-1044` offerta di salvataggio; `:1050-1157` lista sotto il campo; `:1433-1495` scelta e riempimento; `:1541-1650` pannello, rimozione, copia; `:7599-7632` collegamento `onField` e `onCredentials`.
- `PageQuestions.swift:127-180` fumetto di salvataggio.
- `Accounts.swift:15-110` lista; `:108` `Other accounts on …`; `:165-168` piè di lista; `:209` offerta Apple.
- `Passkeys.swift:6-35` motivazione; `:42-70` permesso; `:114-160` mediazione condizionale; `:216` firma; `:390-430` chiavi di sicurezza; `:508-565` PRF.
- `ApplePasswords.swift:8-44`, `:89-120`; `ApplePasswordsProtocol.swift:11-15`, `:385-394`; `ApplePasswordsOffer.swift:1-30`; `ApplePasswordsSettings.swift:23-79`, `:167-179`.
- `MeCard.swift:15-81`, `:100-183`.
- `Prefs.swift:595-650`, `:1361-1366`; `Settings.swift:488-499`, `:850-875`, `:955-965`, `:1138-1143`; `SettingsIndex.swift:541-565`; `Extensions.swift:1364-1366`.

Segnalibri e cronologia
- `Bookmarks.swift:11-48` modello; `:276-379` modifiche; `:388-617` import e fusione; `:571` `bookmarks.top`; `:641-719` domande; `:721-746` file; `:1316` apertura; `:1434-1475` pannello.
- `BookmarksBar.swift:1-60`, `:99-114`, `:230-256`; `BookmarksFile.swift:17-163`.
- `History.swift:66-72` `Visit`; `:165-173` limiti; `:213-236` identità; `:326-419` scrittura e import; `:711-714` punteggio; `:722-869` file; `:874-895` siti noti.
- `Store.swift:123-153` cartella e quarantena; `:155-164` impostazioni; `:186-251` `Disk`; `Profiles.swift:1-40`, `:117`, `:129`; `Session.swift:71`.

Sync
- `SYNC.md` intero; `ICloudSync.swift:5-45` regole; `:50-71` forme; `:75-139` ledger; `:419-425` costanti; `:923` zona cancellata; `:964-1002` dispositivi e stato.
- `Sync.swift:5-50` decisione e regole; `:52-116` impostazioni; `:119-276` ciclo; `:280-339` passaggio; `:422-434` riga di stato.
- `SyncMerge.swift:28-47` formato; `:49-184` unione; `:125-130` protezione cancellazioni di massa; `:228`, `:303`, `:428-429` chiavi; `:481` `understood`.
- `SyncDefault.swift:17-59`; `ICloudStandIn.swift:12-78`; `Handoff.swift:21-82`; `IPhoneAsk.swift:26-41`.

Test utili da tradurre: `Tests/imported_autofill.py`, `gecko_tabs.py`, `zen_spaces.py`, `arc_*.py`, `safari_direct.py`, `login_shapes.py`, `password_*.py`, `fill_touch_id.py`, `forms_frames_attack.py`, `passkey_*.py`, `sync_two_macs.py`, `icloud_*.py`, `bookmark*.py`; `Tests/SearchTests/` `ImportFileTests`, `SessionImportTests`, `ZenImportTests`, `WebKitImportTests`, `BrowserImportBoundaryTests`, `FileReadRootTests`, `VaultMatchingTests`, `FormFieldCorpusTests`, `FormRelayOriginTests`, `HistoryCapTests`, `SyncTests`; `Tests/FieldFixtures/` (35 pagine).

---

## 7. CHECKLIST di backlog

### P0 (senza questi non è "Search")

- [ ] Modello e file JSON identici al Mac: `bookmarks.json`, `history.json` (limite 2000, punteggio, credito alla home), profili, scritture atomiche in coda, quarantena dei file illeggibili.
- [ ] Pannello `Bring Things Over` con layout, ordine delle righe, conteggio in anteprima senza decifrare, profili, `All profiles`, esiti riga per riga.
- [ ] Import Chromium su Windows: segnalibri, cronologia (3000), icone, profili da `Local State`, scansione anche di `Default` e `_side_profiles` per Opera.
- [ ] Password Chromium `v10`: `Local State` › `os_crypt.encrypted_key` › `CryptUnprotectData` (addon nativo) › AES-256-GCM; blob DPAPI diretti per i vecchi; conteggio separato `v10`/`v20`.
- [ ] Rilevazione `v20` (App-Bound) con messaggio chiaro e via CSV guidata per Chrome, Edge, Brave; **niente** iniezione o COM `IElevator`.
- [ ] Import Firefox: segnalibri, cronologia, password NSS (password primaria vuota, altrimenti invito al CSV), icone.
- [ ] Import da file: HTML Netscape, CSV (stesse colonne alternative), ZIP con JSON cronologia stile Safari, cartelle; avanzamento e annullamento; avviso sul file in chiaro.
- [ ] `ImportRecords` (`import.records`), `bookmarks.top`, `Replace what came from X before` con la regola "solo se tutto si è letto".
- [ ] Deposito password cifrato (DPAPI via `safeStorage`), liste senza segreti, `Login`/`Kept` separati, `clear` per http, `used`.
- [ ] Pannello Passwords: ricerca, aggiunta, 10 pallini, Show 15 s, Copy 90 s con formati di esclusione dagli appunti, Remove, Remove All con conferma e prova.
- [ ] Prova d'identità Windows Hello (con fallback password Windows) per mostra, copia, rimuovi tutto.
- [ ] Script dei moduli portato in preload isolato: coppia, primo passo, giudizio `wide`, frame stessa origine, setter nativo + eventi.
- [ ] Lista sotto il campo: 5 account, regola http, nome del passo precedente, mezzo secondo, frecce e Invio, mai riempimento automatico.
- [ ] Offerta di salvataggio con rilevazione di successo (nuovo documento o caselle sparite, 45 s, 1,5 s), condizioni (privata, never, estensione), `Save`/`Update`/`Not now`/`Never here`.
- [ ] Siti never (`passwords.never`) con import da Chromium e Firefox e riga `Sites never asked`.
- [ ] Barra dei segnalibri (spenta di default), `»`, solo icone, variante in colonna, menu.
- [ ] Testi Windows al posto di macOS/keychain/Touch ID, approvati da te.

### P1

- [ ] Schede aperte e gruppi da Chromium (SNSS) e Firefox (`jsonlz4`), limite 300, addormentate in fondo allo spazio, pin come pin.
- [ ] Arc per Windows (`StorableSidebar.json` nel pacchetto MSIX): spazi, preferiti come pin, cartelle, profili Arc come profili Search, `Set Up Like Arc` dopo l'import.
- [ ] Zen per Windows: tre formati, gradienti, Essentials.
- [ ] Altri Gecko (Floorp, LibreWolf, Waterfox, Mullvad) e altri Chromium (Vivaldi, Opera, Opera GX, Yandex senza password, Chromium, canali Beta/Dev/Canary di Chrome ed Edge).
- [ ] `Ask for Touch ID before filling` come `Ask for Windows Hello before filling`: grazia 60 s per dominio e per privato/normale, azzerata su blocco e sospensione.
- [ ] Passkey: verificare in Electron Windows Hello, QR e chiavi; gestire la mediazione condizionale; interruttore `Offer passkeys` con `withoutPasskeys`; eccezione chiavi di sicurezza.
- [ ] Estensioni dal Web Store durante l'import (dipende dallo studio estensioni).
- [ ] Sync a cartella compatibile byte per byte con `SyncFile` del Mac (OneDrive, iCloud Drive per Windows, Dropbox), segnaposto "solo online", stato in Settings.
- [ ] Firma del codice e prove con Microsoft Defender attivo sul flusso di import password.
- [ ] Gestione file bloccati ("chiudi il browser e riprova").

### P2

- [ ] Import opzionale degli accessi (cookie) da Firefox, e forse Opera/Vivaldi `v10`, con avviso; mai dai browser con App-Bound.
- [ ] Apple Passwords tramite iCloud per Windows (protocollo SRP da confermare).
- [ ] Scheda `Your details` propria al posto della scheda "Io" di Contatti; eventuale import indirizzi da `Web Data`.
- [ ] Schede degli altri dispositivi via cartella (voce `device:<uuid>`), "manda scheda".
- [ ] Speed Dial e radici proprie di Opera nei segnalibri.
- [ ] Comet, Helium, Thorium, Whale, Island, Sidekick su Windows: percorsi da verificare uno per uno.
- [ ] Coordinamento con il Mac per permettere sync iCloud e cartella insieme.

---

## 8. Browser sorgente su Windows: cosa importare e dove sta

`%LOCALAPPDATA%` = `C:\Users\<utente>\AppData\Local`, `%APPDATA%` = `C:\Users\<utente>\AppData\Roaming`. Dentro ogni "User Data" i profili sono `Default`, `Profile 1`, `Profile 2`...; `Local State` sta nella radice.

| Browser | Cosa importare | Percorso Windows | Stato percorso | Password su Windows |
|---|---|---|---|---|
| Chrome | segnalibri, cronologia, icone, schede e gruppi, estensioni, password (solo `v10` residue o CSV), never | `%LOCALAPPDATA%\Google\Chrome\User Data` | **verificato** (doc Chromium) | `v20` App-Bound: CSV |
| Chrome Beta / Dev / Canary | come Chrome | `%LOCALAPPDATA%\Google\Chrome Beta\User Data`, `…\Chrome Dev\User Data`, `…\Chrome SxS\User Data` | **verificato** (doc Chromium) | come Chrome |
| Chromium | come Chrome | `%LOCALAPPDATA%\Chromium\User Data` | **verificato** (doc Chromium) | probabilmente `v10` (dedotto) |
| Edge | come Chrome; estensioni dello store Edge escluse come sul Mac | `%LOCALAPPDATA%\Microsoft\Edge\User Data` (profilo `Default`, poi `Profile 1`) | **verificato** (Microsoft Learn) | `v20` App-Bound (fonte terza): CSV |
| Edge Beta / Dev / Canary | come Edge | `%LOCALAPPDATA%\Microsoft\Edge Beta\User Data`, `…\Edge Dev\User Data`, `…\Edge SxS\User Data` | dedotto | come Edge |
| Brave | come Chrome | `%LOCALAPPDATA%\BraveSoftware\Brave-Browser\User Data` (Dev: `Brave-Browser-Dev`) | fonte terza (community Brave) | `v20` App-Bound (fonte terza): CSV |
| Opera | segnalibri (anche Speed Dial, P2), cronologia, icone, schede, estensioni Web Store, password | `%APPDATA%\Opera Software\Opera Stable` (profilo in `Default`, profili extra in `_side_profiles\<id>`; cache in `%LOCALAPPDATA%\Opera Software\Opera Stable`) | fonte terza (forum Opera) | probabilmente `v10` DPAPI (dedotto) |
| Opera GX | come Opera | `%APPDATA%\Opera Software\Opera GX Stable` (profilo `Default`, `_side_profiles`; cache in `%LOCALAPPDATA%\Opera Software\Opera GX Stable`; programma in `%LOCALAPPDATA%\Programs\Opera GX`) | fonte terza (forum Opera) | probabilmente `v10` DPAPI (dedotto) |
| Vivaldi | come Chrome | `%LOCALAPPDATA%\Vivaldi\User Data` | dedotto | probabilmente `v10` (dedotto) |
| Yandex | segnalibri, cronologia, schede (password no, come sul Mac) | `%LOCALAPPDATA%\Yandex\YandexBrowser\User Data` | dedotto | non supportate |
| Arc | spazi, pin, preferiti, cartelle, profili, segnalibri, cronologia, password | `%LOCALAPPDATA%\Packages\TheBrowserCompany.Arc_<id>\LocalCache\Local\Arc` (`StorableSidebar.json` lì, profili in `User Data`) | fonte terza (guida esterna) | da verificare |
| Firefox | segnalibri, cronologia, icone, password NSS, never, schede e gruppi; cookie in chiaro (P2) | profili `%APPDATA%\Mozilla\Firefox\Profiles\<profilo>`, `%APPDATA%\Mozilla\Firefox\profiles.ini`; cache in `%LOCALAPPDATA%\Mozilla\Firefox\Profiles`; versione Store sotto `%LOCALAPPDATA%\Packages\Mozilla.Firefox_…\LocalCache\Roaming\Mozilla\Firefox` | **verificato** per la versione classica (supporto Mozilla); Store dedotto | NSS, identico al Mac |
| Zen | spazi, pin, cartelle, Essentials, più tutto Firefox | `%APPDATA%\zen\Profiles` e `%APPDATA%\zen\profiles.ini` | dedotto (indizio da codice terzo) | NSS |
| Floorp / LibreWolf / Waterfox | come Firefox | `%APPDATA%\Floorp\Profiles`, `%APPDATA%\librewolf\Profiles`, `%APPDATA%\Waterfox\Profiles` | dedotto | NSS |
| Mullvad Browser | come Firefox | nella cartella d'installazione (`…\Mullvad Browser\Browser\TorBrowser\Data\Browser\profile.default`) | dedotto | NSS |
| Comet, Helium, Thorium, Whale, Island, Sidekick | come Chrome | da individuare (probabile `%LOCALAPPDATA%\<produttore>\<nome>\User Data`) | dedotto, da verificare | da verificare |
| Safari | solo da ZIP esportato su un Mac | non esiste su Windows | | CSV nello ZIP |

Nota finale sui percorsi: nessun percorso Windows è stato provato su una macchina reale. Quelli "verificati" vengono da documentazione ufficiale (Chromium, Microsoft Learn, Mozilla); quelli "fonte terza" da forum e guide; prima di fissare il codice va fatto un giro di controllo su un PC con i browser installati (`chrome://version`, `edge://version`, `opera://about`, `about:support` di Firefox e Zen mostrano il percorso del profilo).

### Fonti web consultate

- [Google Security Blog, App-Bound Encryption (luglio 2024)](https://security.googleblog.com/2024/07/improving-security-of-chrome-cookies-on.html)
- [Chromium, app_bound_encryption_provider_win.cc](https://chromium.googlesource.com/chromium/src.git/+/lkgr/chrome/browser/os_crypt/app_bound_encryption_provider_win.cc)
- [Chrome-App-Bound-Encryption-Decryption (README, fonte terza)](https://github.com/xaitax/Chrome-App-Bound-Encryption-Decryption)
- [Chrome v20 offline decryption (blog terzo)](https://aabston.github.io/posts/chrome-v20-offline-decryption/)
- [Chromium, User Data Directory](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/user_data_dir.md)
- [Microsoft Learn, Edge user data directory variables](https://learn.microsoft.com/en-us/deployedge/edge-learnmore-create-user-directory-vars)
- [Brave Community, profili su Windows](https://community.brave.app/t/where-brave-browser-profiles-are-located/646708)
- [Forum Opera, cartella profilo e Default](https://forums.opera.com/post/362954)
- [Forum Opera, percorsi Opera GX](https://forums.opera.com/post/398899)
- [Supporto Mozilla, profili](https://support.mozilla.org/kb/Profiles)
- [Guida esportazione barra laterale Arc (fonte terza)](https://supasidebar.com/blog/export-arc-browser-sidebar)
- [Clerk, passkey in Electron (fonte terza)](https://clerk.com/docs/reference/electron/passkeys)
- [Microsoft Learn, WebAuthn API](https://learn.microsoft.com/en-us/windows/win32/webauthn/-webauthn-portal)
