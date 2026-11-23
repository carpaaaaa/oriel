# Oriel (Search per Windows): studio e piano

Oriel è la versione Windows non ufficiale di Search, il browser per Mac di Office Commun (MIT, v1.0.19). Questo file riassume lo studio, le decisioni prese con l'advisor e il piano di lavoro. Il dettaglio sta in `studio/`.

## 1. Cosa abbiamo studiato

Il sorgente Mac (205 file Swift, circa 120 mila righe, 313 prove) è stato letto per intero da sei agenti, uno per area, più una ricerca sul lato Windows. Totale: circa 16 mila righe di studio.

| Rapporto | Contenuto | Righe |
|---|---|---|
| `studio/01-finestra-schede.md` | finestra, schede, colonna, spazi, pin, cartelle, gruppi, split, sessione, sonno, pannelli fluttuanti: 443 funzioni, tabella completa dei menu | 11.400 |
| `studio/02-aspetto.md` | specifica visiva: colori, grigi, gradienti, tipografia, misure, raggi, ombre, molle, icone, pagine interne, token CSS | 1.080 |
| `studio/03-indirizzi-comandi-ai.md` | campo indirizzi, suggerimenti, parole chiave, comandi, menu, scorciatoie Mac e Windows, trova, lettura, traduzione, AI e agenti | 1.010 |
| `studio/04-estensioni.md` | esperienza delle estensioni, API chrome.* simulate sul Mac, correzioni per singola estensione | 850 |
| `studio/05-dati-import-password.md` | import da 24 browser, password, segnalibri, cronologia, sync | 725 |
| `studio/06-impostazioni-privacy-media.md` | le 158 voci delle impostazioni in ordine, privacy, permessi, download, media, aggiornamenti | 790 |
| `studio/07-ricerca-windows.md` | Electron, estensioni, App-Bound Encryption, aspetto Windows 11, installer, test, AI locale | 400 |

## 2. Decisioni

Prese da Opus e riviste dall'advisor (Fable 5.2).

1. **Motore: Electron 45** (Chromium 156) con `electron-chrome-extensions` 4.10 ed `electron-chrome-web-store` 0.13 (entrambe MIT), più un nostro strato per le API che mancano (pannello laterale, offscreen, download, identity, comandi, gruppi di schede, regole statiche di blocco, native messaging dal registro di Windows). È l'unica strada fattibile partendo da un Mac: un fork di Chromium richiede macchine Windows enormi.
2. **Supporto estensioni misurabile**: una lista chiusa di estensioni reali che devono funzionare (uBlock Origin Lite, Bitwarden, 1Password, Proton Pass, Dark Reader, Grammarly, Raindrop, Readwise, Zotero, Vimium, pannello laterale di Claude e altre), ognuna con una prova.
3. **Architettura.** Il processo principale tiene il modello (finestre, spazi, schede, pin, sessioni, sonno) e manda all'interfaccia solo le parti cambiate, con un numero di versione. Ogni finestra è una `BaseWindow` con tre strati: interfaccia sotto, pagine in mezzo, uno strato sopra che si allarga solo quando qualcosa galleggia sulla pagina (così i clic restano alla pagina).
4. **Interfaccia: Solid + TypeScript + Vite**, CSS puro con i token della specifica, un solo modulo di molle nostro. Nessuna libreria di componenti.
5. **Finestra: come il Mac** (scelta del 23 novembre: "il più uguale possibile"). Finestra senza cornice disegnata da Search con angoli da 17,5, carta a 8 con raggio 10, ombra nostra; i pulsanti di Windows restano quelli classici in alto a destra. Ridimensionamento, ingrandimento e Snap rifatti da noi; la cornice nativa resta come ripiego con un'impostazione.
6. **Niente moduli nativi da compilare**: `koffi` per chiamare Windows (spostare la finestra, DPAPI), SQLite già dentro Node 24, PowerShell per Windows Hello.
7. **Import onesto.** Segnalibri, cronologia, schede ed estensioni da tutti i browser. Password: lette direttamente dove la cifratura è quella classica di Windows (si riconosce dal dato, prefisso `v10`), con consenso esplicito; per Chrome, Edge e Brave recenti (`v20`, App-Bound Encryption) importazione guidata del CSV esportato. Mai tecniche per aggirare l'App-Bound Encryption: sono quelle dei virus che rubano password. Le sessioni di login non entrano nella prima versione.
8. **Scorciatoie**: quelle di Search con Ctrl al posto di ⌘, spazi su Alt+1-9, più gli standard Windows che non si scontrano. Lettere lette per carattere, cifre e punteggiatura per tasto fisico, AltGr ignorato.
9. **Ultima finestra chiusa**: l'app esce, come vuole Windows; la sessione resta.
10. **Testi**: identici all'inglese di Search, tranne quelli che nominano macOS, Touch ID o il portachiavi, e senza trattini lunghi.

