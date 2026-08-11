/**
 * Tests for isValidSpecName validation.
 */
import { describe, expect, it } from "vitest";
import { isValidSpecName } from "../src/spec-name";

describe("isValidSpecName", () => {
  // Valid names
  it("accepts single letter", () => {
    expect(isValidSpecName("a")).toBe(true);
    expect(isValidSpecName("Z")).toBe(true);
  });

  it("accepts names with letters, digits, and hyphens", () => {
    expect(isValidSpecName("my-spec")).toBe(true);
    expect(isValidSpecName("spec123")).toBe(true);
    expect(isValidSpecName("a-b-c")).toBe(true);
    expect(isValidSpecName("MySpec-1")).toBe(true);
  });

  it("accepts names up to 64 characters", () => {
    const name64 = "a".repeat(64);
    expect(isValidSpecName(name64)).toBe(true);
  });

  // Invalid names
  it("rejects empty string", () => {
    expect(isValidSpecName("")).toBe(false);
  });

  it("rejects names starting with digit or hyphen", () => {
    expect(isValidSpecName("1spec")).toBe(false);
    expect(isValidSpecName("-spec")).toBe(false);
  });

  it("rejects names with underscores", () => {
    expect(isValidSpecName("my_spec")).toBe(false);
  });

  it("rejects names with spaces", () => {
    expect(isValidSpecName("my spec")).toBe(false);
  });

  it("rejects names with path separators", () => {
    expect(isValidSpecName("spec/name")).toBe(false);
    expect(isValidSpecName("spec\\name")).toBe(false);
  });

  it("rejects names longer than 64 characters", () => {
    const name65 = "a".repeat(65);
    expect(isValidSpecName(name65)).toBe(false);
  });

  it("rejects special characters", () => {
    expect(isValidSpecName("spec@name")).toBe(false);
    expect(isValidSpecName("spec.name")).toBe(false);
    expect(isValidSpecName("spec!name")).toBe(false);
  });
});
