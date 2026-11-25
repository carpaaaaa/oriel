// A page's scrollbars, minimal and in step with the browser (carpa, 25 Nov
// 2026: "minimal, in full theme", then "the same on every site"): on Windows
// Chromium draws the system's own, 15 px wide with an arrow at each end. Here a
// slim rounded thumb in a neutral grey that reads on a light page and on a dark
// one, no track, no arrows; it widens a little under the pointer. Drawn by
// Chromium's custom scrollbar (::-webkit-scrollbar), the same on every machine.
// The user's origin and important, which outranks a site's own rules, important
// or not: a site's ::-webkit-scrollbar, scrollbar-color and scrollbar-width are
// set aside, so every site has the same. Settings > Pages > Scroll bars: Windows'
// own leaves all of it alone.

export const scrollbarCSS = `
* { scrollbar-width: auto !important; scrollbar-color: auto !important; }
::-webkit-scrollbar { width: 10px !important; height: 10px !important; background: transparent !important; }
::-webkit-scrollbar-track, ::-webkit-scrollbar-track-piece { background: transparent !important; }
::-webkit-scrollbar-corner { background: transparent !important; }
::-webkit-scrollbar-button { display: none !important; width: 0 !important; height: 0 !important; }
::-webkit-scrollbar-thumb { background: rgb(128 128 128 / .45) !important; background-clip: content-box !important; border: 3px solid transparent !important; border-radius: 10px !important; min-height: 36px !important; min-width: 36px !important; }
::-webkit-scrollbar-thumb:hover { background: rgb(128 128 128 / .7) !important; background-clip: content-box !important; border-width: 2px !important; }
::-webkit-scrollbar-thumb:active { background: rgb(128 128 128 / .85) !important; background-clip: content-box !important; border-width: 2px !important; }
`
