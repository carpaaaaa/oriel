# Credits

Oriel stands on other people's work. Thank you.

## Search, by Office Commun

Oriel is an unofficial Windows port of **[Search](https://github.com/driceroland/Search)**, the small, fast browser for the Mac made by **Office Commun** ([@driceroland](https://github.com/driceroland) and contributors), released under the MIT license.

From Search, Oriel takes:

- the design: the column of tabs, spaces and pins, the page as a card, the field, the grey that glides, colours, sizes, springs and the internal pages, measured from Search's source (`studio/02-aspetto.md` records every value and where it comes from);
- the behaviour: how tabs open, close, sleep and come back, the shortcuts, the settings and their defaults, the way extensions are offered, how other browsers' data is brought over, read from Search's source and its tests (`studio/`);
- the file formats of the session, spaces, pins, history and bookmarks, so the two can understand each other;
- the shape of its tests: a bench socket that drives the app in a world of its own;
- parts of its interface text, in English, adapted where it names macOS;
- the mark: Oriel's icon is Search's own, the pill with a letter cut out, with an O where Search has its S (`build/icon/`).

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
| [Bergamot Translator](https://github.com/browsermt/bergamot-translator) (`@browsermt/bergamot-translator`, the engine of Firefox Translations, in WebAssembly; with [Marian](https://github.com/browsermt/marian-dev), [SentencePiece](https://github.com/google/sentencepiece), [intgemm](https://github.com/kpu/intgemm) and [ssplit](https://github.com/browsermt/ssplit-cpp) inside) | the Bergamot project and Mozilla | MPL-2.0; the libraries inside keep their own (Marian and intgemm MIT, SentencePiece Apache-2.0). Its source is at the link. |
| [eld](https://github.com/nitotm/efficient-language-detector-js), Efficient Language Detector | Nito T.M. | Apache-2.0 |
| [@ghostery/adblocker](https://github.com/ghostery/adblocker), the engine behind Block ads and trackers (uBlock Origin's filter syntax: network, cosmetic and procedural filters, scriptlets, redirects), with its packages @ghostery/adblocker-content, @ghostery/adblocker-extended-selectors and @ghostery/url-parser | Ghostery GmbH and contributors | MPL-2.0. Its source is at the link. |

The full list of what ships inside the app, with each license, is in `THIRD_PARTY_LICENSES.md` (made by `npm run licenses`).

## Typeface

[Plus Jakarta Sans](https://github.com/tokotype/PlusJakartaSans), by Tokotype (Gumpita Rahayu), under the SIL Open Font License 1.1, packaged by [Fontsource](https://fontsource.org). It stands in for SF Pro, which only Apple's platforms may use, and takes the same room.

## Data

The Public Suffix List, by Mozilla and contributors, through tldts (MPL-2.0).

### Filter lists

Block ads and trackers uses the lists uBlock Origin has on by default. A copy compiled at build time ships with Oriel (`out/main/blocker/engine.bin`); Oriel then fetches them from their own sources about once a day (`src/main/pages/blocker/lists.json`).

| List | By | License |
|---|---|---|
| [uBlock filters](https://github.com/uBlockOrigin/uAssets): Ads, Badware risks, Privacy, Quick fixes, Unbreak; and uBlock Origin's scriptlets and redirect resources, in the form [@ghostery/adblocker](https://github.com/ghostery/adblocker) reads them | Raymond Hill and the uBlock Origin volunteers | GPL-3.0 |
| [EasyList and EasyPrivacy](https://easylist.to) | The EasyList authors | GPL-3.0 or CC BY-SA 3.0 |
| [Peter Lowe's Ad and tracking server list](https://pgl.yoyo.org/adservers/) | Peter Lowe | [his terms](https://pgl.yoyo.org/adservers/policy.php) |

## Pictures

The Image theme's starting picture (`src/ui/themes/assets/default-image.jpg`, the blue silhouette) is the project's own: generated with AI, with a glass filter by the author of this port. It ships with Oriel under the project's license.

The translation models: Mozilla's, from [firefox-translations-models](https://github.com/mozilla/firefox-translations-models) and the [translations](https://github.com/mozilla/translations) training pipeline (MPL-2.0), the ones Firefox uses. They don't ship with Oriel: each language pair is downloaded from Mozilla's own servers (Firefox's Remote Settings and its CDN) the first time a page is translated into or out of that language, checked against its SHA-256 and kept on the PC. Only the list of models and the model files are fetched; the words of a page never leave the PC.
