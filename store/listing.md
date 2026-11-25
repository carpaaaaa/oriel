# Oriel Browser in the Microsoft Store

What goes into Partner Center for the product **Oriel Browser**
(`CharStudio.OrielBrowser`, publisher Char Studio). The package is made by
`npx electron-builder --win appx --x64 --arm64` (package.json `build.appx`);
the CI's `store` job keeps the two unsigned packages as artifacts
(`store-x64`, `store-arm64`): upload both in one submission, the Store signs
them.

## Pricing and availability

- Free. All markets. Discoverable in the Store.

## Properties

- Category: **Utilities & tools** (subcategory: none, or Browsers when offered).
- Privacy policy URL: https://oriel.charstudio.app/privacy
- Website: https://oriel.charstudio.app
- Support contact: support@charstudio.app
- System requirements: Windows 10 version 1809 or later, x64 or ARM64.

## Age rating

The questionnaire as a web browser: unrestricted internet access (yes), no
content of its own, no in-app purchases, no ads, no user-to-user features
of its own.

## Submission options: restricted capability

`runFullTrust`, with this note:

> Oriel is a desktop web browser built with Electron (Chromium). It runs as
> a full-trust desktop app to show web pages, run Chrome extensions, keep
> passwords sealed with Windows, and be offered as a browser in Default apps.

## Store listing (English, United States)

**Product name:** Oriel Browser

**Short description**

A small, fast browser for Windows: tabs down the side, one field for
addresses and searches, ads blocked, Chrome extensions. Free and open source.

**Description**

Oriel is a free, open source web browser for Windows, made by Char Studio.
It is an unofficial port of Search, the browser for the Mac by Office
Commun, and is not affiliated with or endorsed by them.

A column of tabs down the left, one field for addresses and searches, and
the page as a card beside them. No toolbar, no start page full of
suggestions, no account to sign into.

- One field: type an address and go there, type words and search.
- Tabs down the side or across the top, pins for the sites you keep open
  all day, and spaces for work, home or a side project.
- Ctrl+Tab goes back to the tab you used before; hold it to see every page
  of the space and pick one.
- Chrome extensions, installed straight from the Chrome Web Store.
- Ads and trackers blocked before they load.
- Bring bookmarks, history, extensions and passwords over from Chrome, Edge,
  Brave, Opera, Vivaldi, Arc and Firefox.
- Passwords kept in Oriel's own vault and filled after Windows Hello.
- Translate a page on your PC: the text never leaves your computer.
- Light and dark, Windows 11's corners and buttons, x64 and ARM64.

Oriel has no server of its own: your history, bookmarks, passwords and
settings stay on your PC. It goes online only for the pages you open, the
Chrome Web Store when you add an extension, and the blocking lists. The
code is on GitHub under the MIT license: https://github.com/carpaaaaa/oriel

Oriel from the Store keeps its own settings, apart from a copy installed
from the website, and the Store keeps it up to date.

**Product features** (one per line in Partner Center)

- Tabs down the side, pins and spaces
- One field for addresses and searches
- Ctrl+Tab switcher with a picture of every page
- Chrome extensions from the Chrome Web Store
- Ads and trackers blocked
- Bring everything over from other browsers
- Passwords behind Windows Hello
- Translation on your PC
- Free and open source, no account

**Search terms** (up to 7)

browser, web browser, vertical tabs, ad blocker, privacy, chromium, arc

**Screenshots** (1366 x 768 window at 2x, real Oriel):

1. `screenshots/1-page.png`: a page beside the column of tabs.
2. `screenshots/2-field.png`: the field over the page.
3. `screenshots/3-switcher.png`: Ctrl+Tab, every page with its picture.

**Store logos:** the package's own (build/appx, from Oriel's icon).

**Copyright:** Oriel contributors. Based on Search by Office Commun (MIT).

## After it's published

The product's Store ID (12 characters, starting with 9) goes on the
website's Download button as the Store's web installer: the badge at
https://apps.microsoft.com/badge with **Launch mode: Direct**. The button
then downloads a small installer made by the Store, and Oriel installs
without Windows' "Windows protected your PC".
