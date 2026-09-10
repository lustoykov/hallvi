import { createContext } from "react";

/**
 * Page-wide motion: reduced (the system setting or the page toggle) and
 * whether the tab is hidden.
 */
export const MotionContext = createContext({ reduced: false, hidden: false });
