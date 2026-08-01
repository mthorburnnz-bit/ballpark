import { describe, it, expect } from "vitest";
import { formatNumber } from "./format.ts";

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
