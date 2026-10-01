// @vitest-environment jsdom
import { beforeAll, describe, expect, it } from "vitest";
import { renderMermaid } from "./mermaidRenderer";

beforeAll(() => {
  Object.defineProperty(SVGElement.prototype, "getBBox", {
    configurable: true,
    value: () => ({ x: 0, y: 0, width: 120, height: 40 }),
  });
  Object.defineProperty(SVGElement.prototype, "getComputedTextLength", {
    configurable: true,
    value: () => 120,
  });
});

describe("Mermaid renderer", () => {
  it.each([
    ["flowchart", "flowchart LR\n  Source --> Canvas"],
    ["sequence", "sequenceDiagram\n  Agent->>Ideon: Update diagram"],
    [
      "C4",
      'C4Context\n  Person(user, "User")\n  System(app, "Ideon")\n  Rel(user, app, "Uses")',
    ],
  ])("renders %s diagrams", async (type, source) => {
    const result = await renderMermaid(source, `mermaid-test-${type}`);

    expect(result.svg).toContain("<svg");
  });

  it("normalizes SVG dimensions and label colors for export", async () => {
    const result = await renderMermaid(
      "flowchart LR\n  Source --> Canvas",
      "mermaid-test-export",
    );
    const document = new DOMParser().parseFromString(
      result.svg,
      "image/svg+xml",
    );
    const svg = document.documentElement;

    expect(Number(svg.getAttribute("width"))).toBeGreaterThan(0);
    expect(Number(svg.getAttribute("height"))).toBeGreaterThan(0);
    expect(svg.getAttribute("style") ?? "").not.toContain("max-width");
    expect(svg.getAttribute("preserveAspectRatio")).toBe("xMidYMid meet");
    expect(result.svg).toContain("color: #111 !important");
    expect(result.svg).toContain("fill: #111 !important");
    expect(
      svg
        .querySelector("foreignObject div")
        ?.getAttribute("style")
        ?.includes("color: #111 !important"),
    ).toBe(true);
  });

  it("rejects invalid source without returning an empty success", async () => {
    await expect(
      renderMermaid("flowchart LR\n  A -->", "mermaid-test-invalid"),
    ).rejects.toThrow();
  });
});
