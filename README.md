# Oriel

An unofficial Windows port of [Search](https://github.com/driceroland/Search), the small, fast browser for the Mac by Office Commun. Oriel aims to look and behave like Search, on Windows: the column of tabs, spaces and pins, the field, the page as a card. It runs Chrome extensions from the Chrome Web Store and brings over bookmarks, history and passwords from other browsers.

Oriel is not affiliated with Office Commun. Search is © Office Commun, MIT licensed; Oriel keeps its license.

Work in progress. `PIANO.md` (Italian) holds the study, the decisions and the plan; `studio/` the detailed study of the Mac source.

## Build

```
npm ci
npm run build
npm start
```

Tests drive the app through a socket, in a world of its own (`test/bench.py`):

```
python3 test/f0_core.py
```

Windows builds and tests run on GitHub Actions (x64 and ARM).

## License

MIT. See `LICENSE`.
