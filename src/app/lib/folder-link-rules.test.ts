import { describe, it, expect } from "vitest";
import { validateFolderLinkRules } from "./folder-link-rules";

describe("folder-link-rules", () => {
  it("should allow linking from an expanded folder", () => {
    const blocks = [
      { id: "f1", type: "folder", data: { metadata: JSON.stringify({ isCollapsed: false }) } },
      { id: "b1", type: "text", data: { content: "test" } },
    ];
    const links = [{ source: "f1", target: "b1" }];
    
    expect(validateFolderLinkRules(blocks, links)).toBeNull();
  });

  it("should block linking from a collapsed folder", () => {
    const blocks = [
      { id: "f1", type: "folder", data: { metadata: JSON.stringify({ isCollapsed: true }) } },
      { id: "b1", type: "text", data: { content: "test" } },
    ];
    const links = [{ source: "f1", target: "b1" }];
    
    const result = validateFolderLinkRules(blocks, links);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("folder_collapsed_source");
  });

  it("should block linking from a folder to core", () => {
    const blocks = [
      { id: "f1", type: "folder", data: { metadata: JSON.stringify({ isCollapsed: false }) } },
      { id: "core", type: "core", data: {} },
    ];
    const links = [{ source: "f1", target: "core" }];
    
    const result = validateFolderLinkRules(blocks, links);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("folder_to_core");
  });

  it("should block reverse linking if it already exists", () => {
    const blocks = [
      { id: "f1", type: "folder", data: { metadata: JSON.stringify({ isCollapsed: false }) } },
      { id: "b1", type: "text", data: {} },
    ];
    const links = [
      { source: "b1", target: "f1" },
      { source: "f1", target: "b1" },
    ];
    
    const result = validateFolderLinkRules(blocks, links);
    expect(result).not.toBeNull();
    expect(result?.code).toBe("folder_reverse_link");
  });
});
