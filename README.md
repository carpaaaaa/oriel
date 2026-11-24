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

## Security

What to know before installing, said plainly:

- **The installers and updates aren't code-signed.** Oriel has no code-signing certificate yet. Windows shows "Windows protected your PC" on the first install (More info, then Run anyway), and the updater checks only that a downloaded installer matches the SHA-512 written next to it in the release (`latest.yml`), on the same GitHub page. Nothing checks who made it: anyone who took over this repository or its release token could ship an update that installed copies would accept, and with "Install updates on its own" on it would be put in place when Oriel quits. Signing (and setting the publisher so the updater checks the signature) is the fix, and it needs a certificate. Until then, with "Install updates on its own" off (Settings › About) nothing is installed until you press Install, so you can look at the release on GitHub first.
- **The portable copy never updates itself**: download the new version to update it.
- **Checking for updates sends nothing about you**: Oriel asks GitHub for the latest release at launch and every hour. There is no telemetry.
- **Passwords** are encrypted on disk with a key that Windows keeps for your user account (DPAPI). Windows Hello guards showing and copying them in Oriel, not the file: another program running as you can read it, as with other browsers.
- **Test hooks** (`SEARCH_PROBE` and the other variables the tests use) work only in a build run from source with `electron .`; an installed copy ignores them.

Found a security problem? Open an issue on this repository (not on Search's): Office Commun has nothing to do with Oriel's code.

## Credits

Oriel is built on [Search](https://github.com/driceroland/Search) by Office Commun, and on Electron, electron-chrome-extensions, Solid, koffi, tldts and the Plus Jakarta Sans typeface, among others. Who made what, and under which license: [CREDITS.md](CREDITS.md). Every package inside the app, with its license text: [THIRD_PARTY_LICENSES.md](THIRD_PARTY_LICENSES.md).

## License

MIT, like Search. See `LICENSE`, which keeps Office Commun's copyright notice.
