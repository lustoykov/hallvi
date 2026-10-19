"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";
import type { CallDetail, CallReference } from "@/lib/call-detail";

/** A parked conversation retains its UI state, but reads no hidden output. */
export const CallDetailsVisible = createContext(true);

export const disclosureKey = (
  kind: string,
  app: string,
  chat: string,
  id: string,
) => `hv:disclosure:${app}:${chat}:${kind}:${id}`;

export function disclosureOpen(key: string) {
  try {
    return sessionStorage.getItem(key) === "open";
  } catch {
    return false;
  }
}

export const noDisclosureSubscription = () => () => {};
const noSavedState = () => undefined;

/** Remember UI state only. Output is never written to browser storage. */
export function useDisclosure(key: string, initiallyOpen = false) {
  const [defaultOpen] = useState(initiallyOpen);
  const [choice, change] = useState<boolean | undefined>();
  const saved = useSyncExternalStore(
    noDisclosureSubscription,
    () => {
      try {
        const value = sessionStorage.getItem(key);
        return value === "open" ? true : value === "closed" ? false : undefined;
      } catch {
        return undefined;
      }
    },
    noSavedState,
  );
  const open = choice ?? saved ?? defaultOpen;
  useEffect(() => {
    try {
      if (defaultOpen && sessionStorage.getItem(key) === null)
        sessionStorage.setItem(key, "open");
    } catch {
      /* Automatic live disclosures still work without storage. */
    }
  }, [key, defaultOpen]);
  const setOpen = useCallback(
    (value: boolean) => {
      change(value);
      try {
        sessionStorage.setItem(key, value ? "open" : "closed");
      } catch {
        /* Open state still works without storage. */
      }
    },
    [key],
  );
  return [open, setOpen] as const;
}

/** One read per open/version; only this mounted disclosure holds its result. */
export function useCallDetail(
  app: string,
  chat: string | undefined,
  id: string,
  version: string | undefined,
  open: boolean,
  reference?: CallReference,
) {
  const visible = useContext(CallDetailsVisible);
  const [attempt, setAttempt] = useState(0);
  const source = JSON.stringify([app, chat, id]);
  const query = new URLSearchParams();
  for (const name of ["entryId", "resultEntryId", "executionId"] as const) {
    const value = reference?.[name];
    if (value !== undefined) query.set(name, String(value));
  }
  const encoded = query.toString();
  const parameters = encoded ? `?${encoded}` : "";
  const key =
    visible && open && version && chat
      ? JSON.stringify([app, chat, id, version, parameters, attempt])
      : "";
  const [state, setState] = useState<{
    key: string;
    source: string;
    detail: CallDetail | null;
    error: string | null;
  }>({ key, source, detail: null, error: null });
  if (state.key !== key)
    setState({
      key,
      source,
      detail: key && state.source === source ? state.detail : null,
      error: null,
    });
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    void fetch(
      `/api/applications/${app}/chats/${chat}/calls/${encodeURIComponent(id)}${parameters}`,
      {
        cache: "no-store",
        signal: controller.signal,
      },
    )
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok)
          throw new Error(body.error ?? "Could not load this call.");
        if (!controller.signal.aborted)
          setState({ key, source, detail: body, error: null });
      })
      .catch((error: Error) => {
        if (!controller.signal.aborted)
          setState((current) => ({
            key,
            source,
            detail: current.detail,
            error: error.message,
          }));
      });
    return () => controller.abort();
  }, [app, chat, id, key, source, parameters]);
  return {
    detail: state.detail,
    error: state.error,
    loading: Boolean(key && !state.detail && !state.error),
    retry: () => setAttempt((value) => value + 1),
  };
}
