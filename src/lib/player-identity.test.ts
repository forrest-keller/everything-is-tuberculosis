import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrCreatePlayerId, getSavedPlayerName, savePlayerName } from "./player-identity";

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("getOrCreatePlayerId", () => {
  it("creates and persists an id on first use", () => {
    const id = getOrCreatePlayerId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(window.localStorage.getItem("eit:player-id")).toBe(id);
  });

  it("returns the same id on subsequent calls", () => {
    const first = getOrCreatePlayerId();
    const second = getOrCreatePlayerId();
    expect(second).toBe(first);
  });
});

describe("getSavedPlayerName / savePlayerName", () => {
  it("returns an empty string when nothing has been saved", () => {
    expect(getSavedPlayerName()).toBe("");
  });

  it("returns the last saved name", () => {
    savePlayerName("Florence Nightingale");
    expect(getSavedPlayerName()).toBe("Florence Nightingale");
  });
});

describe("on the server (no window)", () => {
  it("getOrCreatePlayerId returns an empty string", () => {
    vi.stubGlobal("window", undefined);
    expect(getOrCreatePlayerId()).toBe("");
  });

  it("getSavedPlayerName returns an empty string", () => {
    vi.stubGlobal("window", undefined);
    expect(getSavedPlayerName()).toBe("");
  });

  it("savePlayerName is a no-op", () => {
    vi.stubGlobal("window", undefined);
    expect(() => savePlayerName("Bob")).not.toThrow();
  });
});
