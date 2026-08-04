import { describe, it, expect } from "vitest";
import { formatNumber, formatTickNumber } from "./format.ts";

describe("formatNumber", () => {
  it("prefixes $ amounts", () => {
    expect(formatNumber(400000, "$")).toBe("$400,000");
  });

  it("prefixes other currency symbols the same way (not as a suffix)", () => {
    expect(formatNumber(11.44, "£")).toBe("£11.44");
    expect(formatNumber(23.15, "NZ$")).toBe("NZ$23.15");
  });

  it("suffixes percentages", () => {
    expect(formatNumber(42, "%")).toBe("42%");
  });

  it("formats years without thousands separators", () => {
    expect(formatNumber(1903, "year")).toBe("1903");
  });

  it("suffixes generic units with a space", () => {
    expect(formatNumber(206, "bones")).toBe("206 bones");
  });
});

describe("formatTickNumber", () => {
  it("matches formatNumber below 1000, where there's nothing to compact", () => {
    expect(formatTickNumber(30, "players")).toBe("30 players");
    expect(formatTickNumber(1, "players")).toBe("1 players");
  });

  it("never compacts calendar years, however large the tick value looks", () => {
    expect(formatTickNumber(1903, "year")).toBe("1903");
  });

  it("compacts thousands/millions/billions/trillions with a letter suffix", () => {
    expect(formatTickNumber(10_000, "years")).toBe("10K years");
    expect(formatTickNumber(10_000_000, "years")).toBe("10M years");
    expect(formatTickNumber(100_000_000_000, "years")).toBe("100B years");
    expect(formatTickNumber(1_000_000_000_000, "years")).toBe("1T years");
  });

  it("keeps the currency prefix convention when compacting", () => {
    expect(formatTickNumber(10_000_000, "$")).toBe("$10M");
  });

  it("falls back to a power-of-ten past quadrillion, where suffixes stop being recognizable", () => {
    expect(formatTickNumber(1e19, "arrangements")).toBe("10¹⁹ arrangements");
    expect(formatTickNumber(1e26, "arrangements")).toBe("10²⁶ arrangements");
  });
});
