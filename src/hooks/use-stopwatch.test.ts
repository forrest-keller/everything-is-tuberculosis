import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStopwatch } from "./use-stopwatch";

describe("useStopwatch", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts at zero", () => {
    const { result } = renderHook(() => useStopwatch());
    expect(result.current.elapsedMs).toBe(0);
  });

  it("counts up while running", () => {
    const { result } = renderHook(() => useStopwatch());

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(1000));

    expect(result.current.elapsedMs).toBeGreaterThanOrEqual(1000);
  });

  it("freezes the elapsed time once stopped", () => {
    const { result } = renderHook(() => useStopwatch());

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(500));
    act(() => result.current.stop());
    const stoppedAt = result.current.elapsedMs;

    act(() => vi.advanceTimersByTime(1000));
    expect(result.current.elapsedMs).toBe(stoppedAt);
  });

  it("is a no-op calling stop before start", () => {
    const { result } = renderHook(() => useStopwatch());
    act(() => result.current.stop());
    expect(result.current.elapsedMs).toBe(0);
  });

  it("resets to zero when started again", () => {
    const { result } = renderHook(() => useStopwatch());

    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(1000));
    act(() => result.current.start());

    expect(result.current.elapsedMs).toBe(0);
  });
});
