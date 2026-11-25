// A page's scrollbars, minimal and in step with the browser (carpa, 25 Nov
// 2026: "minimal, in full theme"): on Windows Chromium draws the system's own,
// 15 px wide with an arrow at each end. Here a slim rounded thumb in a neutral
// grey that reads on a light page and on a dark one, no track, no arrows; it
// widens a little under the pointer. Drawn by Chromium's custom scrollbar
// (::-webkit-scrollbar), the same on every machine. The user's origin and not
// important: a site that styles its own scrollbars (this pseudo-element, or
// scrollbar-color and scrollbar-width) keeps them.

export const scrollbarCSS = `
::-webkit-scrollbar { width: 10px; height: 10px; background: transparent; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-corner { background: transparent; }
::-webkit-scrollbar-button { display: none; width: 0; height: 0; }
::-webkit-scrollbar-thumb { background: rgb(128 128 128 / .45); background-clip: content-box; border: 3px solid transparent; border-radius: 10px; min-height: 36px; min-width: 36px; }
::-webkit-scrollbar-thumb:hover { background: rgb(128 128 128 / .7); background-clip: content-box; border-width: 2px; }
::-webkit-scrollbar-thumb:active { background: rgb(128 128 128 / .85); background-clip: content-box; border-width: 2px; }
`
