// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { applyMermaidExportContrast } from "./canvasExportStyles";

describe("canvas Mermaid export styles", () => {
  it("forces SVG and embedded HTML labels to black and restores them", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="mermaid-output">
        <svg xmlns="http://www.w3.org/2000/svg">
          <text style="fill: white" fill="white">Flow</text>
          <foreignObject><div style="color: white">Label</div></foreignObject>
        </svg>
      </div>
    `;
    const svgText = root.querySelector("text")!;
    const htmlLabel = root.querySelector<HTMLElement>("foreignObject div")!;
    const originalSvgStyle = svgText.getAttribute("style");
    const originalSvgFill = svgText.getAttribute("fill");
    const originalHtmlStyle = htmlLabel.getAttribute("style");

    const restore = applyMermaidExportContrast(root);

    expect(svgText.style.getPropertyValue("fill")).toBe("rgb(17, 17, 17)");
    expect(svgText.style.getPropertyPriority("fill")).toBe("important");
    expect(svgText.getAttribute("fill")).toBe("#111");
    expect(htmlLabel.style.getPropertyValue("color")).toBe("rgb(17, 17, 17)");
    expect(htmlLabel.style.getPropertyPriority("color")).toBe("important");
    expect(
      root.querySelector("style[data-canvas-export-contrast]"),
    ).not.toBeNull();

    restore();

    expect(svgText.getAttribute("style")).toBe(originalSvgStyle);
    expect(svgText.getAttribute("fill")).toBe(originalSvgFill);
    expect(htmlLabel.getAttribute("style")).toBe(originalHtmlStyle);
    expect(root.querySelector("style[data-canvas-export-contrast]")).toBeNull();
  });
});
