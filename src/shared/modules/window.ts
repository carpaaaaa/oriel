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

declare module '../commands' {
  interface Commands {
    'window.fullScreen': { on?: boolean }
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
    /** Page zoom, kept for each site (studio/01 §2.22): times `by`, or back
     * to the default. */
    'view.zoom': { by?: number; reset?: boolean; id?: string }
    /** New shares of the split whose first page is `first` (§8.14). */
    'split.resize': { first: string; sizes: number[] }
  }
}

declare module '../state' {
  interface WindowState {
    /** Missing until the main process sends it (the store starts without it). */
    frame?: FrameView
  }
}

export {}
