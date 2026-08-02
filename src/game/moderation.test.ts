import { describe, it, expect } from "vitest";
import { containsBannedWord } from "./moderation.ts";

describe("containsBannedWord", () => {
  it("allows ordinary names", () => {
    expect(containsBannedWord("Alex")).toBe(false);
    expect(containsBannedWord("Mount Cook Legend")).toBe(false);
    expect(containsBannedWord("")).toBe(false);
  });

  it("catches a banned word on its own", () => {
    expect(containsBannedWord("shit")).toBe(true);
  });

  it("catches a banned word embedded in a longer name", () => {
    expect(containsBannedWord("xXfuckboiXx")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(containsBannedWord("BiTcH")).toBe(true);
  });

  it("catches common leetspeak substitutions", () => {
    expect(containsBannedWord("5h1t")).toBe(true);
    expect(containsBannedWord("f4g"));
  });

  it("catches banned words split by punctuation or spaces", () => {
    expect(containsBannedWord("f-u-c-k")).toBe(true);
    expect(containsBannedWord("cu nt")).toBe(true);
  });
});
