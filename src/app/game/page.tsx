"use client";

import { useCallback, useEffect, useReducer } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { GameHeader } from "@/components/game-header";
import { WikiArticle } from "@/components/wiki-article";
import { WinDialog } from "@/components/win-dialog";
import { useStopwatch } from "@/hooks/use-stopwatch";
import { fetchArticleByTitle, fetchRandomArticle } from "@/lib/wiki-client";
import { AlertTriangle, Loader2 } from "lucide-react";

type Status = "loading" | "playing" | "navigating" | "won" | "error";

interface GameState {
  status: Status;
  title: string;
  html: string;
  clicks: number;
  path: string[];
  errorMessage: string | null;
  dialogOpen: boolean;
}

type Action =
  | { type: "LOAD_START" }
  | { type: "LOAD_SUCCESS"; title: string; html: string }
  | { type: "LOAD_ERROR"; message: string }
  | { type: "NAV_START" }
  | { type: "NAV_SUCCESS"; title: string; html: string; won: boolean }
  | { type: "NAV_ERROR"; message: string }
  | { type: "SET_DIALOG_OPEN"; open: boolean };

const initialState: GameState = {
  status: "loading",
  title: "",
  html: "",
  clicks: 0,
  path: [],
  errorMessage: null,
  dialogOpen: false,
};

function reducer(state: GameState, action: Action): GameState {
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
        dialogOpen: false,
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
        dialogOpen: action.won,
      };
    case "NAV_ERROR":
      return { ...state, status: "playing", errorMessage: action.message };
    case "SET_DIALOG_OPEN":
      return { ...state, dialogOpen: action.open };
    default:
      return state;
  }
}

export default function GamePage() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stopwatch = useStopwatch();

  // Used by the Restart / Try again / Play again buttons (event handlers),
  // where a synchronous "reset to loading" dispatch is expected.
  const startNewGame = useCallback(async () => {
    dispatch({ type: "LOAD_START" });
    try {
      const article = await fetchRandomArticle();
      dispatch({ type: "LOAD_SUCCESS", title: article.title, html: article.html });
      stopwatch.start();
    } catch (err) {
      dispatch({
        type: "LOAD_ERROR",
        message: err instanceof Error ? err.message : "Failed to load a starting article.",
      });
    }
  }, [stopwatch]);

  // Initial load on mount: state already starts as "loading", so this effect
  // only dispatches after the fetch resolves, never synchronously.
  useEffect(() => {
    let cancelled = false;
    fetchRandomArticle()
      .then((article) => {
        if (cancelled) return;
        dispatch({ type: "LOAD_SUCCESS", title: article.title, html: article.html });
        stopwatch.start();
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        dispatch({
          type: "LOAD_ERROR",
          message: err instanceof Error ? err.message : "Failed to load a starting article.",
        });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleNavigate = useCallback(
    async (title: string) => {
      if (state.status !== "playing") return;
      dispatch({ type: "NAV_START" });
      try {
        const article = await fetchArticleByTitle(title);
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
    [state.status, stopwatch]
  );

  return (
    <div className="flex min-h-screen flex-col">
      <GameHeader
        clicks={state.clicks}
        elapsedMs={stopwatch.elapsedMs}
        currentTitle={state.title}
        isRunning={state.status === "playing" || state.status === "navigating"}
        onRestart={startNewGame}
      />

      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        {state.status === "loading" && (
          <div className="space-y-3">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-48 w-full" />
          </div>
        )}

        {state.status === "error" && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle />
            <AlertTitle>Couldn&apos;t start the game</AlertTitle>
            <AlertDescription>
              <p>{state.errorMessage}</p>
              <Button size="sm" className="mt-2" onClick={startNewGame}>
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {(state.status === "playing" ||
          state.status === "navigating" ||
          state.status === "won") && (
          <>
            {state.errorMessage && (
              <Alert variant="destructive" className="mb-4">
                <AlertTriangle />
                <AlertTitle>Couldn&apos;t load that page</AlertTitle>
                <AlertDescription>{state.errorMessage}</AlertDescription>
              </Alert>
            )}

            <Card className="relative overflow-visible">
              {state.status === "navigating" && (
                <div className="absolute inset-0 z-10 flex items-start justify-center rounded-xl bg-background/60 pt-16 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 rounded-full border bg-background px-3 py-1.5 text-sm shadow-sm">
                    <Loader2 className="size-4 animate-spin" />
                    Loading next article…
                  </div>
                </div>
              )}
              <CardContent
                className={
                  state.status === "navigating" ? "pointer-events-none select-none" : ""
                }
              >
                <h1 className="mb-4 font-heading text-2xl font-semibold">{state.title}</h1>
                <WikiArticle html={state.html} onNavigate={handleNavigate} />
              </CardContent>
            </Card>
          </>
        )}
      </main>

      <WinDialog
        open={state.dialogOpen}
        onOpenChange={(open) => dispatch({ type: "SET_DIALOG_OPEN", open })}
        clicks={state.clicks}
        elapsedMs={stopwatch.elapsedMs}
        path={state.path}
        onPlayAgain={startNewGame}
      />
    </div>
  );
}
