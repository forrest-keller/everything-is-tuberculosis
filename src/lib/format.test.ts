import { describe, expect, it } from "vitest";
import { formatDuration } from "./format";

describe("formatDuration", () => {
  it("formats sub-minute durations as m:ss", () => {
    expect(formatDuration(0)).toBe("00:00");
    expect(formatDuration(5000)).toBe("00:05");
  });

  it("pads seconds and minutes below 10", () => {
    expect(formatDuration(65_000)).toBe("01:05");
  });

  it("omits the hour component below one hour", () => {
    expect(formatDuration(59 * 60_000 + 59_000)).toBe("59:59");
  });

  it("includes hours once the duration reaches an hour", () => {
    expect(formatDuration(60 * 60_000)).toBe("1:00:00");
    expect(formatDuration(3 * 60 * 60_000 + 2 * 60_000 + 3_000)).toBe("3:02:03");
  });

  it("truncates partial seconds instead of rounding", () => {
    expect(formatDuration(1_999)).toBe("00:01");
  });
});
