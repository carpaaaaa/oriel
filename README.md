# Search for Windows

An unofficial Windows port of [Search](https://github.com/driceroland/Search), the small, fast browser for the Mac by Office Commun. Not affiliated with Office Commun.

Work in progress. See `PIANO.md` (Italian) for the study, the decisions and the plan, and `studio/` for the detailed study of the Mac source.

## Build

```
npm ci
npm run build
npm start
```

Tests drive the app through a socket in a world of its own (`test/bench.py`):

```
python3 test/f0_core.py
```

## License

MIT, as Search itself. Search is © Office Commun; see `LICENSE`.
