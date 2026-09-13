import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useWikiRace } from "./use-wiki-race";

describe("useWikiRace", () => {
  it("starts in loading status", () => {
    const { result } = renderHook(() => useWikiRace());
    expect(result.current.status).toBe("loading");
  });

  it("transitions to playing with the loaded article on a successful start", async () => {
    const { result } = renderHook(() => useWikiRace());
    const loadStart = vi.fn().mockResolvedValue({ title: "Start", html: "<p/>", isTarget: false });

    await act(async () => {
      result.current.start(loadStart);
    });

    expect(result.current.status).toBe("playing");
    expect(result.current.title).toBe("Start");
    expect(result.current.path).toEqual(["Start"]);
    expect(result.current.clicks).toBe(0);
  });

  it("transitions to error when the initial load fails", async () => {
    const { result } = renderHook(() => useWikiRace());
    const loadStart = vi.fn().mockRejectedValue(new Error("network down"));

    await act(async () => {
      result.current.start(loadStart);
    });

    expect(result.current.status).toBe("error");
    expect(result.current.errorMessage).toBe("network down");
  });

  it("handleNavigate increments clicks and appends to the path", async () => {
    const { result } = renderHook(() => useWikiRace());
    const loadStart = vi.fn().mockResolvedValue({ title: "Start", html: "<p/>", isTarget: false });
    await act(async () => {
      result.current.start(loadStart);
    });

    const navigate = vi.fn().mockResolvedValue({ title: "Next", html: "<p/>", isTarget: false });
    await act(async () => {
      await result.current.handleNavigate("Next", navigate);
    });

    expect(result.current.clicks).toBe(1);
    expect(result.current.path).toEqual(["Start", "Next"]);
    expect(result.current.status).toBe("playing");
  });

  it("flips to won when the navigated article is the target", async () => {
    const { result } = renderHook(() => useWikiRace());
    const loadStart = vi.fn().mockResolvedValue({ title: "Start", html: "<p/>", isTarget: false });
    await act(async () => {
      result.current.start(loadStart);
    });

    const navigate = vi.fn().mockResolvedValue({ title: "Tuberculosis", html: "<p/>", isTarget: true });
    await act(async () => {
      await result.current.handleNavigate("Tuberculosis", navigate);
    });

    expect(result.current.status).toBe("won");
  });

  it("keeps playing and surfaces an error message when navigation fails", async () => {
    const { result } = renderHook(() => useWikiRace());
    const loadStart = vi.fn().mockResolvedValue({ title: "Start", html: "<p/>", isTarget: false });
    await act(async () => {
      result.current.start(loadStart);
    });

    const navigate = vi.fn().mockRejectedValue(new Error("could not load page"));
    await act(async () => {
      await result.current.handleNavigate("Broken", navigate);
    });

    expect(result.current.status).toBe("playing");
    expect(result.current.errorMessage).toBe("could not load page");
    expect(result.current.clicks).toBe(0);
  });

  it("ignores navigation while not in the playing state", async () => {
    const { result } = renderHook(() => useWikiRace());
    const navigate = vi.fn();

    await act(async () => {
      await result.current.handleNavigate("Anything", navigate);
    });

    expect(navigate).not.toHaveBeenCalled();
  });

  it("loadInBackground only triggers the loader once per hook instance", async () => {
    const { result } = renderHook(() => useWikiRace());
    const loadStart = vi.fn().mockResolvedValue({ title: "Start", html: "<p/>", isTarget: false });

    await act(async () => {
      result.current.loadInBackground(loadStart);
      result.current.loadInBackground(loadStart);
    });

    expect(loadStart).toHaveBeenCalledOnce();
  });
});
