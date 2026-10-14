import { describe, it, expect } from "vitest";
import { isValidUrl, normalizeUrl } from "./url-validation";

describe("isValidUrl", () => {
  it("accepts full URLs with protocol", () => {
    expect(isValidUrl("https://example.com")).toBe(true);
    expect(isValidUrl("http://example.com")).toBe(true);
    expect(isValidUrl("https://example.com/path?query=1")).toBe(true);
  });

  it("accepts bare domains without protocol", () => {
    expect(isValidUrl("google.com")).toBe(true);
    expect(isValidUrl("www.google.com")).toBe(true);
    expect(isValidUrl("example.co.uk")).toBe(true);
  });

  it("rejects values without a dot", () => {
    expect(isValidUrl("google")).toBe(false);
    expect(isValidUrl("just text")).toBe(false);
  });

  it("rejects domains with extension shorter than 2 chars", () => {
    expect(isValidUrl("google.c")).toBe(false);
  });

  it("rejects empty and non-string values", () => {
    expect(isValidUrl("")).toBe(false);
    expect(isValidUrl("   ")).toBe(false);
    expect(isValidUrl(null as unknown as string)).toBe(false);
    expect(isValidUrl(undefined as unknown as string)).toBe(false);
  });

  it("trims whitespace before validation", () => {
    expect(isValidUrl("  google.com  ")).toBe(true);
  });
});

describe("normalizeUrl", () => {
  it("adds https:// to bare domains", () => {
    expect(normalizeUrl("google.com")).toBe("https://google.com");
    expect(normalizeUrl("www.google.com")).toBe("https://www.google.com");
  });

  it("keeps existing protocol", () => {
    expect(normalizeUrl("https://example.com")).toBe("https://example.com");
    expect(normalizeUrl("http://example.com")).toBe("http://example.com");
  });

  it("trims whitespace", () => {
    expect(normalizeUrl("  google.com  ")).toBe("https://google.com");
  });
});
