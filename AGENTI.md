# Regole per gli agenti

Valgono per chiunque lavori a un modulo di Search per Windows in parallelo con altri.

1. **Tocchi solo le tue cartelle e il tuo file `src/shared/modules/<modulo>.ts`.** Se ti serve qualcosa da un altro modulo o da `src/shared/` (stato, comandi, IPC, bench, token), non lo modifichi: lo scrivi nel rapporto come richiesta e intanto lavori contro un finto.
2. **Come si estende lo scheletro senza toccarlo:**
   - comandi e stato nuovi: `declare module '../commands'` / `'../state'` nel tuo `src/shared/modules/<modulo>.ts` (vedi `src/shared/modules/README.md`);
   - nel processo principale: `handle('<modulo>.<nome>', ...)` da `src/main/router.ts`, `registerSlice(...)` da `src/main/views/window.ts`, `shortcut(...)` da `src/main/keys.ts`, `addDefaults(...)` da `src/shared/prefs.ts`, `benchRequest(...)` da `src/main/bench/server.ts`, `net.onBeforeRequest(...)` da `src/main/net`;
   - nell'interfaccia: un file `src/ui/<modulo>/register.tsx` con `registerLayer`, `registerOutlet` (`src/ui/lib/registry.ts`);
   - nelle pagine: un file in `src/preload/page/`.
3. **Ogni funzione cita il paragrafo dello studio** (per esempio "01 §3.12") nel codice o nel commit, e **ha una prova** in `test/<modulo>_*.py` con il bench (`test/bench.py`), con i valori del Mac. "Fatto" senza prova non vale. Ogni prova usa un mondo suo: `b.use("<modulo>-<nome>")`.
4. **Solo i P0 dello studio.** I P1 e P2 vanno in un elenco "dopo" nel rapporto.
5. **Testi dell'interfaccia**: in inglese, identici a Search sul Mac, ma senza trattini lunghi «—» o «–» (si riscrive con virgola, due punti o punto) e senza nominare macOS, Touch ID o il portachiavi (Windows, Windows Hello, Windows). Commenti nel codice in inglese, brevi.
6. **Aspetto**: valori da `studio/02-aspetto.md` e token di `src/shared/tokens.css`. Molle: `src/shared/spring.ts` o le curve `linear()` dei token. Niente librerie di componenti o di animazioni.
7. **Dipendenze nuove**: non le installi; le chiedi nel rapporto, spiegando perché.
8. **Build e prove**: `npm run build`, `npx tsc -p .`, poi le tue prove (`python3 test/<file>.py`) e `python3 test/f0_core.py` che deve restare verde. Tutto sul Mac; Windows lo prova l'orchestratore con GitHub Actions.
9. **Git**: fai commit sul tuo ramo, con messaggi chiari e la riga `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Non fai push, non fai merge.
10. **Rapporto finale** (massimo 400 parole): cosa è fatto (con i paragrafi dello studio), le prove e il loro esito, le richieste per `shared/` o per altri moduli, cosa resta (P0 non finiti, poi P1).
