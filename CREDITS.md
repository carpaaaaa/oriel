# Credits

Oriel stands on other people's work. Thank you.

## Search, by Office Commun

Oriel is an unofficial Windows port of **[Search](https://github.com/driceroland/Search)**, the small, fast browser for the Mac made by **Office Commun** (Drice Roland and contributors), released under the MIT license.

From Search, Oriel takes:

- the design: the column of tabs, spaces and pins, the page as a card, the field, the grey that glides, colours, sizes, springs and the internal pages, measured from Search's source (`studio/02-aspetto.md` records every value and where it comes from);
- the behaviour: how tabs open, close, sleep and come back, the shortcuts, the settings and their defaults, the way extensions are offered, how other browsers' data is brought over, read from Search's source and its tests (`studio/`);
- the file formats of the session, spaces, pins, history and bookmarks, so the two can understand each other;
- the shape of its tests: a bench socket that drives the app in a world of its own;
- parts of its interface text, in English, adapted where it names macOS.

Oriel is not made, endorsed or supported by Office Commun. Search's copyright notice is kept in `LICENSE`, as its license asks. Bugs in Oriel are Oriel's: please don't report them to Search.

## Libraries

| What | By | License |
|---|---|---|
| [Electron](https://github.com/electron/electron) (with Chromium and Node.js) | the Electron community | MIT (Chromium's own licenses ship with the app) |
| [electron-chrome-extensions](https://github.com/samuelmaddock/electron-browser-shell) | Samuel Maddock | MIT |
| [electron-chrome-web-store](https://github.com/samuelmaddock/electron-browser-shell) | Samuel Maddock | MIT |
| [Solid](https://github.com/solidjs/solid) | Ryan Carniato and contributors | MIT |
| [koffi](https://github.com/Koromix/koffi) | Niels Martignène | MIT |
| [tldts](https://github.com/remusao/tldts) | Rémi Berson | MIT |
| [Vite](https://github.com/vitejs/vite), [vite-plugin-solid](https://github.com/solidjs/solid-vite-plugin) | Evan You and contributors; Alexandre Mouton-Brady | MIT |
| [esbuild](https://github.com/evanw/esbuild) | Evan Wallace | MIT |
| [electron-builder](https://github.com/electron-userland/electron-builder) | Vladimir Krivosheev and contributors | MIT |
| [TypeScript](https://github.com/microsoft/TypeScript) | Microsoft | Apache-2.0 |

The full list of what ships inside the app, with each license, is in `THIRD_PARTY_LICENSES.md` (made by `npm run licenses`).

## Typeface

[Inter](https://rsms.me/inter/), by Rasmus Andersson, under the SIL Open Font License 1.1, packaged by [Fontsource](https://fontsource.org). It stands in for SF Pro, which only Apple's platforms may use.

## Data

The Public Suffix List, by Mozilla and contributors, through tldts (MPL-2.0).
