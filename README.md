# Oriel

**Oriel is [Search](https://github.com/driceroland/Search), for Windows.**

Search is the small, fast browser for the Mac by Office Commun. Oriel is the same browser rebuilt for Windows: the same column of tabs, spaces and pins, the same field, the same page as a card, the same shortcuts, settings and springs, measured from Search's own source. On top of that it runs Chrome extensions from the Chrome Web Store, and brings over bookmarks, history and passwords from Chrome, Edge, Brave, Opera, Vivaldi, Arc and Firefox.

It is an unofficial port: Oriel is not affiliated with Office Commun. Search is © Office Commun, MIT licensed; Oriel keeps its license.

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

## Credits

Oriel is built on [Search](https://github.com/driceroland/Search) by Office Commun, and on Electron, electron-chrome-extensions, Solid, koffi, tldts and the Plus Jakarta Sans typeface, among others. Who made what, and under which license: [CREDITS.md](CREDITS.md). Every package inside the app, with its license text: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## License

MIT, like Search. See `LICENSE`, which keeps Office Commun's copyright notice.
