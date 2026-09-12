"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useStopwatch() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const startRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current !== null) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(() => {
    clearTimer();
    startRef.current = Date.now();
    setElapsedMs(0);
    intervalRef.current = setInterval(() => {
      if (startRef.current !== null) {
        setElapsedMs(Date.now() - startRef.current);
      }
    }, 250);
  }, [clearTimer]);

  const stop = useCallback(() => {
    if (startRef.current !== null) {
      setElapsedMs(Date.now() - startRef.current);
    }
    clearTimer();
  }, [clearTimer]);

  useEffect(() => clearTimer, [clearTimer]);

  return { elapsedMs, start, stop };
}