## 3. Cosa non sarà mai identico

- Il vetro del Mac e la lente Liquid Glass: su Windows c'è Mica/Acrylic, simile ma non uguale.
- Gli angoli della finestra: 8 invece di 17,5, a meno di rinunciare a ridimensionamento e Snap nativi.
- I gesti del trackpad: Windows non dà inizio e fine del gesto, solo rotella.
- Semafori e barra dei menu: su Windows i pulsanti stanno a destra e i menu sono nella finestra.
- Il carattere SF Pro e le icone SF Symbols: licenza Apple. Al loro posto Inter tarato sulle stesse misure e icone open source ritoccate.
- Password e login di Chrome, Edge e Brave: solo via CSV.
- iCloud e Handoff: niente. Al loro posto la sincronizzazione a cartella, compatibile con quella del Mac.
- Senza firma del codice Windows mostra un avviso all'installazione.

## 4. Fasi

**Fase 0, i rischi (prima di tutto il resto).** Ogni prova si chiude con uno script ripetibile.
0. Circuito di prova: build dal Mac, avvio su Windows vero (GitHub Actions), comando di prova, screenshot che torna.
1. Accesso a Google: riuscito, resta dopo il riavvio, YouTube e Gmail loggati. Se fallisce il progetto si ferma.
2. Estensioni: uBlock Origin Lite blocca davvero, il popup di Bitwarden si apre e compila.
3. Strato sopra la pagina e tasti: un elemento galleggia sulla pagina, i clic fuori arrivano alla pagina, una scorciatoia usata dalla pagina non scatta anche da noi.
4. Finestra su Windows: trascinamento, doppio clic, clic destro, Snap Layouts, due schermi a scale diverse.
5. Sonno delle schede: Indietro, scroll e moduli tornano uguali.

**Fase 1, il nucleo (P0).** Finestra, colonna, schede, spazi, pin, campo indirizzi, impostazioni principali, estensioni, import, download.

**Fase 2 e 3 (P1 e P2).** Il resto del backlog degli studi, area per area.

Tempi onesti: una prima versione usabile richiede settimane, la parità sulle funzioni importanti mesi. Nel frattempo Search per Mac continua a cambiare.

## 5. Struttura del codice

```
src/shared/      contratti congelati: tipi dello stato, comandi, canali IPC, token CSS, molle, protocollo di prova
src/main/        processo principale: model/, views/, extensions/, import/, win/, bench/
src/preload/     ponte per l'interfaccia e per le pagine
src/ui/          interfaccia in Solid: sidebar/, tabbar/, omnibox/, settings/, overlay/, pages/
test/            prove con il protocollo bench
studio/          lo studio
ref/search-mac/  sorgente Mac di riferimento (fuori dal repo)
```

Regole per gli agenti paralleli: `src/shared/` lo cambia solo l'orchestratore; ogni funzione è un comando tipizzato più una parte di stato; l'interfaccia si sviluppa anche contro stati finti; ogni modulo consegna i suoi comandi di prova; al massimo 4 o 5 agenti insieme.

## 6. Prove

- Lo stesso protocollo "bench" del Mac (comandi JSON su un socket, named pipe su Windows), così le prove si possono portare.
- Sviluppo e prove sul Mac, dove Electron gira uguale.
- Prove su Windows vero con GitHub Actions (x64 e ARM), con screenshot.
- Confronto a pixel: Search vero e la nostra versione alla stessa misura di finestra.
- Una macchina virtuale Windows 11 sul Mac per le cose che una macchina remota non fa (trascinare, accedere con un account vero).

## 7. Decisioni che spettano all'utente

1. ~~Nome~~: Oriel (23 novembre). Icona ancora da fare.
2. Angoli della finestra: scelta sulla tavola.
3. Macchina virtuale Windows 11 sul Mac: sì o no.
4. Prova dell'accesso a Google con il proprio account.
