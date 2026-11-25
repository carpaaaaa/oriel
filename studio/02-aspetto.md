# 02 · Aspetto visivo di Search (Mac 1.0.19) · specifica di design per Windows

Studio del sorgente in `ref/search-mac` (Swift/SwiftUI/AppKit). Scopo: poter rifare in HTML/CSS (Electron, Chromium) ogni colore, misura, font, ombra, materiale, animazione e icona dell'app Mac, nel modo più fedele possibile.

## 0. Convenzioni di lettura

- **Unità.** Un punto (pt) di macOS vale 1 px CSS. Su Retina 1 pt = 2 pixel fisici; su Windows al 100% 1 px CSS = 1 pixel, al 150% 1,5 pixel. Tutte le misure qui sono in pt = px CSS.
- **File:riga.** I riferimenti sono relativi a `ref/search-mac/Sources/Search/` salvo dove indicato (es. `Icon/icon.swift`).
- **Testi dell'interfaccia** copiati esatti, in inglese, tra virgolette o in `code`. Dove l'originale contiene il trattino lungo (U+2014) o il trattino medio (U+2013) qui è scritto come sequenza `\u2014` / `\u2013`: nell'app vanno resi con il carattere originale **oppure** riscritti (vedi decisione D7 nel backlog: la regola del progetto vieta il trattino lungo nel copy, l'originale lo usa in una decina di stringhe).
- **Colori grigi in due colonne.** Il codice definisce i grigi come `NSColor(white:)` (`Design.swift:53-58`). Secondo AppKit questi colori vivono nello spazio "Generic Gamma 2.2 Gray", e a schermo (sRGB) cambiano leggermente, soprattutto gli scuri. La colonna "nominale" è il valore scritto nel codice (coincide con la palette Tailwind `neutral` citata nei commenti: `#171717`, `#D4D4D4`); la colonna "a schermo (stima)" è la conversione gamma 2.2 → sRGB. Prima di fissare i token va campionato uno screenshot reale del Mac con Digital Color Meter in sRGB (P0 del backlog). I token proposti in fondo usano i valori nominali.
- **Screenshot di riferimento.** `.github/screenshot.png` mostra una versione vecchia (colonna bianca bordo a bordo, senza la pagina "a scheda"): utile per il carattere generale, non per i valori. Campionato: righe e quadrati dei pin coincidono con i grigi `Greys.white` (`#F6F6F6` sul tile), la riga attiva è `#F4F4F4` (palette precedente).
- **Licenze (da sapere prima di copiare "al pixel").**
  - SF Pro, SF Pro Rounded, SF Mono e SF Symbols sono di Apple e la loro licenza ne permette l'uso solo su piattaforme Apple: non si possono includere in un'app Windows, né ricalcare i simboli forma per forma. Qui propongo sostituti il più vicini possibile.
  - `README.md:144`: il nome "Search" e l'icona dell'app sono di Office Commun; il codice è MIT ma una fork distribuita va rinominata. Per un uso personale nessun problema; per distribuire serve il permesso o un nome e un'icona propri.

---

## 1. I tratti distintivi dello stile (in breve)

