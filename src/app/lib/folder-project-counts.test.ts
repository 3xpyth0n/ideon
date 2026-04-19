import { describe, expect, it } from "vitest";
import { buildRecursiveProjectCounts } from "./folder-project-counts";

describe("buildRecursiveProjectCounts", () => {
  it("counts direct and descendant projects for each folder", () => {
    const folders = [
      { id: "root", parentFolderId: null },
      { id: "child", parentFolderId: "root" },
      { id: "leaf", parentFolderId: "child" },
    ];

    const counts = buildRecursiveProjectCounts(
      folders,
      new Map([
        ["root", 2],
        ["child", 5],
        ["leaf", 3],
      ]),
    );

    expect(counts.get("root")).toBe(10);
    expect(counts.get("child")).toBe(8);
    expect(counts.get("leaf")).toBe(3);
  });

  it("does not leak sibling projects into another subtree", () => {
    const folders = [
      { id: "root", parentFolderId: null },
      { id: "alpha", parentFolderId: "root" },
      { id: "beta", parentFolderId: "root" },
      { id: "beta-child", parentFolderId: "beta" },
    ];

    const counts = buildRecursiveProjectCounts(
      folders,
      new Map([
        ["alpha", 2],
        ["beta", 1],
        ["beta-child", 4],
      ]),
    );

    expect(counts.get("alpha")).toBe(2);
    expect(counts.get("beta")).toBe(5);
    expect(counts.get("root")).toBe(7);
  });

  it("returns zero for empty folders and still counts descendant-only folders", () => {
    const folders = [
      { id: "root", parentFolderId: null },
      { id: "descendant-only", parentFolderId: "root" },
      { id: "leaf", parentFolderId: "descendant-only" },
      { id: "empty", parentFolderId: null },
    ];

    const counts = buildRecursiveProjectCounts(folders, new Map([["leaf", 6]]));

    expect(counts.get("descendant-only")).toBe(6);
    expect(counts.get("root")).toBe(6);
    expect(counts.get("empty")).toBe(0);
  });
});
