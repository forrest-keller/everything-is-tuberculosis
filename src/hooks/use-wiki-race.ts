"use client";

import { useCallback, useReducer, useRef } from "react";
import { useStopwatch } from "@/hooks/use-stopwatch";
import { fetchArticleByTitle, type WikiArticleResponse } from "@/lib/wiki-client";

export type RaceStatus = "loading" | "playing" | "navigating" | "won" | "error";

export interface RaceState {
  status: RaceStatus;
  title: string;
  html: string;
  clicks: number;
  path: string[];
  errorMessage: string | null;
}

type Action =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; title: string; html: string }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "NAV_START" }
  | { type: "NAV_SUCCESS"; title: string; html: string; won: boolean }
  | { type: "NAV_ERROR"; message: string };

const initialState: RaceState = {
  status: "loading",
  title: "",
  html: "",
  clicks: 0,
  path: [],
  errorMessage: null,
};

function reducer(state: RaceState, action: Action): RaceState {
  switch (action.type) {
    case "LOAD_START":
      return { ...initialState, status: "loading" };
    case "LOAD_SUCCESS":
      return {
        ...state,
        status: "playing",
        title: action.title,
        html: action.html,
        clicks: 0,
        path: [action.title],
        errorMessage: null,
      };
    case "LOAD_ERROR":
      return { ...state, status: "error", errorMessage: action.message };
    case "NAV_START":
      return { ...state, status: "navigating", errorMessage: null };
    case "NAV_SUCCESS":
      return {
        ...state,
        status: action.won ? "won" : "playing",
        title: action.title,
        html: action.html,
        clicks: state.clicks + 1,
        path: [...state.path, action.title],
      };
    case "NAV_ERROR":
      return { ...state, status: "playing", errorMessage: action.message };
    default:
      return state;
  }
}

/**
 * Drives one "race to Tuberculosis": tracks the current article, click count,
 * path, and a stopwatch, and exposes the click-to-navigate handler. Used by
 * solo, daily-challenge, and party-mode gameplay alike; each caller only
 * differs in how the *first* article is loaded and what happens on a win.
 */
export function useWikiRace() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stopwatch = useStopwatch();
  const loadRequestId = useRef(0);

  // Guards against a load being superseded by a newer one before it resolves.
  const runLoad = useCallback(
    async (loadStart: () => Promise<WikiArticleResponse>) => {
      const requestId = ++loadRequestId.current;
      try {
        const article = await loadStart();
        if (loadRequestId.current !== requestId) return;
        dispatch({ type: "LOAD_SUCCESS", title: article.title, html: article.html });
        stopwatch.start();
      } catch (err) {
        if (loadRequestId.current !== requestId) return;
        dispatch({
          type: "LOAD_ERROR",
          message: err instanceof Error ? err.message : "Failed to load the starting article.",
        });
      }
    },
    [stopwatch],
  );

  // For event handlers (Restart, Try again): flips to "loading" immediately.
  const start = useCallback(
    (loadStart: () => Promise<WikiArticleResponse>) => {
      dispatch({ type: "LOAD_START" });
      void runLoad(loadStart);
    },
    [runLoad],
  );

  // For effects (mount, realtime round changes): never synchronously
  // dispatches, so it's safe to call from a useEffect body. Callers rely on
  // the reducer's default "loading" status already covering the initial UI.
  //
  // Idempotent per hook instance (unlike `start`): React Strict Mode
  // double-invokes a mount effect in dev without actually remounting the
  // component, so the ref below — not just `loadRequestId` above — is what
  // stops that from firing the underlying fetch (e.g. the random-article
  // API) twice. A real remount gets a fresh hook instance and thus a fresh
  // ref, so this never blocks a legitimate reload.
  const hasLoadedInBackgroundRef = useRef(false);
  const loadInBackground = useCallback(
    (loadStart: () => Promise<WikiArticleResponse>) => {
      if (hasLoadedInBackgroundRef.current) return;
      hasLoadedInBackgroundRef.current = true;
      void runLoad(loadStart);
    },
    [runLoad],
  );

  const handleNavigate = useCallback(
    async (
      title: string,
      navigate: (title: string) => Promise<WikiArticleResponse> = fetchArticleByTitle,
    ) => {
      if (state.status !== "playing") return;
      dispatch({ type: "NAV_START" });
      try {
        const article = await navigate(title);
        if (article.isTarget) stopwatch.stop();
        dispatch({
          type: "NAV_SUCCESS",
          title: article.title,
          html: article.html,
          won: article.isTarget,
        });
      } catch (err) {
        dispatch({
          type: "NAV_ERROR",
          message: err instanceof Error ? err.message : `Failed to load "${title}".`,
        });
      }
    },
    [state.status, stopwatch],
  );

  return { ...state, elapsedMs: stopwatch.elapsedMs, start, loadInBackground, handleNavigate };
}
