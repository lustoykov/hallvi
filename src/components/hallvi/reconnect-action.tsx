"use client";

import { createContext, useContext } from "react";

/** Shared by the existing header and release-strip action. */
export const ReconnectActionContext = createContext({
  label: "Open the connection again",
  disabled: false,
});

export function useReconnectAction() {
  return useContext(ReconnectActionContext);
}
