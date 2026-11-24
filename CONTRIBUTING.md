# Contributing

Thank you for helping. A few things make a change easy to take:

- **Follow Search.** Oriel is a port: where Search for Mac has a behaviour, a measure or a word, Oriel matches it, with Ctrl where the Mac has Cmd and Windows' own conventions where a Mac one doesn't exist. `studio/` (in Italian) records what was measured in Search's source.
- **One change at a time**, with a test. Tests drive the app through a socket in a world of their own (`test/bench.py`); look at a test in the same area and copy its shape. Run it with `python3 test/<name>.py` after `npm run build`.
- **Windows is the target.** Every push runs the tests on real Windows machines (x64 and ARM) through GitHub Actions; a change that passes only on the Mac isn't finished.
- **Plain words.** Interface text follows Search's English, and never uses an em dash.
- **No new native modules.** Windows APIs are called through `koffi`, so nothing needs compiling.

For a bug or an idea, [open an issue](https://github.com/carpaaaaa/oriel/issues/new/choose). For a security problem, see [SECURITY.md](SECURITY.md).

By contributing you agree that your work is released under the MIT license, like the rest of Oriel.
