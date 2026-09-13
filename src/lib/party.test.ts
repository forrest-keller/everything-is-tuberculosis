import { describe, expect, it } from "vitest";
import { applyRealtimeChange, type RealtimeRowChange } from "./party";

interface Item {
  id: string;
  value: string;
}

describe("applyRealtimeChange", () => {
  it("appends a new row on INSERT", () => {
    const list: Item[] = [{ id: "1", value: "a" }];
    const change: RealtimeRowChange<Item> = {
      eventType: "INSERT",
      id: "2",
      row: { id: "2", value: "b" },
    };
    expect(applyRealtimeChange(list, change)).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ]);
  });

  it("replaces the matching row on UPDATE", () => {
    const list: Item[] = [
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ];
    const change: RealtimeRowChange<Item> = {
      eventType: "UPDATE",
      id: "2",
      row: { id: "2", value: "updated" },
    };
    expect(applyRealtimeChange(list, change)).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "updated" },
    ]);
  });

  it("treats an UPDATE for an unknown id as an insert", () => {
    const list: Item[] = [{ id: "1", value: "a" }];
    const change: RealtimeRowChange<Item> = {
      eventType: "UPDATE",
      id: "2",
      row: { id: "2", value: "b" },
    };
    expect(applyRealtimeChange(list, change)).toEqual([
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ]);
  });

  it("removes the matching row on DELETE", () => {
    const list: Item[] = [
      { id: "1", value: "a" },
      { id: "2", value: "b" },
    ];
    const change: RealtimeRowChange<Item> = { eventType: "DELETE", id: "1", row: null };
    expect(applyRealtimeChange(list, change)).toEqual([{ id: "2", value: "b" }]);
  });

  it("is a no-op deleting an id that isn't present", () => {
    const list: Item[] = [{ id: "1", value: "a" }];
    const change: RealtimeRowChange<Item> = { eventType: "DELETE", id: "does-not-exist", row: null };
    expect(applyRealtimeChange(list, change)).toEqual(list);
  });

  it("is a no-op when an INSERT/UPDATE has no row payload", () => {
    const list: Item[] = [{ id: "1", value: "a" }];
    const change: RealtimeRowChange<Item> = { eventType: "INSERT", id: "2", row: null };
    expect(applyRealtimeChange(list, change)).toBe(list);
  });
});
