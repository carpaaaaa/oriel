// The window module's commands and state (studio/01 §1.12, §1.19, §1.22;
// studio/02 §4.1, §4.7, §4.8). The window is drawn by Search: frameless and
// transparent, with 17.5 px corners and a shadow of its own in a clear margin
// around it; Windows' own frame stays as a hidden fallback (window.nativeFrame).

export type Edge = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface Insets { top: number; right: number; bottom: number; left: number }

export interface FrameView {
  /** drawn: frameless, Search draws corners, shadow and buttons; native:
   * Windows' frame with its own buttons (fallback); mac: the Mac's own. */
  kind: 'drawn' | 'native' | 'mac'
  /** Clear room around the window for its shadow, zero unless free. */
  margin: Insets
  /** How the window sits on the screen. Snapped = arranged by Windows Snap. */
  state: 'free' | 'maximized' | 'snapped' | 'fullScreen'
  /** The pointer is over the clear margin: clicks go to what is behind. */
  hollow: boolean
  /** Moving is done by hand (on a Mac, or without user32), not by Windows. */
  manual: boolean
  /** Resizing is done by hand. */
  manualResize: boolean
  /** Room outside and inside the visible edge where resizing starts. */
  grip: { outside: number; inside: number; corner: number }
}

export interface SideRoom { side: 'left' | 'right'; width: number }

declare module '../commands' {
  interface Commands {
    'window.fullScreen': { on?: boolean }
    /** The keys back to the page in front (or the interface, with no page):
     * what floated over it is gone (a drawn menu, a popover). */
    'window.focusPage': {}
    /** The pointer went over the clear margin (true) or back over the window. */
    'window.hollow': { hollow: boolean }
    /** Start resizing from an edge with the button held (screen DIP). */
    'window.startResize': { edge: Edge; x: number; y: number }
    /** Moving by hand: screen DIP of the pointer. */
    'window.moveDrag': { phase: 'start' | 'move' | 'end'; x: number; y: number }
    /** Resizing by hand: screen DIP of the pointer. */
    'window.resizeDrag': { edge: Edge; phase: 'start' | 'move' | 'end'; x: number; y: number }
    // Split View (studio/01 §8)
    /** Split Current Page / Separate Split Tabs (§8.19). */
    'split.toggle': { id?: string }
    /** The keys to the page on the left or right, or the next one round (§8.24). */
    'split.focus': { side: 'left' | 'right' | 'other' }
    /** Swap Pages, Separate (§8.27). */
    'split.swap': { id?: string }
    'split.separate': { id?: string }
    /** Where the room beside the page ended up (measured by the interface). */
    'window.room': { rect: { x: number; y: number; width: number; height: number } | null }
    /** Page zoom, kept for each site (studio/01 §2.22): times `by`, or back
     * to the default. */
    'view.zoom': { by?: number; reset?: boolean; id?: string }
    /** New shares of the split whose first page is `first` (§8.14). */
    'split.resize': { first: string; sizes: number[] }
    /** A tab carried over the page: the bands at its edges, the preview of
     * the side the pointer is in, or nothing any more (§8.17). */
    'split.dropHint': { hint: SplitDropHint | null }
    /** Let go in a band: the tab beside the page in front, on that side
     * (§8.17, Browser.pair). */
    'split.pair': { id: string; side: 'left' | 'right'; target?: string }
  }
}

/** The overlay's panel for a tab carried over the page (§8.17). */
export const SPLIT_DROP = 'split.drop'

export interface SplitDropHint {
  /** The page's card, in the window. */
  rect: { x: number; y: number; width: number; height: number }
  /** The band's width (TabDrag.band). */
  band: number
  /** The band the pointer is in, or null: both bands, faint. */
  side: 'left' | 'right' | null
  /** The pages as they would be, left to right, the carried one marked. */
  panes: { title: string; carried: boolean }[]
  /** The page let go on (the one in front, or the one from before the press). */
  page: string
}

declare module '../state' {
  interface WindowState {
    /** Missing until the main process sends it (the store starts without it). */
    frame?: FrameView
    /** Room asked beside the page (the extensions' side panel): the card
     * gets narrower by it on that side (studio/02 §4.1). */
    room?: SideRoom | null
    /** Windows' battery saver is on (Motion.light's Low Power Mode). */
    power?: { saving: boolean }
  }
}

export {}