1. **Bianco e grigi neutri, quasi nient'altro.** Un solo inchiostro (`#171717` / `#EDEDED`), quattro grigi di supporto, nessun colore di brand. Gli unici colori non grigi: verde/ambra della connessione, rosso del contatore, colore dello spazio (opzionale), accento di sistema solo per la linea di caricamento e l'anello di selezione dei temi.
2. **La pagina come "carta".** Con la barra laterale (predefinita) la pagina è una scheda bianca a 8 pt dai bordi della finestra, raggio 10, filo dell'8% e ombra quasi invisibile, appoggiata su un fondo appena più scuro (`#F4F4F4`).
3. **Il grigio che scivola.** La scheda attiva è una pillola grigia (raggio 9) che si sposta di riga in riga con una molla corta; sotto, opzionale, la stessa pillola si riempie man mano che si legge la pagina (5,5% d'inchiostro).
4. **Grigi in trasparenza.** I grigi di righe e pin sono nero o bianco con alfa, così su un fondo colorato (spazio, gradiente, vetro) prendono la tinta del fondo invece di sembrare toppe grigie.
5. **Testo piccolo e calmo.** SF Pro di sistema, 12,5 pt per i titoli delle schede, 11,5 per i dettagli, quasi tutto regolare; gerarchia data dal colore (inchiostro / grigio medio / grigio chiaro), non dalla dimensione.
6. **Angoli "continui" (squircle)** ovunque (`style: .continuous`), molle invece di curve temporali, niente icone colorate nell'interfaccia.
7. **Un campo d'indirizzo che "respira"**: sulla scheda vuota l'unica cosa visibile è il campo, con un alone d'inchiostro che pulsa lentamente (2,6 s).

---

## 2. Colori

### 2.1 Palette di base (`Palette`, `Design.swift:13-60`)

Ogni colore è una coppia chiaro/scuro risolta in base all'aspetto della finestra (impostazione Light / Dark / System, `Design.swift:119-157`).

| Token | Valore nel codice (chiaro · scuro) | Chiaro nominale | Chiaro a schermo (stima) | Scuro nominale | Scuro a schermo (stima) | Dove si usa |
|---|---|---|---|---|---|---|
| `ground` | white 1.0 · 0.11 | `#FFFFFF` | `#FFFFFF` | `#1C1C1C` | `#161616` | Fondo della pagina e della scheda vuota, pannelli, campo indirizzi, popover, colonna bordo a bordo |
| `ink` | 0.09 · 0.93 | `#171717` | `#101010` | `#EDEDED` | `#EEEEEE` | Testo principale, titolo della scheda attiva, pulsanti pieni, switch acceso |
| `muted` | 0.55 · 0.58 | `#8C8C8C` | `#8D8D8D` | `#949494` | `#959595` | Testo secondario, titoli delle schede non attive (vedi Greys), icone dei pulsanti, dettagli |
| `faint` | 0.83 · 0.32 | `#D4D4D4` | `#D5D5D5` | `#525252` | `#515151` | Testo più tenue ("New tab"), switch spento, maniglia del bordo a riposo, punti della pagina di benvenuto |
| `hairline` | 0.91 · 0.20 | `#E8E8E8` | `#E9E9E9` | `#333333` | `#303030` | Tutti i fili da 1 pt: bordi di card, campo, liste, separatori |
| `wash` | 0.937 · 0.175 | `#EFEFEF` | `#EFEFEF` | `#2D2D2D` | `#282828` | Riga selezionata nelle liste, campo di ricerca nei pannelli, segmented, pillole `Quick` |
| `hover` | 0.965 · 0.15 | `#F6F6F6` | `#F6F6F6` | `#262626` | `#212121` | Sfondo sotto il puntatore, fondo della barra indirizzi fissa |
| `frame` | 0.955 · 0.075 | `#F4F4F4` | `#F4F4F4` | `#131313` | `#0B0B0B` | Fondo della finestra intorno alla pagina-scheda (colonna, barra dei preferiti, margini) |
| `resting` | 0.80 · 0.30 | `#CCCCCC` | `#CDCDCD` | `#4D4D4D` | `#4B4B4B` | I tre "semafori" disegnati a mano quando l'app è in secondo piano (`Stage.swift:1299-1314`) |
| `safe` | sRGB (0.08,0.50,0.24) · (0.29,0.87,0.50) | `#14803D` | uguale | `#4ADE80` | uguale | Connessione sicura nella scheda del sito (green-700 / green-400) |
| `unsafe` | sRGB (0.71,0.33,0.04) · (0.98,0.75,0.14) | `#B5540A` | uguale | `#FABF24` | uguale | Connessione non sicura (amber-700 / amber-400) |

### 2.2 Grigi in trasparenza (`Greys`, `Design.swift:67-105`)

Nero con alfa in chiaro, bianco con alfa in scuro. Due serie: `white` per ciò che sta sul bianco (striscia in alto, colonna bordo a bordo, pannelli) e `frame` per ciò che sta sul fondo della finestra accanto alla pagina-scheda (colonna e barra preferiti in modalità "carte", cioè il caso predefinito).

| Ruolo | `Greys.white` chiaro | → su `#FFF` | `Greys.white` scuro | → su `#1C1C1C` | `Greys.frame` chiaro | → su `#F4F4F4` | `Greys.frame` scuro | → su `#131313` |
|---|---|---|---|---|---|---|---|---|
| `wash` (scheda attiva / selezionata) | `rgba(0,0,0,.063)` | `#EFEFEF` | `rgba(255,255,255,.073)` | `#2D2D2D` | `rgba(0,0,0,.0628)` | `#E4E4E4` | `rgba(255,255,255,.0865)` | `#282828` |
| `hover` | `rgba(0,0,0,.035)` | `#F6F6F6` | `rgba(255,255,255,.045)` | `#262626` | `rgba(0,0,0,.0419)` | `#E9E9E9` | `rgba(255,255,255,.0595)` | `#212121` |
| `tile` (pin a riposo, tab ridotta al simbolo) | `rgba(0,0,0,.03465)` (=.063×.55) | `#F6F6F6` | `rgba(255,255,255,.04015)` | `#252525` | `rgba(0,0,0,.0314)` | `#EBEBEB` | `rgba(255,255,255,.0432)` | `#1D1D1D` |
| `pinLive` (pin attivo, tile attiva) | `rgba(0,0,0,.10)` | `#E6E6E6` | `rgba(255,255,255,.112)` | `#353535` | `rgba(0,0,0,.0995)` | `#DBDBDB` | `rgba(255,255,255,.1243)` | `#303030` |
| `washOnTile` (riga attiva dentro una coppia Split View) | `rgba(0,0,0,.0294)` | | `rgba(255,255,255,.0342)` | | `rgba(0,0,0,.0324)` | | `rgba(255,255,255,.0452)` | |
| `hoverOnTile` | `rgba(0,0,0,.004)` | | `rgba(255,255,255,.005)` | | `rgba(0,0,0,.0108)` | | `rgba(255,255,255,.0169)` | |
| `muted` (titolo scheda non attiva) | `rgba(0,0,0,.45)` | ≈`#8C8C8C` | `rgba(255,255,255,.5281)` | ≈`#949494` | `rgba(0,0,0,.4241)` | ≈`#8C8C8C` | `rgba(255,255,255,.5459)` | |
| `faint` ("New tab", porte silenziose) | `rgba(0,0,0,.17)` | ≈`#D4D4D4` | `rgba(255,255,255,.236)` | | `rgba(0,0,0,.1309)` | | `rgba(255,255,255,.2649)` | |

I valori "→" sono il risultato della fusione alfa in sRGB (come fa il CSS); sono pensati per ricadere sui grigi di `Palette` sopra il fondo previsto. In CSS si usano **direttamente gli rgba**, mai gli esadecimali, perché su un fondo colorato il grigio deve prendere la tinta.

### 2.3 Opacità d'inchiostro ricorrenti

| Opacità di `ink` | Dove | File:riga |
|---|---|---|
| 0.055 | Riempimento di lettura nella scheda attiva | `Tab.swift:283` |
| 0.06 | Quadratino dietro la lettera del sito (`Mark`) | `Icons.swift:786` |
| 0.07 | Disco dietro la × di chiusura, disco dello speaker al passaggio | `Side.swift:2229`, `TabBar.swift:1093` |
| 0.11 / 0.12 | Selezione del testo nei campi (scheda: 0.11; campo indirizzi e pin: 0.12) | `TabBar.swift:1684`, `Omnibox.swift:718`, `TabBar.swift:2527` |
| 0.18 | Parentesi verticale dei gruppi nella colonna di icone | `SideIcons.swift:340` |
| 0.10 / 0.18 / 0.22 / 0.25 / 0.55 | Barrette e puntini dei disegnini di scelta nelle impostazioni (finestre in miniatura) | `Settings.swift:1390-1535` |
| 0.30 | Segnaposto del campo indirizzi; pulsanti Indietro/Avanti disattivati (opacità dell'intero pulsante) | `Omnibox.swift:584`, `TabBar.swift:806` |
| 0.35 | Contorno 1 pt delle schede selezionate con ⌘/⇧ | `Side.swift:2252` |
| 0.45 | Scheda addormentata o messa via (opacità dell'intera riga/icona) | `Icons.swift:790`, `AtRestLine.swift:115` |
| 0.62 | Titolo dei gruppi nelle impostazioni (maiuscoletto) | `Settings.swift:1260` |
| 0.65 | Numero della scorciatoia ⌘1…9 sulla scheda | `TabShortcutHint.swift:21` |
| 0.70 | Titolo e icone al passaggio del puntatore; anello di caricamento (di `muted`) | `Side.swift:2322`, `TabBar.swift:2466` |
| 0.75 | Icone "template" delle pagine interne; titoli dei preferiti nella colonna | `Icons.swift:770`, `BookmarksBar.swift:357` |
| 0.78 | Icona nella piastrella delle impostazioni | `Settings.swift:1286` |

### 2.4 Altri colori non grigi

| Colore | Valore | Dove | File:riga |
|---|---|---|---|
| Contatore non letti | sRGB (0.93,0.24,0.21) = `#ED3D36`, testo bianco | Badge sui pin | `UnreadBadge.swift:56` |
| Registrazione in corso | `systemRed` di macOS (chiaro `#FF3B30`, scuro `#FF453A`) | Puntino 6 pt sulle tile | `SideIcons.swift:147` |
| Campo rifiutato | rosso di sistema al 35% sul bordo del campo | Indirizzo non valido | `Omnibox.swift:158` |
| Accento di sistema | `controlAccentColor` (su Windows: colore d'accento dell'utente) | Linea di caricamento 2 pt con colonna nascosta (opacità 0.9); anello sulla miniatura del tema scelto | `Fold.swift:953-1020`, `ThemesPage.swift:155` |
| Evidenziazione menu | accento mescolato al 42% col bianco (chiaro) o al 15% col nero (scuro); per l'accento blu ≈ `rgb(111,162,249)`; testo bianco | Righe dei menu ricostruiti (scheda del sito) | `SiteCard.swift:829-836` |
| Bordo dei menu | `rgba(0,0,0,.26)` chiaro · `rgba(255,255,255,.18)` scuro, 0.5 pt | Pannello scheda del sito | `SiteCard.swift:838-841` |
| Sotto-pagina scurita | `#171717` | Fondo oltre la fine di una pagina scurita da Dusk | `Dusk.swift:187` |
| Semafori (sistema) | chiudi `#FF5F57`, riduci `#FEBC2E`, zoom `#28C840` (valori standard di macOS, da campionare: lo screenshot marketing dà `#EC6765`, `#F2CA44`, `#65C466`) | Angolo in alto a sinistra | `Lights.swift` |
| Icona build di sviluppo | `#FFCC33` | Piastra dell'icona | `Icon/icon.swift:15` |

### 2.5 Colori degli spazi (`Spaces.swift:69-104`)

Sei voci; la prima ("None") non si disegna mai.

| Indice | Nome | sRGB nel codice | Hex | Rich (chiaro) | Rich (scuro) | Vivid (chiaro) | Vivid (scuro) |
|---|---|---|---|---|---|---|---|
| 0 | None | (0.45,0.47,0.52) | `#737885` | non usato | | | |
| 1 | Blue | (0.26,0.52,0.96) | `#4285F5` | `#3983FF` | `#3983FF` | `#3983FF` | `#2873EE` |
| 2 | Green | (0.20,0.66,0.45) | `#33A873` | `#00AB6E` | `#00AB6E` | `#00AB6E` | `#00915D` |
| 3 | Orange | (0.96,0.62,0.20) | `#F59E33` | `#FB9B00` | `#E68D00` | `#FB9B00` | `#AC6800` |
| 4 | Red | (0.90,0.33,0.40) | `#E65466` | `#EE4961` | `#EE4961` | `#EE4961` | `#D6314F` |
| 5 | Violet | (0.62,0.40,0.90) | `#9E66E6` | `#A062EB` | `#A062EB` | `#A062EB` | `#9153DB` |

**Lavaggio (wash).** Il colore dello spazio si stende su colonna, striscia, barra dei preferiti e fondo intorno alla scheda (mai sulla pagina) con un'opacità che dipende dalla "forza" scelta (`SpaceGradient.swift:171-177`, `Spaces.swift:85-86`):

| Forza | Opacità chiaro | Opacità scuro | Tono del colore (`SpaceGradient.swift:183-196`) |
|---|---|---|---|
| Subtle (predefinita) | 0.07 | 0.11 | il colore così com'è |
| Rich | 0.18 | 0.22 | croma ×1.15; in scuro luminosità OKLab ≤ 0.72 |
| Vivid | 0.30 | 0.40 | croma ×1.3; luminosità OKLab ≥ 0.62 in chiaro, tra 0.48 e 0.58 in scuro |

In ogni caso la croma non supera `max(croma originale, 0.20)`. Le colonne Rich/Vivid della tabella sopra sono già calcolate con questa regola (script di verifica in scratchpad, stesso algoritmo OKLab del codice).

**Altri usi del colore dello spazio:**
- Icona dello spazio (`SpaceDot`, 26×26): simbolo nel colore, sfondo del colore al 14% (24% al passaggio), raggio 8 (`Spaces.swift:917-924`).
- Pulsante per spazio: icona nel colore solo per lo spazio attuale, sfondo al 18% (`Spaces.swift:1026-1036`).
- Gruppi di schede: rettangolo del colore all'opacità del lavaggio Subtle, raggio 9 (6 nella colonna di icone) (`Side.swift:1442-1448`).

### 2.6 Gradienti degli spazi (`SpaceGradient.swift`)

**Modello dati** (`:27-54`): `colours` = 2 o 3 esadecimali `#RRGGBB` sRGB; `angle` in gradi **come in CSS** (0 su, 90 destra, 180 giù; predefinito **135**); `grain` booleano. Fino a 3 colori (`most = 3`).

**Algoritmo, passo per passo** (da replicare in JS, non con l'interpolazione nativa del CSS):

1. Ogni esadecimale → OKLab (Björn Ottosson; matrici in `:244-253`).
2. **Held** (`:306-316`): luminosità L bloccata tra **0.56 e 0.80**, croma ridotta a **0.20** se maggiore (a e b scalati insieme).
3. **Tone** secondo la forza (tabella 2.5).
4. **Mescola** a `count = 24` fermate equidistanti (`:68-76`): per t in 0..1 trova il tratto tra due colori vicini; interpola L, a, b in linea retta; poi **riscala a e b** perché la croma sia l'interpolazione lineare delle due crome (`:321-327`). Così il centro tra blu e arancio resta saturo come gli estremi.
5. Converti in sRGB; se fuori gamut, riduci la croma per bisezione (16 passi) a parità di L e tinta (`:283-299`).
6. Disegna un `linear-gradient` con le 24 fermate, **all'opacità del lavaggio** (0.07/0.11, 0.18/0.22, 0.30/0.40).

**Geometria** (`:88-101`): la linea del gradiente passa per il centro **della finestra** all'angolo dato, lunga `|W·sin a| + |H·cos a|`, esattamente come `linear-gradient(<angle>deg, …)` sul viewport. Colonna, striscia, barra e fondo mostrano ciascuno il proprio pezzo dello **stesso** gradiente, continuo da uno all'altro. In CSS: un solo strato a tutta finestra sotto la chrome, oppure lo stesso gradiente su ogni pezzo con `background-attachment: fixed`.

**Campioni offerti dall'editor** (`:107-115`): 12 tinte a L 0.70, C 0.14, più due neutri:

| Nome | Tinta | Hex | | Nome | Tinta | Hex |
|---|---|---|---|---|---|---|
| Red | 25° | `#E97871` | | Teal | 185° | `#00B7A8` |
| Orange | 55° | `#E0843E` | | Cyan | 215° | `#00B1CE` |
| Amber | 85° | `#C69612` | | Blue | 250° | `#53A3F2` |
| Lime | 125° | `#8BAD42` | | Indigo | 275° | `#8696F5` |
| Green | 150° | `#54B66E` | | Violet | 300° | `#AC89E8` |
| Magenta | 330° | `#CE7CC8` | | Pink | 355° | `#E177A3` |
| Graphite | L .62 C .015 h 260 | `#81868F` | | Sand | L .78 C .045 h 75 | `#C9B498` |

**Preset** (`:119-126`), con 5 fermate calcolate per controllo (forza Subtle; il codice ne usa 24):

| Preset | Colori | Fermate Subtle (0, 25, 50, 75, 100%) | Vivid chiaro | Vivid scuro |
|---|---|---|---|---|
| Sunrise | Amber → Pink | `#C69612 #D88B2B #E67D58 #E87785 #E177A3` | `#C79600 #DE8800 #F96F3A #FA657D #F266A4` | `#9A7300 #AC6800 #CE4701 #CF3D5A #C73F80` |
| Lagoon | Teal → Blue | `#00B7A8 #00B4BD #00B0D5 #32AAE8 #53A3F2` | `#00B7A8 #00B4BD #00B0D5 #00AAF0 #40A3FF` | `#008E82 #008B92 #0088A5 #0084BB #007DD7` |
| Orchard | Lime → Teal | `#8BAD42 #74B25B #55B676 #2FB891 #00B7A8` | `#86B000 #64B73D #25BC68 #00BA90 #00B7A8` | `#678800 #3E9001 #00934C #00906F #008E82` |
| **Dusk** | Indigo → Magenta → Orange | `#8696F5 #AF88E6 #CE7CC8 #E77686 #E0843E` | `#8394FF #B57EFB #DA6ED4 #FA647F #ED7B00` | `#5E6AE3 #9058D2 #B248AD #CF3C5C #B95E00` |
| Glacier | Cyan → Indigo | `#00B1CE #2EACDE #53A5EC #709DF3 #8696F5` | `#00B1CE #00ADE4 #2FA5FF #689CFF #8394FF` | `#0089A0 #0086B2 #007FCF #3D74E1 #5E6AE3` |
| Ember | Red → Amber | `#E97871 #E77C5A #E0843E #D48D24 #C69612` | `#FC6762 #F96D3D #EE7B00 #D88B00 #C79600` | `#D13F3E #CF4609 #B95E00 #A86B00 #9A7300` |

Primo gradiente di uno spazio che aveva un colore (`:130-135`): Blue→Violet, Green→Teal, Orange→Pink, Red→Amber, Violet→Pink; senza colore: Lagoon.

**Grana** (`:389-421`): una piastrella 128×128 pixel mostrata a 64×64 pt (un granello per pixel Retina). Generatore xorshift32 con seme `0x9E3779B9` (`s ^= s<<13; s ^= s>>>17; s ^= s<<5`, tutto in uint32); per pixel `v = s/0xFFFFFFFF·2−1`, alfa `|v|·255`, bianco se v>0 altrimenti nero (premoltiplicato). Opacità: 0.035 chiaro / 0.04 scuro, ×1.25 Rich, ×1.5 Vivid; 0.10 nell'anteprima del selettore. In Electron: generare la piastrella una volta su `<canvas>`, `background: url(data) repeat; background-size: 64px 64px`.

**Selettore "Colour…"** (`:541-818`, larghezza 288, padding 16, sezioni a 16 di distanza): anteprima 76 alta raggio 12 con l'icona dello spazio 20 medium bianca (ombra nera 18% r2 y1) e il nome 11 semibold bianco 92%; sezioni "Colour", "Gradient", "Strength", "Glass" (solo col vetro), "Custom gradient" (pieghevole, chevron 9 semibold). Pallini 22 con anello 1.5 `ink` 75% a 3 pt; controlli segmentati alti 22, fondo `hover` raggio 7 con padding 2, selezionato `ground` raggio 5 con ombra 12% r1 y0.5; direzioni 8 frecce 30×22 (`arrow.up` … `arrow.up.left`).

### 2.7 Vetro della finestra (`Glass.swift`)

Facoltativo (Settings › Appearance › Window › Glass, spento di serie). Strati dal basso:

1. **Sfocatura di ciò che sta dietro la finestra** (`NSVisualEffectView`, materiale `.underWindowBackground`, `behindWindow`, sempre attiva anche a finestra non in primo piano) oppure, con stile "Liquid", un pannello `NSGlassEffectView` `.regular` senza raggio (`:85-163`).
2. **Tinta**: il colore o gradiente dello spazio (già "tonato" per la forza) oppure `frame` se lo spazio non ha colore, a opacità `(1 − Transparency) × 0.31`. Transparency predefinita 0.5 → **0.155** (`:62-74`, `Prefs.swift:1260`).
3. **Grana**: la piastrella di 2.6 a opacità `Grain × 0.113`; Grain predefinita 0.2 → **0.0226** (`:66-79`).

Col vetro la colonna e la barra non dipingono il loro fondo né il loro lavaggio: lo porta il vetro una volta sola. La pagina resta opaca. Mai in schermo intero, mai sotto la colonna ripiegata.

### 2.8 Colori dei temi della scheda vuota (`HomeTheme.swift`, `HomeWalls.swift`, `HomeStickers.swift`)

**Pen (`HomeTheme.swift:223-232`)**: ogni colore dei temi passa da qui.
- Chiaro: invariato; per le scene notturne (Northern Lights, Saturn Rise, Moonscape, City at Night) `c·0.9 + 0.08`.
- Scuro: canali sRGB moltiplicati per **0.42** (scene notturne: **0.8**).

**Gradient preset** (`:144-157`), angolo nel sistema del codice (0 = destra, 90 = giù): **in CSS aggiungere 90°**.

| Preset | Da | A | Angolo codice | CSS | Scuro (×0.42) |
|---|---|---|---|---|---|
| Dusk (predefinito) | `#E9B8A0` | `#8E86B8` | 150 | `240deg` | `#624D43 → #3C384D` |
| Sea | `#BFE0DC` | `#5E8FA8` | 160 | `250deg` | `#505E5C → #273C47` |
| Peach | `#FBE0C8` | `#F0A58F` | 135 | `225deg` | `#695E54 → #65453C` |
| Mint | `#DDF0DC` | `#8FC7AA` | 140 | `230deg` | `#5D655C → #3C5447` |
| Mono | `#F1EFEB` | `#B9B5AE` | 90 | `180deg` | `#656463 → #4E4C49` |

Lunghezza della linea come in CSS (`HomeTheme.swift:427-435`), quindi `linear-gradient(calc(angle + 90deg), A, B)` è esatto.

**Solid colour** (`ThemesPage.swift:170`): `#E8DFD0` (predefinito), `#F3D9CF`, `#D9E4D3`, `#D3DFEA`, `#E4D8EC`, `#2B2B2E`, più selettore libero. In scuro ×0.42 (`#615E57`, `#665B57`, `#5B6059`, `#595E62`, `#605B63`, `#121213`).

**Intensity**: tutto il tema è coperto da `ground` a opacità `1 − intensity` (`HomeTheme.swift:441-444`; per l'immagine `:337`).

**Fondi dei pacchetti di adesivi** (`HomeStickers.swift:80-103`, chiaro / scuro ×0.42):

| Pacchetto | Fondo | Scuro | Palette (5 o 6 colori, sRGB nel codice) |
|---|---|---|---|
| Space | `#E0DBF7` | `#5E5C68` | vedi `:83` |
| Road Trip | `#FAEDD1` | `#696458` | `:85` |
| Ocean | `#D6EDF5` | `#5A6467` | `:87` |
| Jungle | `#E0F2D6` | `#5E665A` | `:89` |
| Street Food | `#FCE8CC` | `#6A6156` | `:91` |
| Retro Tech | `#EBE6D6` | `#63605A` | `:93` |
| Weather | `#E0F0FA` | `#5E6569` | `:95` |
| Music | `#F5E6ED` | `#676064` | `:97` |
| Wonders | `#F7EBD6` | `#68635A` | `:99` |
| Search | `#E6EBFA` | `#606369` | `:101` |

Codici speciali dei livelli: −1 inchiostro (0.20,0.18,0.24), −2 bianco, −3 fondo del pacchetto. I dipinti murali hanno i loro colori sRGB scritti scena per scena (`HomeWalls.swift:143-597`): vanno copiati tali e quali (vedi 8.2).

### 2.9 Dusk: pagine scure per i siti senza tema scuro (`Dusk.swift`, `DuskColours.swift`)

Non riguarda la chrome ma come appaiono i siti col tema scuro. Funziona solo con Search in scuro e l'opzione accesa ("Darken light pages", spenta di serie).

- **Misura**: fotografia della pagina larga 48 px; un pixel è "chiaro" se la luminanza lineare `0.2126R + 0.7152G + 0.0722B > 0.35`; la pagina è chiara se più di metà dei pixel lo sono (`Dusk.swift:149-176`). Dentro la pagina, 9 punti a 1/6, 1/2, 5/6 di larghezza e altezza (`:353-363`).
- **Filtro di ripiego** (`:227-231`): `html { filter: invert(1) hue-rotate(180deg) contrast(.85) }`; immagini, video, canvas, iframe e sfondi fotografici rigirati con `contrast(1.1765) hue-rotate(180deg) invert(1)` (1.1765 = 1/0.85).
- **Gemelli di colore** (`DuskColours.swift:33-51`): per ogni regola CSS della pagina con un colore, una regola gemella con `oklch(from <colore> L' c h / alpha)`, tinta e croma invariate:
  - testo: `L' = max(0.25 + l·0.75, 0.87 − l·0.5)` (il nero diventa 0.87);
  - fondo: `L' = min(l, min(l·0.8, 0.6 − l·0.4) + c·1.2)` (il bianco diventa 0.2; un colore saturo resta più chiaro);
  - bordi: `L' = min(l·0.9, 0.75 − l·0.45)`;
  - su ciò che sta sopra una foto `--office-dusk-keep: 1` annulla lo spostamento.
- Su Windows: lo script è già JavaScript e Chromium supporta la sintassi relativa dei colori, `adoptedStyleSheets` e `CSS.registerProperty`: si porta quasi intero cambiando solo il canale `webkit.messageHandlers` con l'IPC di Electron. Il "Force Dark" nativo di Chromium (`WebContentsForceDark`) dà un risultato diverso: da non usare se si vuole lo stesso aspetto.

---

## 3. Tipografia

### 3.1 Famiglie

| Mac | Dove | Sostituto Windows proposto | Note |
|---|---|---|---|
| SF Pro (`.system`), regolare/medium/semibold/bold | Tutta l'interfaccia | **Inter** (variabile, con asse `opsz`), incorporata nell'app | SF Pro non si può distribuire su Windows. Inter è il parente più stretto. Segoe UI Variable è nativo ma ha un altro carattere. |
| SF Pro Rounded (`design: .rounded`) | Tasti nella pagina di benvenuto, badge `⌘F` nel campo "Find a setting" | Inter con `font-feature-settings` neutri, oppure un rounded open (es. "Nunito") | Due soli usi, testi brevissimi |
| SF Mono (`design: .monospaced`) | Editor CSS "Edit Site Style…" | JetBrains Mono / Cascadia Mono | Un solo uso |
| Font del menu di sistema (`NSFont.menuFont`, 13 pt) | Righe dei menu ricostruiti | Inter 13 | |

**Pesi**: regular 400, medium 500, semibold 600, bold 700.

**Calibrazione (P0).** SwiftUI applica il tracking automatico di SF Pro per ogni dimensione; Inter no ed è un filo più larga. Un dato di taratura è nel codice: a 12,5 pt "Rec…" misura 32 pt e "Wea…" 35 pt (`Design.swift:224-229`). Regolare `letter-spacing` di Inter (indicativamente tra −0.005em e −0.015em sotto i 16 px, tra −0.015em e −0.025em per 22..34 px) finché queste larghezze e quelle di qualche titolo reale coincidono con uno screenshot del Mac. Le larghezze contano: decidono quando una scheda passa da titolo a solo simbolo.

**Resa del testo.** macOS usa antialiasing in scala di grigi senza hinting; Chromium su Windows usa DirectWrite (ClearType su fondi opachi, grigio su strati trasparenti). Il testo sembrerà più nitido e più "sottile" o più "pesante" secondo il monitor: non correggibile del tutto. Tenere il testo della chrome su fondi opachi dove possibile; con il vetro attivo diventa antialiasing in grigio, più vicino al Mac.

### 3.2 Interlinea

SF Pro ha ascendente+discendente ≈ **1.193 em** (Inter ≈ 1.21 em). SwiftUI `lineSpacing(n)` aggiunge n pt tra le righe. In CSS: `line-height = size × 1.193 + lineSpacing`.

| Size | Linea naturale | | Size | Linea naturale |
|---|---|---|---|---|
| 10.5 | 12.5 | | 13.5 | 16.1 |
| 11 | 13.1 | | 14 | 16.7 (+2 benvenuto = 18.7) |
| 11.5 | 13.7 | | 14.5 | 17.3 (+3 benvenuto = 20.3) |
| 12 | 14.3 | | 15.5 | 18.5 |
| 12.5 | 14.9 | | 17 | 20.3 |
| 13 | 15.5 | | 22 / 26 / 34 | 26.3 / 31.0 / 40.6 |

Per etichette su una riga in un contenitore ad altezza fissa basta `line-height: 1.2` e centratura verticale con flex.

### 3.3 Tabella per elemento

**Barra laterale (colonna)**

| Elemento | Size | Peso | Colore | File:riga |
|---|---|---|---|---|
| Titolo scheda | 12.5 (Roomier tabs: 14) | regular | attiva: `ink`; altre: `Greys.muted`; al passaggio: `ink` 70%; alto contrasto: `ink` | `Side.swift:2154`, `Prefs.swift:304`, `Side.swift:2318-2324` |
| Riga "New tab" | 12.5 (14) | regular | `Greys.faint`, al passaggio `ink` 70% | `Side.swift:1652`, `:2341-2353` |
| Icona `plus` di "New tab" | 10 | medium | come sopra, box 15 | `Side.swift:2345` |
| Lettera del sito (`Mark`) | size × 0.56 (15 → 8.4) | medium | `muted` (alto contrasto: `ink`) | `Icons.swift:781` |
| Lettera del pin | scala×12/34 (12 a 34 pt) | medium | `muted`; attivo/passaggio: `ink` / `ink` 70% | `Side.swift:1948` |
| Indirizzo "a riposo" (dominio registrabile) | 12.5 | medium (regular per file/altro) | `ink`; sottodominio, porta, "Not secure" in `muted` | `AtRestLine.swift:35-71` |
| × di chiusura | 8 | semibold | `muted` su disco 15 `ink` 7% | `Side.swift:2226-2229` |
| Speaker | 8 | (fill) | `muted` | `Side.swift:2427` |
| Simboli piccoli (flask, eye.slash) | 9 | regular | colore titolo 70% | `Side.swift:2135-2143` |
| `record.circle` | 10 | regular | colore titolo 80% | `Side.swift:2147-2149` |
| Linea "Clear" | 11 (freccia 8 semibold) | regular | `muted` | `Side.swift:2392-2395` |
| Barra indirizzi fissa | 12 | regular | `muted`; vuota "Search or enter address" in `faint` | `AddressLine.swift:66-86` |
| Nome dello spazio (dopo il cambio) | 11.5 | medium | `ink` su capsula `ground` | `Spaces.swift:946` |
| Numero ⌘1…9 | 11 cifre tabulari | medium | `ink` 65% | `TabShortcutHint.swift:19` |
| Contatore sul pin | max(7, icona×0.45) cifre tabulari | bold | bianco su `#ED3D36` | `UnreadBadge.swift:45` |

**Striscia in alto**: titolo 12.5 regular (stessi colori), lettera del pin 12 medium, `plus` 10 medium `muted` (`TabBar.swift:1012`, `:1166`, `:243`).

**Campo indirizzi (⌘L/⌘T, scheda vuota)**: testo 15.5 regular `ink` (`Omnibox.swift:511`); segnaposto 15.5 `ink` 30% (`:579-587`); chip del sito 13 medium (`:353`); righe dei suggerimenti: indirizzo 13 `ink`, titolo 12 `muted`, simboli 10 medium `muted`, scorciatoia 12 `muted`, tasto "Tab" 11 medium `muted` (`:262-308`, `:378-379`). Campo nella scheda (modifica in linea): 12.5 (`TabBar.swift:1639`). Campo del pin: 12 medium centrato (`TabBar.swift:2506`).

**Menu ricostruiti** (`SiteCard.swift:810-842`): 13 (font di menu), intestazione 11 semibold `secondaryLabel`, chevron 10 semibold.

**Pannelli (`Plate.swift`)**: titolo card 17 semibold; titolo in una scheda 22 semibold; riga 13 `ink`; dettaglio 11.5 `muted`; didascalia 11.5 medium `muted`; campo di ricerca 13 (lente 11 medium); vuoto 13 `muted`; azione rapida 11.5 (`:44`, `:68`, `:168-173`, `:192`, `:207-218`, `:240`, `:265`).

**Impostazioni** (`Settings.swift`): "Settings" 13 semibold (`:168`); "Find a setting" 12.5 con lente 11 medium e `⌘F` 10.5 rounded (`:213-229`); righe della barra 13 (medium se scelte), icona 12 medium, conteggio 10.5 medium (`:260-267`); titolo della sezione 17 semibold con icona 15 medium (`:304-308`); titolo gruppo 10.5 semibold MAIUSCOLO tracking 0.5 `ink` 62% (`:1255-1260`); riga: icona 12 medium `ink` 78%, titolo 13 `ink`, dettaglio 11.5 `muted` max 2 righe, (i) 10.5 `muted` 80% (`:1285-1316`); controlli: Pill 11.5, Segmented 11.5 (medium se scelto), Steps 11.5 cifre tabulari, "Always on" 11 (`:1343`, `:1555`, `:1638`, `:1690`).

**Scheda vuota / temi**: tile dei preferiti "Home" 12 `muted` (`HomeGrid.swift:40`); riga iPhone 11.5 (`IPhoneAsk.swift:133`); pagina Temi: etichette 12 `muted`, valori 11 cifre tabulari, nomi miniature 11.5 (medium se scelte) (`ThemesPage.swift:157`, `:287`, `:296`).

**Benvenuto, Novità, Informazioni**: vedi capitolo 8 (dimensioni per ogni testo).

---

## 4. Misure

### 4.1 Finestra e impaginazione generale

| Misura | Valore | File:riga |
|---|---|---|
| Finestra nuova | 1180 × 780 (popup 480 × 600); minimo 200 × 150 | `Windows.swift:260-277` |
| Raggio della finestra (macOS 26, senza toolbar) | **17.5** (con toolbar sarebbe 31.5: per questo la finestra non ne ha) | `Lights.swift:6-13` |
| Striscia superiore (`Metrics.strip`) | **52**; 36 con "Shorter tab bar" e schede in alto | `Design.swift:166-168` |
| Fascia di schede e pulsanti dentro la striscia | 30, centrata (sopra e sotto è barra del titolo trascinabile) | `TabBar.swift:18` |
| Semafori | centro del primo a x 26, y = strip/2; occupano da x 19 a x 79 (14 di diametro, passo 23) | `Lights.swift:20`, `Design.swift:174-177` |
| Semafori impilati (colonna di icone) | centro del primo a 22 dall'alto, fascia 80 | `Lights.swift:128`, `SideIcons.swift:27` |
| Inizio delle schede in alto | x 100 (12 a schermo intero) | `Design.swift:177`, `TabBar.swift:9` |
| Pagina come scheda ("cards", predefinito con barra laterale) | margine **8** a destra, in basso e in alto; a sinistra la pagina parte dal bordo della colonna; raggio **10** | `Design.swift:172-173`, `App.swift:741-765` |
| Bordo e ombra della scheda | filo 1 pt `primary` 8% (nero / bianco); ombra nera 7% raggio 6 y 1 | `Design.swift:549-575` |
| Pannello laterale delle estensioni | 300..640, predefinito 380, almeno 320 di pagina accanto, minimo 240 | `SidePanel.swift:58`, `App.swift:775-781` |

Struttura predefinita (barra laterale + carte), da sinistra: colonna larga 232 su fondo `frame`, con in alto la fascia di 52 che contiene semafori e Indietro/Avanti/Ricarica; poi la pagina bianca a scheda con 8 pt di fondo `frame` sopra, a destra e sotto. Senza carte: colonna su `ground` con filo `hairline` sul lato interno, pagina bordo a bordo. Con le schede in alto: striscia di 52 su `ground`, pagina sotto, niente carte.

### 4.2 Barra laterale

| Misura | Valore | File:riga |
|---|---|---|
| Larghezza | predefinita **232**, minima **176**, massima **440**; sotto **200** diventa striscia di icone se "Narrow to icons" | `Design.swift:251-256` |
| Colonna di sole icone | larghezza fissa **52**, tile 32 | `SideIcons.swift:20-28` |
| Margine orizzontale interno | 10 | `Side.swift:293` |
| Riga scheda | alta **28** (Roomier: 36); padding sinistro 10, destro 10; spazio tra icona e titolo 8; **raggio 9**; 2 tra le righe | `Prefs.swift:303`, `Side.swift:2118-2163`, `:87` |
| Icona del sito | 15 (Roomier 17), raggio size×0.22 | `Side.swift:2122` |
| Fondo riga | attiva `Greys.wash`; selezionata `Greys.wash` + contorno `ink` 35%; al passaggio `Greys.hover` | `Side.swift:2299-2316` |
| Dissolvenza del titolo sotto la × | solo al passaggio del puntatore: maschera piena, poi gradiente opaco→trasparente largo 16, poi 26 trasparenti a destra; il titolo non si accorcia | `Side.swift:2205-2219` |
| Pulsante di chiusura | disco 15, area cliccabile 30 × altezza riga, 7 dal bordo destro | `Side.swift:2221-2240` |
| Pin (quadrati) | cella alta al massimo **34**, fino a **4 per riga**, distanza 4, le righe riempiono la larghezza (`width − 20`), righe bilanciate, una sola riga tiene almeno 3 posti; raggio 9 a 34 (scala×9/34); simbolo in box 16 | `Side.swift:89-90`, `:1064-1096`, `:1952-1977` |
| Fascia superiore | 52 di altezza: semafori, poi i tre pulsanti; Indietro comincia a x **90** dal bordo della colonna (10 di margine + 80; si stringe fino a 72 + 10 se la colonna è stretta); con "Sidebar button" una porta in più (26 + 4) prima di Indietro | `Design.swift:189-192`, `Side.swift:178-196`, `:250-262` |
| Pulsante ("Door") | **26 × 26**, raggio **8**, simbolo 11 medium; colori: `muted`, al passaggio `ink` 70% su `Greys.hover`, acceso `ink` su `Greys.wash`; distanza 4 | `Side.swift:2441-2498`, `TabBar.swift:790` |
| Piede | porte 26 con 10 sotto (`footBox` 36), distanza 2 | `Side.swift:161`, `:1735-1753` |
| Linea "Keep" (tra fissate e del giorno) | alta 18, filo `hairline` 1, margine 10 | `Side.swift:2373-2406` |
| Maniglia del bordo | pillola larga 4, lunga 28 (40 al passaggio/trascinamento), `faint` → `muted`, visibile solo col puntatore sul bordo; area attiva larga 9 | `Design.swift:264-286`, `Side.swift:438-446` |
| Gruppi | righe rientrate di 14 a sinistra | `Side.swift:1458` |
| Tile della colonna di icone | 32 × 32, raggio 9, puntino rosso 6 con anello `ground` 1, speaker in disco 13 | `SideIcons.swift:129-190`, `:246-265` |
| Coppia Split View (icone) | contenitore raggio 10 + filo; metà attiva raggio 9 con 2 di margine | `SideIcons.swift:291-330` |

### 4.3 Striscia di schede in alto (`TabBar.swift`, `Design.swift:205-247`)

| Misura | Valore |
|---|---|
| Larghezza scheda | **186** fissa; sotto **104** solo simbolo; minimo **36**; distanza **2** |
| Parti della scheda con titolo | aria sinistra 11, simbolo 15, spazio 6, titolo, spazio 6, molla ≥2, spazio 6, slot × 15, aria destra 7 (totale fisso 68 + titolo ≥36) |
| Altezza | 16 + 6 + 6 = 28 dentro la fascia di 30 |
| Pin | quadrato largo 30, simbolo 16 |
| Pulsante + | 15 + 7·2 di padding, raggio 9, visibile solo col puntatore nella striscia (scala 0.7→1, opacità) |
| Separatore pin/schede | filo 1 × 20 `hairline` |
| Margine finale libero | 40 (per trascinare la finestra) |
| Fondo scheda | attiva `Greys.wash` (pin attivo `pinLive`); al passaggio `hover`; pin a riposo e schede ridotte al simbolo `tile`; raggio 9 |
| Campo in modifica | largo fino a 340 |

### 4.4 Campo indirizzi, suggerimenti, barra fissa

| Misura | Valore | File:riga |
|---|---|---|
| Larghezza campo | **560** (o larghezza disponibile − 28) | `Design.swift:249`, `Omnibox.swift:66` |
| Altezza campo | testo 22 + 14 sopra e sotto = **50**; padding orizzontale 22 | `Omnibox.swift:31`, `:137-140` |
| Raggio e bordo | 14, filo `hairline` 1 (rosso 35% se rifiutato) | `Omnibox.swift:151-161` |
| Ombra | nera 6% raggio 24 y 8 | `Omnibox.swift:163` |
| Posizione | centrato nella pagina (non nella finestra) e alzato di 30 (padding inferiore 60); con "field in the middle of the window" in alto al **24%** dell'altezza | `Omnibox.swift:114-115`, `:68-70`, `App.swift:894-912` |
| Velo sopra una pagina (⌘L) | `ground` al **74%** | `Omnibox.swift:90` |
| Lista | 8 sotto il campo (offset 58), padding 6, raggio 14, filo, ombra nera 7% raggio 20 y 6 | `Omnibox.swift:103-108`, `:207-213` |
| Riga suggerimento | padding 12/9, spazio 10, colonna icona 14 × 14, scelta `wash` raggio 9, passaggio `hover` raggio 9 | `Omnibox.swift:258-300` |
| Chip del sito | alto 22, padding 8, `wash`, raggio 7, icona 14 raggio 3 | `Omnibox.swift:347-364`, `:334-335` |
| Tasto "Tab" | alto 18, padding 6, filo raggio 5 | `Omnibox.swift:378-383` |
| Barra indirizzi fissa | altezza della riga (28), `Greys.hover` raggio 9, padding 10 / 4; in alto larga 220 (Small) o 340 (Medium) + 8 d'aria | `AddressLine.swift:30-35`, `:44`, `:66-91` |
| Pulsante impostazioni sito | 22 × 22, `slider.horizontal.3` 11 medium | `AddressLine.swift:130-139` |

### 4.5 Barra dei preferiti (`BookmarksBar.swift:27-205`)

Alta 30, distanza 2, aria 10; voce alta 22, padding 8, raggio 6, `hover` al passaggio; titolo 12 `ink` max 150; icona 13; cartella `folder` 10.5 `muted` con `chevron.down` 7.5 semibold `faint`; "»" `chevron.right.2` 9 semibold 22×22. Fondo `ground` (o `frame` con le carte) e filo inferiore solo senza carte. Nella colonna: righe come le schede (altezza riga, raggio 9), testo `ink` 75%.

### 4.6 Pannelli e controlli

| Componente | Misure | File:riga |
|---|---|---|
| Plate (card sopra la pagina) | larga 560 (Novità 460, Note 560, CSS 420×220), padding 22, titolo in alto 18 / sotto 14, raggio **16**, filo, ombra nera 16% raggio 34 y 12; piede sotto un filo con 18 sopra e 14 di padding verticale | `Plate.swift:64-98` |
| Plate in una scheda | titolo 22 semibold, 44 sopra, 20 sotto, padding orizzontale 22, colonna larga quanto la card, in cima e al centro | `Plate.swift:41-62` |
| Velo dietro i pannelli | nero 10% | `App.swift:1234` |
| Card (gruppo di righe) | raggio **11**, filo, fondo `ground` | `Plate.swift:113-125` |
| Rule | filo 1, rientro 14 (0 nelle impostazioni) | `Plate.swift:129-139` |
| Line | padding 14 / 11, spazio 16 | `Plate.swift:153-184` |
| Hunt (cerca nella lista) | padding 12 / 8, `wash` raggio 10 | `Plate.swift:199-232` |
| Quick | padding 8 / 4, capsula `wash` | `Plate.swift:249-275` |
| Pill | padding 10 / 5, capsula; piena: fondo `ink`, testo `ground`; vuota: `ground` (al passaggio `hover`) + filo | `Settings.swift:1676-1702` |
| Switch | capsula 30 × 18, `ink` acceso / `faint` spento; pomello `ground` 14 con 2 di margine e ombra nera 18% raggio 1.5 y 1 | `Settings.swift:1598-1615` |
| Segmented | fondo `wash` raggio 9 padding 2; voce padding 10 / 5; scelta `ground` raggio 7, ombra nera 8% raggio 3 y 1 | `Settings.swift:1541-1578` |
| Steps (− valore +) | capsula alta 24 con filo; pulsanti cerchio 20; valore largo almeno 36 | `Settings.swift:1617-1672` |
| Pictures (scelte con disegnino) | miniatura 76 × 50 raggio 7 + filo; 3 di margine; anello `ink` 2 raggio 9.5 | `Settings.swift:1353-1388` |
| Impostazioni in una scheda | barra sezioni larga **196**, padding 8, fondo `wash` 45%; colonna contenuti max **600**; contenuto 26 + 18 dall'alto, padding 24; sezioni a 22; riga della barra alta 30 raggio 8, scelta `ground` con ombra nera 6% raggio 3 y 1; separatori tra blocchi filo con 10 / 7 | `Settings.swift:98-293` |
| Impostazioni come card (vecchio) | 720 × 540, raggio 16, ombra come Plate | `Settings.swift:140-156` |
| SettingRow | piastrella icona 26 × 26 `wash` raggio 7; spazio 12; padding 14 / 10; controllo largo sotto con rientro 38; testo a **52** dal bordo (textInset) | `Settings.swift:1270-1336`, `:104-107` |
| GroupBlock | titolo e card a 8 di distanza | `Settings.swift:1246-1264` |
| Bolla del link | alta 26, capsula `ground` + filo, ombra nera 8% raggio 12 y 3, larga al massimo 60% (≤ 640), a 10 da sinistra e dal basso, passa a destra se il puntatore è lì | `StatusLine.swift:121-157` |
| Pillola di modalità | capsula `ink` 92%, testo `ground` 92% 11.5, padding 15 / 9, ombra nera 18% raggio 18 y 6 | `App.swift:1213-1220` |
| Avviso (es. download) | capsula `ground` + filo, 12, padding 15 / 9, ombra nera 10% raggio 18 y 6 | `App.swift:1195-1206` |
| Barra di ricerca nella pagina | capsula `ground` + filo, padding 16 / 8, a 12 dall'alto e 14 da destra, ombra nera 10% raggio 18 y 5, pulsanti 24 × 24 | `Find.swift:52-118` |
| Anteprima (Peek) | raggio 12, ombra nera 25% raggio 30 y 10 | `Peek.swift:213-235` |
| Menu ricostruito | riga 24, separatore 11 (filo a 16 dai lati), 5 sopra e sotto, evidenziazione a 5 dal bordo raggio 6, testo a 17, coda 17, raggio menu **12** | `SiteCard.swift:810-828` |

### 4.7 Raggi e concentricità

Tutti con `style: .continuous` (squircle) salvo dove indicato.

| Annidamento | Esterno | Distanza | Interno | Concentrico? |
|---|---|---|---|---|
| Finestra (macOS 26) → pagina-scheda | 17.5 | 8 | 10 | quasi (ideale 9.5) |
| Campo indirizzi / lista → righe | 14 | 6 | 9 | no (ideale 8) |
| Segmented → voce scelta | 9 | 2 | 7 | **sì** |
| Forza / direzioni nel selettore colore | 7 | 2 | 5 | **sì** |
| Miniatura tema → anello di selezione | 10 | 3 | 13 | **sì** |
| Pictures → anello | 7 | 3 | 9.5 (filo 2) | quasi (ideale 10) |
| Coppia di icone → metà attiva | 10 | 2 | 9 | no (ideale 8) |
| Menu → evidenziazione | 12 | 5 | 6 | no (ideale 7) |
| Pagina di benvenuto, card "Way" → disegnino | 14 | 10 | 8 | no (ideale 4) |
| Plate 16 → Card 11 | 16 | 22 | 11 | non annidati stretti |

Altri raggi: righe, pin, porte della striscia **9**; porte 26×26 **8**; preferiti 6; anteprima temi in Impostazioni 12; card Home grid 14 (cerchio, non continuo); icona del sito size × 0.22; icona app 22.37% della piastra (arco circolare, non continuo).

**Su Windows il nodo è la finestra**: Windows 11 arrotonda le finestre a **8** pt e non permette altri valori con la cornice nativa. Con 8 di margine una scheda concentrica avrebbe raggio 0. Per avere 17.5 → 10 come sul Mac serve una finestra senza cornice e trasparente con angoli e ombra disegnati da noi (vedi D1).

**Angoli continui in CSS.** `border-radius` disegna archi di cerchio. Chromium ≥ 139 (Electron ≥ 38) ha `corner-shape`: punto di partenza `border-radius: calc(r × 1.528); corner-shape: superellipse(1.7)` (1.528 è l'estensione della curva continua di Apple rispetto al raggio nominale; 1.7 fa passare la diagonale dove passa l'arco di Apple), da tarare sovrapponendo uno screenshot. Sotto i 10 px la differenza è di mezzo pixel: si può restare su `border-radius` semplice. Le capsule restano `border-radius: 9999px`.

### 4.8 Ombre (con conversione CSS)

Regola di conversione: il raggio d'ombra di SwiftUI/Core Animation è circa la deviazione standard; il valore "blur" di CSS è il doppio. Quindi `shadow(color, radius r, y)` → `box-shadow: 0 y (2r)px color`. Da verificare a occhio su screenshot (P1).

| Dove | SwiftUI | CSS proposto |
|---|---|---|
| Pagina-scheda | nero 7%, r 6, y 1 | `0 1px 12px rgba(0,0,0,.07)` |
| Plate, Impostazioni card | nero 16%, r 34, y 12 | `0 12px 68px rgba(0,0,0,.16)` |
| Campo indirizzi | nero 6%, r 24, y 8 | `0 8px 48px rgba(0,0,0,.06)` |
| Lista suggerimenti | nero 7%, r 20, y 6 | `0 6px 40px rgba(0,0,0,.07)` |
| Colonna ripiegata che esce sopra la pagina | nero 14%, r 20, x ±4 (verso la pagina) | `4px 0 40px rgba(0,0,0,.14)` (−4px con la colonna a destra) |
| Striscia ripiegata che scende sopra la pagina | nero 14%, r 20, y 4 | `0 4px 40px rgba(0,0,0,.14)` |
| Scheda trascinata (riga / striscia) | nero 16% r 10 y 3 · nero 14% r 12 y 4 | `0 3px 20px rgba(0,0,0,.16)` · `0 4px 24px rgba(0,0,0,.14)` |
| Bolla link | nero 8%, r 12, y 3 | `0 3px 24px rgba(0,0,0,.08)` |
| Nome dello spazio | nero 10%, r 10, y 3 | `0 3px 20px rgba(0,0,0,.10)` |
| Avviso / ricerca nella pagina | nero 10%, r 18, y 6 / y 5 | `0 6px 36px rgba(0,0,0,.10)` |
| Pillola di modalità | nero 18%, r 18, y 6 | `0 6px 36px rgba(0,0,0,.18)` |
| Peek | nero 25%, r 30, y 10 | `0 10px 60px rgba(0,0,0,.25)` |
| Voce scelta del segmented | nero 8%, r 3, y 1 | `0 1px 6px rgba(0,0,0,.08)` |
| Riga scelta nella barra delle impostazioni | nero 6%, r 3, y 1 | `0 1px 6px rgba(0,0,0,.06)` |
| Pomello dello switch | nero 18%, r 1.5, y 1 | `0 1px 3px rgba(0,0,0,.18)` |
| Card nuovo spazio sopra la pagina | nero 12%, r 18, y 6 | `0 6px 36px rgba(0,0,0,.12)` |
| Avanzamento importazione | nero 8%, r 16, y 5 | `0 5px 32px rgba(0,0,0,.08)` |
| Icona dell'app | nero 18%, sfocatura 24/1024, giù 10/1024 | in SVG `feDropShadow` |

In scuro le ombre restano nere con la stessa opacità (quasi invisibili, come sul Mac).

### 4.9 Spessori

Fili sempre **1 pt** (`strokeBorder(lineWidth: 1)`); eccezioni: bordo della lente Liquid Glass 0.5 (`LiquidTab.swift:236`), bordo del menu 0.5, anello dei campioni 1.5 (`SpaceGradient.swift:525`), anello delle miniature 2 / 2.5, anello di caricamento 1.4, disco di avanzamento download 1.5, linea di caricamento 2, freccia del programma d'installazione 1.5. Su Windows a 125%/150% i fili da 1 px vengono arrotondati a pixel interi da Chromium: accettabile.

---

## 5. Materiali: vetro, sfocature, vibrancy, e come imitarli su Windows 11

**Premessa importante.** Di serie Search **non usa trasparenze**: chrome opaca, popover su `ground` opaco anche su macOS 26 (`Design.swift:527-540`), veli piatti (74% `ground`, 10% nero). I materiali entrano in gioco solo in quattro casi. Questo rende il porting più semplice del previsto.

| # | Materiale Mac | Dove | Su Windows (Electron) | Risultato atteso |
|---|---|---|---|---|
| M1 | `NSVisualEffectView` `.underWindowBackground`, `behindWindow`, sempre attivo | Vetro della finestra, stile Frosted (`Glass.swift:118-128`) | `BrowserWindow` con `backgroundMaterial: 'acrylic'` (Windows 11 22H2+), fondo della chrome trasparente, sopra in CSS la tinta (2.7) e la grana | Molto vicino. Differenze: l'Acrylic di Windows ha una sua luminosità e un rumore propri; quando la finestra non è in primo piano Windows lo sostituisce con un colore pieno (il Mac lo tiene vivo). Su Windows 10: niente, si ripiega sull'opaco |
| M2 | `NSGlassEffectView` `.regular` | Vetro stile Liquid (`Glass.swift:154-163`) | Acrylic come M1 + in CSS un bordo luminoso: `box-shadow: inset 0 0 0 .5px rgba(255,255,255,.35), inset 0 1px 0 rgba(255,255,255,.25)` e un velo `linear-gradient(180deg, rgba(255,255,255,.06), transparent 40%)` | Approssimato: la rifrazione del Liquid Glass sul desktop non è riproducibile |
| M3 | `NSGlassEffectView` `.clear`, raggio 9; in chiaro tinta nero 7% e filo nero 12% da 0.5 | Scheda attiva come lente di vetro (`LiquidTab.swift`) | Tutto dentro la chrome (le righe sono HTML): `backdrop-filter: url(#lente) saturate(1.4) brightness(1.04)` dove `#lente` è un filtro SVG `feDisplacementMap` (Chromium accetta `url()` in `backdrop-filter`, Safari no); tinta e filo come sul Mac; movimento con la molla di 6.3 | Buono: è l'unico vetro che può somigliare davvero, perché sfoca contenuti della chrome stessa |
| M4 | `NSVisualEffectView` `.menu`, raggio 12, filo 0.5, maschera arrotondata, ombra di finestra | Scheda del sito (`SiteCard.swift:163-186`); i menu contestuali nativi | Una finestra figlia senza cornice (come fa il Mac con un `NSPanel` figlio) con `backgroundMaterial: 'acrylic'`, angoli 8 di Windows o disegnati; oppure un livello HTML opaco `rgba(246,246,246,.96)` / `rgba(40,40,40,.96)` | Vicino. I menu contestuali nativi di Electron hanno l'aspetto di Windows: per l'identico vanno ricostruiti in HTML con `MenuMetrics` (4.6) |

**Vincolo di architettura (Electron).** Le pagine web stanno in `WebContentsView` separate, composte come superfici distinte: un `backdrop-filter` della chrome **non vede** i pixel della pagina. Tutto ciò che sta sopra la pagina (campo con velo 74%, liste, barra di ricerca, bolla del link, popover, colonna ripiegata con la sua ombra, Peek, pannelli col velo 10%) va in una vista trasparente posta sopra la pagina, e può usare solo colori piatti e ombre: per fortuna è esattamente ciò che fa il design. Gli angoli arrotondati della pagina-scheda si ottengono con `View.setBorderRadius()` (Electron recenti; arco circolare, accettabile a 10).

**Mica** (Windows 11) campiona solo lo sfondo del desktop, non le finestre dietro: non corrisponde a niente su Mac. Da non usare, salvo come ripiego per il vetro su macchine dove Acrylic è lento.

---

## 6. Animazioni

### 6.1 Le tre animazioni di base (`Motion`, `Design.swift:294-417`)

SwiftUI `spring(response, dampingFraction)` = massa 1, rigidezza `(2π/response)²`, smorzamento `4π·dampingFraction/response`. Le curve sotto sono campionate dalla soluzione esatta (24 punti; in produzione generarne 40..60 da una funzione JS, oppure usare una libreria a molle con questi parametri).

| Nome | Mac | Rigidezza / smorzamento | Si assesta (0.1%) | Rimbalzo | CSS |
|---|---|---|---|---|---|
| `glide` (cose che si spostano: grigio della scheda attiva, colonna, pagine del benvenuto) | spring 0.34 / 0.82 | 341.5 / 30.31 | 467 ms | +1.1% | `467ms linear(0, 0.0530, 0.1737, 0.3204, 0.4674, 0.6003, 0.7126, 0.8026, 0.8716, 0.9223, 0.9579, 0.9817, 0.9967, 1.0053, 1.0096, 1.0110, 1.0108, 1.0096, 1.0080, 1.0064, 1.0048, 1.0035, 1.0024, 1.0016, 1)` |
| `settle` (cose che arrivano o vanno: righe, switch, segmented, pannelli) | spring 0.30 / 0.86 | 438.6 / 36.02 | 418 ms | +0.5% | `418ms linear(0, 0.0540, 0.1753, 0.3207, 0.4647, 0.5939, 0.7026, 0.7897, 0.8568, 0.9066, 0.9423, 0.9671, 0.9835, 0.9939, 1.0000, 1.0033, 1.0047, 1.0050, 1.0047, 1.0041, 1.0033, 1.0026, 1.0020, 1.0014, 1)` |
| `quick` (passaggi del puntatore, dissolvenze) | easeOut 0.14 s | | 140 ms | | `140ms cubic-bezier(0, 0, .58, 1)` (= `ease-out` del CSS) |

`linear()` richiede Chromium ≥ 113: presente in ogni Electron recente.

**Modalità**:
- *Reduce motion* di sistema (su Windows "Effetti di animazione" spento → `prefers-reduced-motion: reduce`) o "Reduce animations" di Search: transizioni istantanee (`Motion.reduced`, `:297-299`). Con "Reduce animations" spariscono anche le dissolvenze (`instant`).
- *Light motion* (Settings › General, con Risparmio energia o Mac caldo): glide e settle diventano `easeOut 0.16 s` (`:335-364`). Su Windows: `powerMonitor` (batteria / risparmio energia).

### 6.2 Altre animazioni

| Cosa | Mac | CSS / JS | File:riga |
|---|---|---|---|
| Colonna o striscia che esce sopra la pagina | spring 0.14 / 0.86 (2014 / 77.2, ~195 ms) | `195ms linear(0, 0.0539, 0.1752, 0.3205, 0.4645, 0.5937, 0.7024, 0.7896, 0.8567, 0.9065, 0.9422, 0.9670, 0.9834, 0.9938, 1.0000, 1.0033, 1.0047, 1.0050, 1.0047, 1.0041, 1.0033, 1.0026, 1.0020, 1.0014, 1)` | `Design.swift:381-383` |
| ...e che rientra | spring 0.13 / 1.0 (2336 / 96.7, ~191 ms, senza rimbalzo) | `191ms linear(0, 0.0575, 0.1802, 0.3207, 0.4550, 0.5728, 0.6710, 0.7500, 0.8121, 0.8600, 0.8965, 0.9240, 0.9444, 0.9596, 0.9707, 0.9789, 0.9848, 0.9891, 0.9922, 0.9944, 0.9960, 0.9972, 0.9980, 0.9986, 1)` | idem |
| "Slide the column in and out" | uscita easeOut 0.26 s, rientro easeIn 0.22 s; con Reduce Motion dissolvenza 0.2 s | `260ms cubic-bezier(0,0,.58,1)` / `220ms cubic-bezier(.42,0,1,1)` | `Design.swift:398-416` |
| Barra sezioni delle impostazioni (bianco che scende) | spring 0.45 / 0.72 (195 / 20.1, ~723 ms, +3.8%) | `723ms linear(0, 0.0720, 0.2326, 0.4206, 0.5990, 0.7488, 0.8633, 0.9437, 0.9950, 1.0236, 1.0361, 1.0382, 1.0344, 1.0278, 1.0206, 1.0139, 1.0085, 1.0044, 1.0016, 0.9999, 0.9989, 0.9986, 0.9986, 0.9987, 1)` | `Settings.swift:198-200` |
| Piede della colonna che sale | `timingCurve(.25,.1,.25,1)` 0.45 s | `450ms ease` (identico) | `Side.swift:157-159` |
| Porte in alto che spariscono / tornano | easeIn 0.1 s / easeOut 0.5 s con 0.1 s di ritardo | `100ms ease-in` / `500ms ease-out 100ms` | `Side.swift:148-154` |
| Scheda che cede sotto il clic ("Tabs give") | scala 0.97 con `quick`, ritorno con `settle` | `transform: scale(.97)` | `TabBar.swift:2208-2217`, `Design.swift:372` |
| Scossa del campo rifiutato | `x = sin(t·6π) · 7 · (1−t)`, t da 0 a 1 in easeOut 0.5 s | Web Animations API con ~30 keyframe calcolati: per ogni istante u, `t = easeOut(u)`, poi x | `Design.swift:498-515` |
| Respiro sotto il campo (scheda vuota senza tema) | ombra d'inchiostro opacità 7%, raggio 26, forma rettangolo arrotondato 26 grande quanto il campo; scala 0.97→1.03 e opacità 0.65→1, 2.6 s per verso, avanti e indietro, easeInEaseOut, infinito; fermo con Reduce Motion | `@keyframes` su un `::before` con `box-shadow: 0 0 52px rgba(ink,.07)`, `2.6s cubic-bezier(.42,0,.58,1) infinite alternate` | `Omnibox.swift:424-497` |
| Anello di caricamento | 10 pt (11 sui pin), tratto 1.4 arrotondato, arco 78%, `muted` 70%, un giro ogni 0.85 s in senso orario, lineare | SVG `stroke-dasharray`, `animation: spin .85s linear infinite` | `TabBar.swift:2417-2490` |
| Riempimento di lettura | larghezza = frazione letta, easeOut 0.15 s | `transition: width 150ms ease-out` | `Tab.swift:276-286` |
| Titolo ↔ indirizzo a riposo | dissolvenza easeInOut 0.22 s | `220ms cubic-bezier(.42,0,.58,1)` | `AtRestLine.swift:116` |
| Icona dello spazio che cambia | transizione "push" dal lato dello spostamento, easeOut 0.22 s; nome visibile 1.4 s | | `Spaces.swift:909-933`, `:978` |
| Righe che arrivano / vanno | scala 0.94 dal bordo sinistro + opacità (colonna); 0.9 (striscia); con `settle` | | `Side.swift:2286`, `TabBar.swift:1081` |
| Campo che compare | scala 0.97 + opacità; lista: scala 0.98 dall'alto + opacità con `quick` | | `Omnibox.swift:116-121`, `:214` |
| Pannelli | scala 0.97 + opacità, velo in dissolvenza | | `App.swift:1238` |
| Pagine del benvenuto | spostamento ±40 + opacità con `glide` | | `Welcome.swift:74-83` |
| Bolla del link | easeOut 0.12 s; sparisce 0.12 s dopo l'uscita dal link | | `StatusLine.swift:90`, `:155` |
| Contatore sui pin | scala 0.6 + opacità con `quick` | | `UnreadBadge.swift:77` |
| Pulsante download che pulsa all'avvio | keyframe cubici (vedi `Fetching.swift:745-752`) | | `Fetching.swift:745` |

### 6.3 La lente Liquid Glass (`LiquidTab.swift:126-215`)

Molla propria, integrata a ogni fotogramma (da portare 1:1 in JS con `requestAnimationFrame`):
- 4 canali (centro x, centro y, larghezza, altezza); `forza = 320·(meta − posizione) − 27·velocità`; `velocità += forza·dt`; `posizione += velocità·dt`; `dt` del primo passo 1/120, poi al massimo 1/30.
- Ferma quando per ogni canale `|meta − posizione| ≤ 0.25` e `|velocità| ≤ 4`.
- Equivale a una molla con ω₀ 17.9 rad/s e smorzamento 0.755 (risposta ≈ 0.35 s).
- Deformazione: `veloce = √(vx² + vy²)`; `s = min(0.12, veloce/10000)`; se il moto è più verticale `scaleX = 1 − 0.6s, scaleY = 1 + s`, altrimenti il contrario.
- Il secondo pannello, sopra le righe, ha opacità `min(1, veloce/600)` e c'è solo mentre si muove.
- Non viaggia tra spazi diversi, né la prima volta, né con Reduce Motion: compare al suo posto.

---

## 7. Icone

### 7.1 Come sono fatte

Tutte le icone dell'interfaccia sono **SF Symbols** disegnati come testo (`Image(systemName:)` con `.font(.system(size:weight:))`), monocromi, nel colore del testo. Nessuna icona colorata, salvo le favicon dei siti.

Per ricostruirle su Windows (vedi nota legale in 0): set open source dal tratto simile (**Lucide** come base, **Phosphor** per i pieni), oppure icone disegnate apposta nello stile SF. Il tratto di un simbolo SF dipende da dimensione e peso; regola pratica per Lucide (viewBox 24, tratto 2 di serie): tratto desiderato in px ≈ size × 0.085 (regular), × 0.10 (medium), × 0.115 (semibold); `stroke-width = tratto × 24 / lato del box`. Esempi: freccia 11 medium in un box 12 → `stroke-width` 2.2; × 8 semibold in un box 7 → 3.2. Box ≈ size × 1.1, centrato.

### 7.2 Simboli dell'interfaccia principale

| Simbolo SF | Dove (size, peso) | Lucide / Phosphor |
|---|---|---|
| `chevron.left`, `chevron.right` | Indietro / Avanti (11 medium) | `chevron-left`, `chevron-right` |
| `arrow.clockwise` | Ricarica (11 medium) | `rotate-cw` |
| `xmark` | Stop, chiudi scheda (8 semibold), chiudi pannello (11 medium) | `x` |
| `minus` | Metti via (pin, gruppo) | `minus` |
| `plus` | Nuova scheda (10 medium) | `plus` |
| `plus.magnifyingglass` | Scheda vuota nella colonna di icone (11 medium) | `zoom-in` |
| `magnifyingglass` | Ricerca, suggerimenti (10..11 medium) | `search` |
| `sidebar.left`, `sidebar.right` | Pulsante della colonna | `panel-left`, `panel-right` |
| `puzzlepiece.extension` | Estensioni | `puzzle` |
| `bookmark`, `bookmark.fill` | Preferiti | `bookmark` (vuoto/pieno) |
| `arrow.down.circle`, `arrow.down` | Download (12 medium / 10 semibold) | `circle-arrow-down`, `arrow-down` |
| `speaker.wave.2.fill`, `speaker.slash.fill` | Audio (8; 6.5 nelle tile) | `volume-2`, `volume-x` (pieni, Phosphor `SpeakerHigh`/`SpeakerSlash` fill) |
| `eye.slash` | Scheda privata (9) | `eye-off` |
| `flask` | Scheda aperta da uno script (9) | `flask-conical` |
| `record.circle` | Registrazione (10) | `circle-dot` |
| `lock.open` | "Not secure" compatto | `lock-open` |
| `slider.horizontal.3` | Impostazioni del sito (11 medium) | `sliders-horizontal` |
| `folder`, `folder.fill`, `chevron.down` | Cartelle nei preferiti | `folder`, `chevron-down` |
| `chevron.right.2` | Preferiti che non entrano (9 semibold) | `chevrons-right` |
| `command`, `clock.arrow.circlepath`, `pin`, `laptopcomputer.and.iphone` | Righe dei suggerimenti (10 medium) | `command`, `history`, `pin`, `monitor-smartphone` |
| `xmark.circle.fill` | Svuota campo (11) | `circle-x` pieno |
| `arrow.down.left.and.arrow.up.right` | Angolo di ridimensionamento editor CSS (8 semibold) | `maximize-2` |
| `checkmark` | Scelte, "Search is the default browser" | `check` |
| `ellipsis` | Menu della barra di ricerca | `ellipsis` |
| `info.circle`, `info.circle.fill` | (i) nelle impostazioni (10.5) | `info` |
| `photo` | Immagine non scelta (Temi) | `image` |
| `arrow.up` … `arrow.up.left` (8 direzioni) | Direzione del gradiente (10 semibold) | `arrow-up`, `arrow-up-right`, … |

**Pagine interne** (icona della scheda, in `ink` 75%, `InternalPages.swift:64-75`): Settings `gearshape`, History `clock`, Downloads `arrow.down.circle`, Bookmarks `book`, Passwords `key`, Archived Tabs `archivebox`, Bring Things Over `square.and.arrow.down`, What's New `sparkles`.

**Sezioni delle impostazioni** (`Settings.swift:66-77`): `gearshape`, `paintbrush`, `photo.artframe`, `square.on.square`, `globe`, `square.stack`, `key`, `hand.raised`, `sparkles`, `puzzlepiece.extension`, `keyboard`, `info.circle`. Gruppi e righe: ~190 simboli in `SettingsIndex.swift` (elenco completo con `grep -o 'icon: "[^"]*"'`), tra cui `circle.lefthalf.filled`, `macwindow`, `textformat.size`, `wind`, `moon`, `sidebar.left`, `drop`, `drop.halffull`, `bold`, `hand.point.up.left`, `leaf`, `bolt`, ecc.

**Icone degli spazi** (24, `Spaces.swift:108-120`): `briefcase`, `building.2`, `desktopcomputer`, `laptopcomputer`, `chevron.left.forwardslash.chevron.right`, `terminal`, `sparkles`, `brain.head.profile`, `lightbulb`, `gamecontroller`, `beach.umbrella`, `cup.and.saucer`, `music.note`, `film`, `paintpalette`, `camera`, `house`, `book`, `graduationcap`, `cart`, `airplane`, `dumbbell`, `leaf`, `heart` (nomi: Work, Office, Desktop, Laptop, Code, Terminal, AI, Thinking, Ideas, Games, Leisure, Café, Music, Film, Art, Photos, Home, Reading, Studies, Shopping, Travel, Sport, Nature, Personal). Primo spazio: `house`; altri senza icona: `briefcase`.

### 7.3 Icona del sito quando manca la favicon (`Mark`, `Icons.swift:752-794`)

Quadrato `size × size` con raggio `size × 0.22` continuo, fondo `ink` 6%, lettera maiuscola (prima del dominio senza `www.`, o del nome file, `•` se nulla) a `size × 0.56` medium in `muted`. Favicon vere: stesso raggio come maschera. Icone delle pagine interne: simbolo in `ink` 75% con margine `size × 0.06`. Addormentata: opacità 0.45.

### 7.4 Il marchio (Logomark, `Design.swift:427-495`)

Una pillola con una "S" ritagliata, tela 608 × 276, riempimento **even-odd**. Usato nella pagina di benvenuto (alto 72 × 0.56 = 40.3 pt, `ink`) e nell'icona. Tracciato SVG (identico in `Icon/icon.swift:22`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 608 276"><path fill-rule="evenodd" fill="currentColor" d="M469.443 0C545.471 0.00013198 607.103 61.6325 607.104 137.66C607.104 213.688 545.471 275.321 469.443 275.321H137.66C61.6323 275.321 0 213.688 0 137.66C0.00016085 61.6325 61.6325 0.000140192 137.66 0H469.443ZM138.104 51.5977C127.234 51.5977 117.512 53.5115 108.938 57.3389C100.518 61.0132 93.8581 66.2188 88.959 72.9551C84.2132 79.5381 81.8398 87.3464 81.8398 96.3789C81.8399 105.258 83.6773 112.607 87.3516 118.425C91.0258 124.089 95.9251 128.682 102.049 132.203C108.173 135.571 114.833 138.327 122.028 140.471L151.652 149.197C158.389 151.188 163.9 154.249 168.187 158.383C172.473 162.516 174.617 168.028 174.617 174.917C174.617 182.572 171.402 188.849 164.972 193.748C158.695 198.494 150.122 200.867 139.252 200.867C132.21 200.867 125.702 199.413 119.731 196.504C113.914 193.442 109.091 189.308 105.264 184.103C101.436 178.744 99.2169 172.697 98.6045 165.961H97.6855L75.4102 171.013C76.3287 180.658 79.697 189.308 85.5146 196.963C91.3322 204.618 98.9103 210.665 108.249 215.104C117.741 219.544 128.076 221.765 139.252 221.765C151.193 221.765 161.68 219.774 170.713 215.794C179.746 211.813 186.711 206.225 191.61 199.029C196.662 191.834 199.188 183.414 199.188 173.769C199.188 164.124 197.352 156.239 193.678 150.115C190.003 143.838 185.104 138.863 178.98 135.188C172.857 131.514 166.044 128.605 158.542 126.462L128.229 117.735C121.799 115.898 116.516 113.219 112.383 109.698C108.402 106.177 106.412 101.354 106.412 95.2305C106.412 88.188 109.168 82.6758 114.68 78.6953C120.344 74.5619 128.152 72.4951 138.104 72.4951C147.901 72.4952 155.939 74.9448 162.216 79.8438C168.493 84.7428 172.397 91.1729 173.928 99.1338H174.847L196.663 93.8525C195.745 85.5853 192.605 78.3131 187.247 72.0361C181.889 65.6061 174.923 60.6306 166.35 57.1094C157.929 53.4351 148.514 51.5977 138.104 51.5977Z"/></svg>
```

### 7.5 Icona dell'app (`Icon/icon.swift`)

Disegnata in codice, su tela 1024:
- **Piastra** 824 × 824 a (100, 100), raggio **824 × 0.2237 = 184.3**, archi di cerchio (`NSBezierPath roundedRect`, non continuo), **bianca** (build di sviluppo `#FFCC33`) (`:94-108`).
- **Ombra** sotto la piastra: nero 18%, sfocatura 24, spostata in basso di 10 (unità su 1024) (`:100-109`).
- **Marchio** `#171717` (sRGB 0.09) largo **75.4%** della piastra, centrato, even-odd (`:111-115`).
- Dimensioni esportate: 16, 32, 128, 256, 512 a 1x e 2x (`:139-146`).
- Variante Icon Composer per macOS 26 (`:159-212`): in scuro piastra `#171717` e marchio bianco (la S mostra la piastra), in "tinted" marchio bianco; niente vetro, riflesso né ombra propri.

Per Windows: un `.ico` con 16, 20, 24, 32, 40, 48, 64, 256 generato dallo stesso SVG. Decisione D5: tenere la piastra bianca con margine come su Mac (in barra delle applicazioni apparirà più piccola delle icone Windows a pieno quadrato) o ingrandirla fino al bordo. Versione scura per tema scuro: piastra `#171717`, marchio bianco.

### 7.6 Sfondo del programma d'installazione (`Installer/background.swift`)

Finestra 640 × 380 bianca; icona dell'app a (180, 145), Applications a (460, 145); freccia sottile da 180+94 a 460−94 con punta aperta 7, tratto 1.5 arrotondato `#171717` 30%; testo "Drag Search into Applications to install it" 13 `#8C8C8C` centrato a y 282. Su Windows non ha un equivalente diretto (installer NSIS/MSIX): da reinterpretare o tralasciare.

---

## 8. Pagine interne

### 8.1 Scheda vuota (nuova scheda / home)

Struttura dal basso (`Stage.swift:16-25`, `App.swift:894-912`):
1. Fondo `ground`, oppure il tema (8.2) se scelto; con le carte è dentro la scheda arrotondata.
2. **Respiro** (6.2) sotto il campo, solo senza tema.
3. **Campo indirizzi** al centro della pagina, alzato di 30. Titolo della scheda: "New Tab". Segnaposto secondo il modo (`Omnibox.swift:557-566`): `Enter a web address` (scheda vuota e barra), `New tab: enter a web address` (⌘T sopra una pagina), `This tab: enter a web address` (⌘L), `Switch to an open tab` (⌘K), `Search <Sito>` (dopo Tab su un sito).
4. **Griglia Home** (facoltativa, `HomeGrid.swift`): i siti della cartella preferiti "Home", 4 colonne a 8 di distanza, larga quanto il campo, a 10 sotto il campo; tile alta 50, raggio 14 (arco), solo filo `hairline`, nome 12 `muted` su una riga, padding 10.
5. **Riga iPhone** (marketing di Office Commun, `IPhoneAsk.swift`): "Want Search on your iPhone?" in `muted` 11.5, poi "Get the beta" sottolineato `ink`, "·" `faint`, "Not now" `faint`; 16 sotto il campo (o sotto la griglia + 14). Su Windows probabilmente da togliere (D8).

Nella colonna la scheda vuota non ha icona (solo il titolo); nella colonna di icone mostra `plus.magnifyingglass`.

### 8.2 Temi della scheda vuota (`HomeTheme.swift`, `HomeWalls.swift`, `HomeStickers.swift`)

Famiglie: `Off`, `Wall painting`, `Stickers`, `Solid colour`, `Gradient`, `Image`. Spento di serie.

**Resa.** Il tema è disegnato **una volta** in un'immagine (mai per fotogramma) e rifatto solo se cambiano tema, regolazioni, aspetto, scala o dimensione; la dimensione è arrotondata ai 64 pt successivi; si tengono al massimo 4 immagini (`HomeTheme.swift:252-293`, `:379-384`). Le miniature sono disegnate come una finestra larga **480** e rimpicciolite (`:367-377`). Con "Shuffle: a different one each day": parete o pacchetto scelti dal numero del giorno (`giorno % 10`) (`:310-319`). In Electron: `OffscreenCanvas` / `<canvas>` → `ImageBitmap`, stessa cache.

**Dipinti murali** (10): Open Road, Desert Highway, Coastal Cliffs, Mountain Lake, Rice Terraces, Northern Lights, Saturn Rise, Moonscape, City at Night, Monsoon Forest. Silhouette piatte a strati, cielo a gradiente verticale, coordinate in frazioni di larghezza/altezza; codice scena per scena in `HomeWalls.swift:143-597`, da tradurre in Canvas 2D riga per riga. Note di traduzione:
- `addArc(..., clockwise: false)` di SwiftUI (asse y in giù) corrisponde a `ctx.arc(..., false)` del canvas.
- `drawLayer` con `.blur(radius: k)` → `ctx.filter = 'blur(kpx)'` (Northern Lights).
- Tratti con estremi e giunti arrotondati.
- Ogni parete termina con 240 granelli (`:133-141`): metà nero 3.5%, metà bianco 5%, raggio 0.4..1.0 × max(0.7, min(w,h)/900).
- **Casualità identica**: il generatore è `Seeded` (xorshift64: `s ^= s<<13; s ^= s>>7; s ^= s<<17`, in uint64), seme = FNV-1a 64 bit del nome del tema (`HomeTheme.swift:236-245`, `:410-414`), ma i numeri passano per `CGFloat.random(in:using:)` e `Int.random(in:using:)` di Swift. Per avere gli stessi oggetti negli stessi posti va riprodotto l'algoritmo di Swift in JS con `BigInt`: per un intervallo chiuso di Double si estrae `r = next(upperBound: 2^53 + 1)` col metodo di Lemire (prodotto a 128 bit, scarto se la parte bassa è < `(2^64 − 2^53 − 1) mod (2^53 + 1)`), se `r = 2^53` si restituisce il limite superiore, altrimenti `basso + (alto − basso) × r × 2^−53`; per `Int.random(in: 0..<n)` lo stesso `next(upperBound: n)`. Senza questo i dipinti sono "uguali nello stile" ma non identici.

**Adesivi** (10 pacchetti: Space, Road Trip, Ocean, Jungle, Street Food, Retro Tech, Weather, Music, Wonders, Search; 6 adesivi ciascuno, `HomeStickers.swift:105-379`). Algoritmo di disposizione (`:383-443`):
- fondo del pacchetto; seme = FNV-1a di `"stickers." + nome`;
- `quanti = clamp(8, 60, int((6 + densità·26) × max(0.5, area/(1200·800))))`; `base = min(w,h) × (0.04 + 0.075·scala)`;
- primo adesivo `Int.random(0..<6)`; per ognuno raggio `base × rand(0.85…1.2)`; fino a 60 tentativi di posizione in `x ∈ 0.04…0.96`, `y ∈ 0.05…0.95`, scartando l'ellisse centrale `((x−W/2)/(0.3W))² + ((y−H/2)/(0.25H))² < 1` e le sovrapposizioni `distanza < (r1 + r2) × 1.35`; inclinazione `rand(−22…22)` gradi;
- **bordo fustellato**: ogni livello ripassato in bianco con tratto `0.34 + spessore` (e riempito se pieno), con ombra nera 14% (35% in scuro), raggio 0.04 e y 0.03 in unità dell'adesivo (cioè × r);
- poi i livelli nei colori del pacchetto (tabella 2.8).
- Predefiniti: densità 0.5, scala 0.5, pacchetto Space.

**Solid / Gradient / Image**: 2.8. Immagine: copia nella cartella dell'app, riempie (cover), coperta da `ground` a `1 − intensità`. Predefiniti `HomeTuning` (`HomeTheme.swift:161-172`): intensità 1, densità 0.5, scala 0.5, pacchetto Space, solido `#E8DFD0`, gradiente `#E9B8A0` → `#8E86B8` a 150.

### 8.3 Pagina Temi (Settings › Themes, `ThemesPage.swift`)

Colonna verticale, spazio 16:
1. **Anteprima** 480 × 300, raggio 12 + filo: fondo e tema; al centro un finto campo 220 × 30 raggio 9 `ground` + filo con "Search or enter address" 11 `muted`; finte schede: colonna larga 70 (4 barrette alte 8, spazio 6, padding 10) o striscia alta 26 (4 barrette 56 × 10), barrette `muted` 35% raggio 3, fondo `ground` 55%.
2. **Segmented** di sistema con le famiglie: `Off`, `Wall painting`, `Stickers`, `Solid colour`, `Gradient`, `Image`.
3. Contenuto della famiglia:
   - Off: "The blank tab stays plain." 12 `muted`.
   - Wall / Stickers / Gradient: griglia 3 colonne di **miniature 160 × 100**, raggio 10 + filo, 3 di margine, anello d'accento 2.5 raggio 13 sulla scelta, nome sotto a 6 (11.5, medium e `ink` se scelto, altrimenti `muted`); colonne 166, spazio 14.
   - Solid: 6 pallini 24 (filo `hairline` 1.5, `ink` se scelto) + selettore colore "Colour".
   - Gradient: le 5 miniature (Dusk, Sea, Peach, Mint, Mono) + selettori "From" e "To" + cursore "Angle" (0..360, "°").
   - Image: miniatura 176 × 114 raggio 8 (o `wash` con `photo`), pillole "Choose Image…" e "Remove", nota "A copy is kept inside Search." 11 `muted`.
4. Per Wall e Stickers: casella "Shuffle: a different one each day" 12.
5. Cursori (applicati al rilascio): etichetta 12 `muted` larga 64, cursore, valore 11 cifre tabulari larghe 40 ("%" o "°"): "Intensity", e per gli adesivi "Density" e "Scale".

### 8.4 Benvenuto (`Welcome.swift`)

Pannello a tutta finestra su `ground`, padding 40, contenuto largo al massimo 520 centrato verticalmente, piede in basso. Pagine con transizione (6.2). 4 pagine (5 se si offre l'email).

**Piede** (`:325-353`): puntini 6 × 6 a 6 di distanza (`ink` per la pagina attuale, `faint` 60% le altre); a destra "Back" e "Skip" (13 `muted`, senza fondo) e il pulsante grande "Continue" o "Start browsing" all'ultima.

**Pulsante grande** (`Big`, `:436-461`): 13 medium, padding 16 / 9, capsula; pieno `ink` con testo `ground`; vuoto `wash` (al passaggio `hover`), testo `ink`.

**Interruttore con testo** (`Choice`, `:463-488`): titolo 13.5 `ink`, dettaglio 11.5 (`muted` se importante, altrimenti `faint`), Switch a destra, spazio 12.

**Pagina 1 · Welcome** (`:94-130`), centrata, spazio 22:
- Marchio alto 40.3 in `ink`.
- "Search" 34 medium `ink`.
- "A browser with nothing in the way. Four megabytes, the engine already in your Mac, and as little around the page as we could manage." 14.5 `muted`, centrato, interlinea +3, largo 400.
- Riquadro (10 sopra, largo 440): fondo `wash` raggio 12, padding 16 / 14, spazio 14 tra:
  - "Sync with iCloud" · "Open tabs, pins, spaces, bookmarks and a few settings, on your iPhone and other Macs. End-to-end encrypted, in your own iCloud."
  - filo
  - "Handoff" · "The page in front shows up on your iPhone and iPad."
- Sotto: "Nothing starts until you leave this welcome. Both are in Settings › General." 11.5 `muted`.

**Intestazione delle altre pagine** (`:409-420`): titolo 26 medium `ink`, riga 14 `muted` interlinea +2, spazio 8; colonna a sinistra, spazio 22.

**Pagina 2 · "Bring things over."** (`:132-199`): riga "Passwords go into your keychain, bookmarks into the menu, and history means the address field already knows where you go. Nothing in the other browser changes."; se non ci sono browser: "No other browser found on this Mac \u2014 nothing to bring." 13 `faint`; altrimenti Segmented dei browser (o "From <Nome>" 13 `muted`), "<Nome> can bring: <elenco>" 12 `faint`, interruttori "Passwords" ("macOS will ask once for that browser's keychain key"), "Bookmarks" ("Folders and all, behind the bookmark button"), "History" ("The last few thousand places, for finishing addresses"); pulsante pieno "Bring them in" / "Bringing…" con anello 10; esito 13 `muted` (es. "12 passwords · 30 bookmarks · 2000 places"); pillola "From a file another browser exported…". Testi alternativi per le password: "<Nome> keeps passwords in the Passwords app: export them there, then bring in the file below." / "Passwords from <Nome> aren't supported yet."

**Pagina 3 · "Two ways to hold it."** (`:201-255`): riga "Titles down the side, or across the top. The grey slides to the tab you pick either way, and you can change your mind with ⇧⌘S."; due card affiancate "Sidebar" e "Tab strip" (spazio 12): card raggio 14, padding 10, fondo `wash` se scelta (`hover` al passaggio), filo `ink` 35% se scelta altrimenti `hairline`; dentro un disegnino alto 110 raggio 8 su `ground` con filo: tre pallini 5 `faint`, 4 schede (la prima `wash`, le altre `hover`, barrette alte 8 raggio 3; colonna larga 62 con filo), ogni scheda preceduta da un quadratino 10 raggio 2.5 (lettera 6.5 medium "G", "M", "Y", "W" su `ink` 6%, oppure colori di sistema rosso/blu/verde/arancio al 70% se "Site icons"); titolo 13 (medium e `ink` se scelto). Poi "Tabs wear" 13 `muted` + Segmented `Letters` / `Site icons`. Poi card "Coming from Arc?" (filo raggio 12, padding 16 / 14): titolo 13.5 `ink`, testo 11.5 `muted` "Tabs on the left, spaces, pinned rows, and Arc's habits: tabs that close after 12 hours, peek, the floating video.", pulsante "Set Up Like Arc" (dopo: "Undo", oppure "Set up like Arc" 12 `faint` se già così).

**Pagina 4 · "Links from other apps."** (`:257-312`): riga "A click in Mail, in Slack, in a PDF \u2014 macOS sends it to whichever browser is the default. It can be this one."; pulsante pieno "Make Search the default" (poi "macOS asks in its own dialog" 13 `faint`) oppure `checkmark` 11 medium + "Search is the default browser" 13 `ink`. Poi "A few things worth knowing" 11 medium `faint` MAIUSCOLO tracking 0.6, e l'elenco tasti (`Key`: tasto 12 medium rounded `ink` su `wash` raggio 6, padding 7 / 3, largo almeno 44; testo 13 `muted`; spazio 10; righe a 8):

| Tasto | Testo |
|---|---|
| ⌘T | "A new tab. Type a place, or words to search." |
| ⌘K | "Every open tab, by name." |
| ⌘, | "Settings, including passwords and updates. ⌘F there finds any setting." |
| ⌃1 | "Spaces: separate tabs and sign-ins. Turn them on in Settings › Spaces & Pins, or Set Up Like Arc there." |
| ⌥⌘N | "Split a page in two, ⌥-click a tab to put it beside the page, or drag a tab onto a page; ⌃⌘← and ⌃⌘→ go from one page to the other, and ⌥⌘N again puts them apart." |
| ⌘O | "Links from other apps open in a small window; ⌘O keeps one as a tab. Settings › Browsing." |
| ⌘L | "Suggestions from your search engine as you type \u2014 off until you turn them on in Settings › Browsing." |
| ⌘ | "Held, it can show each tab's number for ⌘1\u20139. Settings › Tabs." |
| ⌘, | "A painted wall behind the blank tab, if you want one \u2014 Settings › Themes. Off until you choose." |
| ⌘1 | "Pressed again on its pin, back to where you were." |
| ⇧⌘P | "Float a video in Search's window, or in macOS's picture in picture. Settings › Browsing." |
| ⌃-click | "Claude or ChatGPT in a side panel beside the page: right-click a tab › Open in Side Panel, or View › Side Panel." |
| ⌘Q | "Search can ask before it quits. Settings › General." |
| ⌘, | "Your Apple passwords, under the sign-in field \u2014 Settings › Passwords." |
| ⌃-click | (se c'è la traduzione) "Translate a page into your language, on this Mac \u2014 nothing is sent anywhere. Right-click the page › Translate Page." |
| ⌘, | (se c'è l'IA) "AI summaries and questions about a page \u2014 off until you turn it on in Settings › AI." |

**Pagina 5 (facoltativa) · email** (`OptIn.swift:446-475`): "Search for iPhone, early." 26 medium; "Leave your email and get the iPhone beta before everyone else. After that, rare emails: only useful new features and big updates." 14; campo `you@example.com`; offline: "You're offline. Settings › About has the same field for later." Servizio di Office Commun: su Windows da togliere (D8).

Nota per Windows: i tasti ⌘ ⌥ ⌃ ⇧ e i riferimenti a macOS, iCloud, Handoff, keychain, Mail vanno decisi con chi cura il copy (D7).

### 8.5 Novità dopo un aggiornamento (`WhatsNew.swift:770-857`)

Card `Plate` larga **460**, titolo "New in Search <versione>" (es. "New in Search 1.0.19").
- Lista scorrevole alta al massimo 470 (360 se c'è il blocco email), spazio 14: una `Card` con le righe (titolo 13 `ink`, dettaglio 11.5 `muted`, Switch; padding 14 / 10; spazio 16; `Rule` tra le righe).
- Ordine: prima gli interruttori "guida" ancora spenti ("Sync with iCloud", "Handoff to your iPhone"), poi quelli di questa versione, poi la didascalia "From earlier versions, in case you missed them" (6 sopra) e quelli vecchi ancora spenti.
- Blocco email (`OptInBlock`): fondo `wash` 55% raggio 11, padding 14, "Get Search for iPhone early" 13 semibold, "Leave your email for the iPhone beta. After that, rare emails: only useful new features and big updates." 12; nota "Unsubscribe anytime. Your email is used for nothing else." + "Privacy" sottolineato (11).
- Piede: "Everything that's new…" 12 `muted` a sinistra, pillola piena "Close" a destra.

Interruttori della 1.0.19 (titolo · dettaglio, `WhatsNew.swift:58-73`): "Bookmarks bar in the sidebar" · "The bookmarks bar at the top of the sidebar, in every space." / "The field in the middle of the window" · "⌘T's and ⌘L's field centred on the window and higher up, as in Arc." / "Smooth scrolling with a mouse wheel" · "Each notch glides, as in Chrome. A trackpad is left as it is." / "A loading line with the tabs hidden" · "A thin line along the page's top while it loads, with the tabs folded away." / "Click the tab you're on to edit its address" · "Without the site card; Site Information… stays on the right-click." / "Touch ID before filling a password" · "Touch ID, or your Mac's password, before a saved password goes into a page." / "Icons only on the bookmarks bar" · "Each bookmark its site's icon, its name on hover. Folders keep their names." / "Unread counts on pinned tabs" · "WhatsApp's or Discord's count as a badge on its pin." L'elenco completo con versioni è in `WhatsNew.swift:45-199`.

### 8.6 Note di tutte le versioni (`WhatsNew.swift:860-919`)

`Plate` "What's New" larga 560, lista alta 480 (a tutta altezza in una scheda), testo selezionabile, versioni a 26 di distanza:
- "Search <versione>" 14 semibold `ink` + data 12 `faint` sulla stessa linea di base, spazio 8;
- titolo della versione 13 `ink`;
- sezioni "New", "Better", "Fixed" (11.5 medium `muted`), righe "•" `faint` + testo 12.5 `ink`, spazio 8, righe a 5.
Testi: `WhatsNew.swift:282-766` (19 versioni, dalla 1.0 del 23 September 2026 alla 1.0.19 del 23 November 2026): da importare tali e quali (meglio esportarli in JSON con uno script che copiarli a mano).

### 8.7 Informazioni (`About.swift`)

Finestra propria 320 di larghezza, titolo nascosto e barra trasparente, trascinabile dal fondo, centrata; fondo `ground`; padding 34 sopra, 20 sotto, 28 ai lati; tutto centrato:
1. Icona dell'app 72 × 72, 10 sotto.
2. "Search" 15 semibold `ink`.
3. "Version 1.0.19 (<build>)" 11 `muted`, selezionabile, 3 sopra.
4. Pillola "What's New", 12 sopra.
5. Riga iPhone su due righe ("Want Search on your iPhone?" 11.5 `muted`, poi "Get the beta · Not now"), 16 sopra.
6. "© Office Commun · Search" 10.5 `faint`, 16 sopra.

### 8.8 Pagine "di sistema" in una scheda (`InternalPages.swift`)

Indirizzi `search://settings`, `search://settings/privacy`, `search://history`, `search://downloads`, `search://bookmarks`, `search://passwords`, `search://archive`, `search://import/Arc`, `search://release-notes`. Titoli: "Settings", "History", "Downloads", "Bookmarks", "Passwords", "Archived Tabs", "Bring Things Over", "What's New" (icone in 7.2). Fondo `ground`, ritagliato al raggio della scheda; sempre in inglese. Le pagine usano il `Plate` in versione "scheda" (4.6) o, per Settings, la barra a sinistra (4.6).

### 8.9 Editor "Edit Site Style…" (`SiteStyles.swift:147-278`)

`Plate` con il nome del sito come titolo, prima 420 × 220, minimo 340 × 120, ridimensionabile dall'angolo in basso a sinistra (simbolo 8 semibold in 22 × 22, doppio clic torna alla misura iniziale); didascalia "CSS for every page of this site"; editor monospazio 12 `ink` su `wash` raggio 10 padding 8; piede: pillola piena "Done" e "Clear".

### 8.10 Video flottante, solo Windows (`src/ui/float.html`, 25 nov 2026)

Non c'è su Mac (lì è `Float.swift` con i suoi controlli): è la scelta di Oriel di vestire i bottoni con l'aspetto dell'app. Ultra pulito: sul video non c'è nulla finché il puntatore non è sulla finestra (dissolvenza `--dur-quick`, `--ease-quick`, che `motion.instant` azzera); allora compaiono solo capsule di `ground` al 92% con filo `card-edge` e ombra morbida (`0 1px 8px` nero 20%), glifi `ink` a tratto tondo come i simboli (§7), passaggio del puntatore `g-wash`. In alto a sinistra una capsula con chiudi e, se `float.minimize`, riduci (26 × 26, dentro di 10 dai bordi); in alto a destra un cerchio 26 × 26 "torna alla scheda"; al centro una capsula con indietro 15 s, pausa o play (38 × 38) e avanti 15 s; in fondo, dentro di 14 e a 4 dal bordo, una linea sottile (4, 6 sotto il puntatore, estremi tondi) con pista `ground` al 55% e riempimento `ink`, che cerca con clic o trascinamento e manca nei video senza durata. Niente gradienti, niente cerchi che pulsano, niente testo (Plus Jakarta Sans resta per ciò che un giorno vi comparirà). Chiaro o scuro come l'app (`prefers-color-scheme`, come `page.tsx`). Il filo tutto intorno è `card-edge` a 1 px, raggio 8 come gli angoli che Windows 11 dà alla finestra: le capsule hanno gli estremi concentrici con la propria altezza. Ridotta (220 di larghezza) restano chiudi, riduci, torna e pausa. Prova: `test/pages_float_look.py`.

---

## 9. Indice dei riferimenti principali

| Argomento | File:riga |
|---|---|
| Palette e coppie chiaro/scuro | `Design.swift:13-60` |
| Grigi in trasparenza | `Design.swift:67-105` |
| Aspetto Light/Dark/System | `Design.swift:119-157` |
| Metriche (striscia, carte, schede, colonna) | `Design.swift:159-257` |
| Maniglia del bordo | `Design.swift:264-286` |
| Motion (molle e curve) | `Design.swift:294-417` |
| Logomark | `Design.swift:427-495` |
| Scossa | `Design.swift:498-515` |
| Pagina-scheda (CardEdge) | `Design.swift:549-594` |
| Vetro della finestra | `Glass.swift:28-163` |
| Lente Liquid Glass | `LiquidTab.swift:87-267` |
| Semafori | `Lights.swift:15-154`, `Stage.swift:1292-1314` |
| Componenti dei pannelli | `Plate.swift:11-275` |
| Gradienti, OKLab, grana, selettore | `SpaceGradient.swift:27-895` |
| Colori degli spazi, lavaggio, icone | `Spaces.swift:69-120`, `:849-1050` |
| Dusk | `Dusk.swift:149-702`, `DuskColours.swift:28-51` |
| Temi: modello, Pen, resa | `HomeTheme.swift:5-446` |
| Dipinti murali | `HomeWalls.swift:8-597` |
| Adesivi | `HomeStickers.swift:80-443` |
| Griglia Home | `HomeGrid.swift:6-57` |
| Pagina Temi | `ThemesPage.swift:5-300` |
| Mark (lettera / favicon) | `Icons.swift:752-794` |
| Colonna di icone | `SideIcons.swift:20-346` |
| Benvenuto | `Welcome.swift:13-603` |
| Novità e note | `WhatsNew.swift:45-919` |
| Informazioni | `About.swift:47-92` |
| Pagine interne | `InternalPages.swift:16-181` |
| Bolla del link | `StatusLine.swift:121-157` |
| Indirizzo a riposo | `AtRestLine.swift:7-119`, `AtRest.swift:15-66` |
| Editor CSS del sito | `SiteStyles.swift:147-278` |
| Colonna: costanti, corpo, bordo | `Side.swift:87-163`, `:205-484` |
| Pin | `Side.swift:1064-1096`, `:1871-2000` |
| Riga scheda, Quiet, Keep, Speaker, Door | `Side.swift:2027-2498` |
| Piede della colonna | `Side.swift:1691-1756` |
| Striscia in alto, Helm, scheda | `TabBar.swift:6-345`, `:749-887`, `:887-1270` |
| Give, Ring | `TabBar.swift:2208-2217`, `:2417-2490` |
| Campo indirizzi e respiro | `Omnibox.swift:22-497`, `:505-867` |
| Barra indirizzi fissa | `AddressLine.swift:19-140` |
| Barra preferiti | `BookmarksBar.swift:27-205` |
| Impostazioni (layout e controlli) | `Settings.swift:98-343`, `:1246-1702` |
| Righe/altezze dalle preferenze | `Prefs.swift:294-304`, `:1227-1262` |
| Composizione della finestra | `App.swift:587-800`, `:1195-1241` |
| Ombra della colonna ripiegata, linea di caricamento | `Fold.swift:843-865`, `:930-1023` |
| Contatore, numeri scorciatoia | `UnreadBadge.swift:36-79`, `TabShortcutHint.swift:14-26` |
| Menu ricostruiti | `SiteCard.swift:163-186`, `:700-842` |
| Icona dell'app | `Icon/icon.swift:89-212` |
| Sfondo dell'installer | `Installer/background.swift:18-56` |

---

## 10. Backlog visivo

### Decisioni da prendere prima (bloccano lavoro)

- **D1 · Angoli e cornice della finestra.** (a) Cornice nativa Windows 11: angoli 8, ombra e Snap Layouts di sistema, ma pagina-scheda non concentrica (servirebbe raggio 0). (b) Finestra senza cornice e trasparente: angoli 17.5 e ombra disegnati da noi, carte 10 concentriche come sul Mac; più lavoro e niente Acrylic insieme alla trasparenza. Raccomandazione: (b) se "identico" vince, (a) per la prima versione.
- **D2 · Semafori.** Disegnare i tre cerchi del Mac a sinistra (identico) o usare i pulsanti di Windows a destra (`titleBarOverlay`). Cambia tutta la fascia di 52 della colonna (Indietro/Avanti a x 80).
- **D3 · Carattere.** Inter incorporata (consigliata) o Segoe UI Variable.
- **D4 · Icone.** Lucide/Phosphor ritoccate o set disegnato apposta (gli SF Symbols non si possono ricalcare).
- **D5 · Icona dell'app.** Piastra bianca con margine (identica) o a pieno quadrato; nome e icona richiedono il permesso di Office Commun per la distribuzione.
- **D6 · Valori dei grigi.** Nominali (Tailwind) o campionati a schermo (vedi 2.1); si decide dopo il campionamento P0.
- **D7 · Copy.** Trattini lunghi nell'originale, tasti ⌘/⌥/⌃, riferimenti a macOS, iCloud, Handoff, keychain.
- **D8 · Funzioni di Office Commun** (beta iPhone, newsletter): togliere o tenere.

### P0 (senza questo non sembra Search)

- [ ] Campionare uno screenshot reale del Mac (chiaro e scuro, carte e bordo a bordo) e fissare i grigi (D6).
- [ ] Token CSS (cap. 11) e passaggio chiaro/scuro/sistema con `nativeTheme`.
- [ ] Inter incorporata con pesi 400/500/600/700, `letter-spacing` tarato su "Rec…" = 32 px a 12.5 (3.1).
- [ ] Impaginazione predefinita: colonna 232 su `frame`, fascia 52, pagina-scheda (margini 8, raggio 10, filo 8%, ombra 7%), `setBorderRadius` sulla vista della pagina.
- [ ] Riga scheda: 28 di altezza, raggio 9, simbolo 15, titolo 12.5, colori `Greys`, × 15 su disco 7%, maschera di dissolvenza, distanza 2.
- [ ] Pillola grigia che scivola tra le righe con la molla `glide` (tecnica FLIP + `linear()`).
- [ ] Pin a griglia (max 4 per riga, alti ≤ 34, distanza 4, `tile`/`pinLive`).
- [ ] Pulsanti `Door` 26 × 26 raggio 8 e Helm.
- [ ] Campo indirizzi 560 × 50 raggio 14 con ombra, segnaposti, selezione al 12%, lista 6/14/9, velo 74%.
- [ ] Respiro sotto il campo (2.6 s, Reduce Motion lo ferma).
- [ ] `Mark` (lettera in quadratino 6%) e favicon con raggio 22%.
- [ ] Anello di caricamento (1.4, 78%, 0.85 s).
- [ ] Molle `glide`/`settle`/`quick` come variabili CSS; `prefers-reduced-motion`.
- [ ] Set di icone della chrome (tabella 7.2) con spessori tarati.
- [ ] Livello sopra la pagina (vista trasparente) per campo, liste, bolla, ombre.
- [ ] Decisioni D1..D8.

### P1 (completezza dell'aspetto)

- [ ] Striscia in alto (186/104/36, pin 30, + a scomparsa, filo 1 × 20, compatta 36).
- [ ] Colonna senza carte (fondo `ground`, filo interno) e colonna di icone (52, tile 32).
- [ ] Barra dei preferiti (30/22/6) e barra indirizzi fissa (220/340).
- [ ] Pannelli: Plate, Card, Line, Rule, Hunt, Pill, Switch, Segmented, Steps, Pictures.
- [ ] Impostazioni in scheda (barra 196, colonna 600, GroupBlock, SettingRow, scivolata della selezione 0.45/0.72).
- [ ] Benvenuto completo (5 pagine, piede, card Way, Key).
- [ ] Card Novità e pagina note (testi importati in JSON).
- [ ] Finestra Informazioni.
- [ ] Colori degli spazi: lavaggio Subtle/Rich/Vivid, icona dello spazio, pulsanti per spazio, nome che compare 1.4 s.
- [ ] Gradienti degli spazi con algoritmo OKLab in JS (24 fermate, held, tone, chroma), su tutta la finestra.
- [ ] Grana (xorshift32, 128 px a 64 px CSS).
- [ ] Menu contestuali in HTML con `MenuMetrics` (riga 24, raggio 12, evidenziazione accento schiarito).
- [ ] Bolla del link, pillole di avviso e di modalità, barra di ricerca nella pagina, Peek.
- [ ] Ombre convertite (×2 del raggio) verificate a occhio.
- [ ] Angoli continui con `corner-shape` sopra i 10 px (campo, pannelli, card), tarati.
- [ ] Riempimento di lettura (5.5%, 0.15 s) e indirizzo a riposo con dissolvenza 0.22.
- [ ] Badge rosso sui pin, numeri ⌘ sulle schede.
- [ ] Icona dell'app `.ico` dalla specifica 7.5 (chiara e scura).
- [ ] Temi: solido, gradiente (angolo + 90°), immagine, intensità; pagina Temi con anteprima 480 × 300 e miniature 160 × 100.

### P2 (rifiniture e casi rari)

- [ ] Dipinti murali (10) tradotti in Canvas 2D con la casualità di Swift riprodotta in `BigInt`.
- [ ] Adesivi (10 pacchetti) con bordo fustellato e algoritmo di disposizione identico.
- [ ] Vetro della finestra con Acrylic + tinta 15.5% + grana 2.26%; stile Liquid approssimato.
- [ ] Lente Liquid Glass sulla scheda attiva (`backdrop-filter: url()` + molla 320/27 + deformazione).
- [ ] Dusk: porting dello script (filtro e gemelli `oklch(from …)`), sottopagina `#171717`.
- [ ] Semafori grigi "a riposo" disegnati quando la finestra non è in primo piano.
- [ ] Linea di caricamento 2 px con colonna nascosta, nel colore d'accento di Windows.
- [ ] "Tabs give" (scala 0.97), scossa del campo rifiutato.
- [ ] Editor CSS del sito con angolo di ridimensionamento.
- [ ] Coppie Split View nella colonna di icone; parentesi dei gruppi.
- [ ] Variante "Roomier tabs" (36 / 14 / 17) e "High contrast tab text".
- [ ] Modalità "Light motion" a batteria (easeOut 0.16 s).

---

## 11. Token CSS proposti

Valori nominali (vedi D6). Le dimensioni sono in px = pt del Mac.

```css
:root {
  /* palette: chiaro */
  --ground: #FFFFFF;
  --ink: #171717;
  --ink-rgb: 23 23 23;
  --muted: #8C8C8C;
  --faint: #D4D4D4;
  --hairline: #E8E8E8;
  --wash: #EFEFEF;
  --hover: #F6F6F6;
  --frame: #F4F4F4;
  --resting-light: #CCCCCC;
  --safe: #14803D;
  --unsafe: #B5540A;
  --unread: #ED3D36;
  --underpage-dusk: #171717;

  /* grigi in trasparenza su bianco (Greys.white) */
  --g-wash: rgba(0,0,0,.063);
  --g-hover: rgba(0,0,0,.035);
  --g-tile: rgba(0,0,0,.03465);
  --g-pin-live: rgba(0,0,0,.10);
  --g-wash-on-tile: rgba(0,0,0,.0294);
  --g-hover-on-tile: rgba(0,0,0,.004);
  --g-muted: rgba(0,0,0,.45);
  --g-faint: rgba(0,0,0,.17);

  /* opacità d'inchiostro ricorrenti */
  --ink-reading: rgb(var(--ink-rgb) / .055);
  --ink-mark-bg: rgb(var(--ink-rgb) / .06);
  --ink-close-disc: rgb(var(--ink-rgb) / .07);
  --ink-selection: rgb(var(--ink-rgb) / .12);
  --ink-placeholder: rgb(var(--ink-rgb) / .30);
  --ink-picked-outline: rgb(var(--ink-rgb) / .35);
  --ink-hover-text: rgb(var(--ink-rgb) / .70);
  --scrim-field: rgb(255 255 255 / .74);   /* ground al 74% */
  --scrim-panel: rgba(0,0,0,.10);

  /* card della pagina */
  --card-edge: rgba(0,0,0,.08);
  --card-shadow: 0 1px 12px rgba(0,0,0,.07);

  /* tipografia */
  --font-ui: "Inter", "Segoe UI Variable Text", "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", "Cascadia Mono", Consolas, monospace;
  --fs-tab: 12.5px;
  --fs-tab-roomy: 14px;
  --fs-detail: 11.5px;
  --fs-body: 13px;
  --fs-field: 15.5px;
  --fs-panel-title: 17px;
  --fs-page-title: 22px;
  --fs-heading: 26px;
  --fs-hero: 34px;
  --fs-caption: 10.5px;
  --lh-k: 1.193;

  /* misure */
  --strip: 52px;
  --strip-compact: 36px;
  --band: 30px;
  --card-gap: 8px;
  --card-radius: 10px;
  --window-radius: 17.5px;
  --lights-x: 26px;          /* centro del primo semaforo */
  --lights-gap: 23px;
  --lights-size: 14px;
  --tabs-start: 100px;
  --side-default: 232px;
  --side-min: 176px;
  --side-max: 440px;
  --side-narrow-line: 200px;
  --side-icons: 52px;
  --side-pad: 10px;
  --side-helm-x: 80px;
  --row: 28px;
  --row-roomy: 36px;
  --row-gap: 2px;
  --row-radius: 9px;
  --mark: 15px;
  --mark-roomy: 17px;
  --pin-max: 34px;
  --pin-gap: 4px;
  --door: 26px;
  --door-radius: 8px;
  --door-gap: 4px;
  --tab-width: 186px;
  --tab-titled: 104px;
  --tab-min: 36px;
  --tab-gap: 2px;
  --tab-lead: 11px;
  --tab-trail: 7px;
  --tab-pin: 30px;
  --close: 15px;
  --field-width: 560px;
  --field-height: 50px;
  --field-pad-x: 22px;
  --field-radius: 14px;
  --field-shadow: 0 8px 48px rgba(0,0,0,.06);
  --list-pad: 6px;
  --list-shadow: 0 6px 40px rgba(0,0,0,.07);
  --plate-radius: 16px;
  --plate-pad: 22px;
  --plate-shadow: 0 12px 68px rgba(0,0,0,.16);
  --card-group-radius: 11px;
  --hairline-w: 1px;
  --grip-w: 4px;
  --grip-rest: 28px;
  --grip-lit: 40px;
  --bookmarks-bar: 30px;
  --menu-row: 24px;
  --menu-radius: 12px;
  --menu-highlight-radius: 6px;
  --settings-rail: 196px;
  --settings-column: 600px;
  --settings-text-inset: 52px;

  /* movimento */
  --ease-quick: cubic-bezier(0, 0, .58, 1);
  --dur-quick: 140ms;
  --ease-in: cubic-bezier(.42, 0, 1, 1);
  --ease-in-out: cubic-bezier(.42, 0, .58, 1);
  --dur-glide: 467ms;
  --ease-glide: linear(0, 0.0530, 0.1737, 0.3204, 0.4674, 0.6003, 0.7126, 0.8026, 0.8716, 0.9223, 0.9579, 0.9817, 0.9967, 1.0053, 1.0096, 1.0110, 1.0108, 1.0096, 1.0080, 1.0064, 1.0048, 1.0035, 1.0024, 1.0016, 1);
  --dur-settle: 418ms;
  --ease-settle: linear(0, 0.0540, 0.1753, 0.3207, 0.4647, 0.5939, 0.7026, 0.7897, 0.8568, 0.9066, 0.9423, 0.9671, 0.9835, 0.9939, 1.0000, 1.0033, 1.0047, 1.0050, 1.0047, 1.0041, 1.0033, 1.0026, 1.0020, 1.0014, 1);
  --dur-fold-out: 195ms;
  --dur-fold-in: 191ms;
  --dur-light: 160ms;          /* Light motion: ease-out */
  --dur-breath: 2.6s;
  --dur-ring: .85s;

  /* lavaggio degli spazi (Subtle) */
  --wash-subtle: .07;
  --wash-rich: .18;
  --wash-vivid: .30;
  --grain-opacity: .035;
  --space-blue: #4285F5;
  --space-green: #33A873;
  --space-orange: #F59E33;
  --space-red: #E65466;
  --space-violet: #9E66E6;
}

/* scuro: stesso blocco sotto prefers-color-scheme o [data-look="dark"] */
:root[data-look="dark"] {
  --ground: #1C1C1C;
  --ink: #EDEDED;
  --ink-rgb: 237 237 237;
  --muted: #949494;
  --faint: #525252;
  --hairline: #333333;
  --wash: #2D2D2D;
  --hover: #262626;
  --frame: #131313;
  --resting-light: #4D4D4D;
  --safe: #4ADE80;
  --unsafe: #FABF24;

  --g-wash: rgba(255,255,255,.073);
  --g-hover: rgba(255,255,255,.045);
  --g-tile: rgba(255,255,255,.04015);
  --g-pin-live: rgba(255,255,255,.112);
  --g-wash-on-tile: rgba(255,255,255,.0342);
  --g-hover-on-tile: rgba(255,255,255,.005);
  --g-muted: rgba(255,255,255,.5281);
  --g-faint: rgba(255,255,255,.236);

  --scrim-field: rgb(28 28 28 / .74);
  --card-edge: rgba(255,255,255,.08);

  --wash-subtle: .11;
  --wash-rich: .22;
  --wash-vivid: .40;
  --grain-opacity: .04;
}

/* grigi per ciò che sta sul fondo "frame" (colonna e barra con la pagina a scheda) */
.on-frame {
  --g-wash: rgba(0,0,0,.0628);
  --g-hover: rgba(0,0,0,.0419);
  --g-tile: rgba(0,0,0,.0314);
  --g-pin-live: rgba(0,0,0,.0995);
  --g-wash-on-tile: rgba(0,0,0,.0324);
  --g-hover-on-tile: rgba(0,0,0,.0108);
  --g-muted: rgba(0,0,0,.4241);
  --g-faint: rgba(0,0,0,.1309);
}
:root[data-look="dark"] .on-frame {
  --g-wash: rgba(255,255,255,.0865);
  --g-hover: rgba(255,255,255,.0595);
  --g-tile: rgba(255,255,255,.0432);
  --g-pin-live: rgba(255,255,255,.1243);
  --g-wash-on-tile: rgba(255,255,255,.0452);
  --g-hover-on-tile: rgba(255,255,255,.0169);
  --g-muted: rgba(255,255,255,.5459);
  --g-faint: rgba(255,255,255,.2649);
}

@media (prefers-reduced-motion: reduce) {
  :root { --dur-quick: 0ms; --dur-glide: 0ms; --dur-settle: 0ms; --dur-fold-out: 0ms; --dur-fold-in: 0ms; }
}
```
