// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { svgToPngBlob } from "./svgToPngBlob";

describe("SVG PNG conversion", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("rasterizes the intrinsic SVG size at the requested pixel ratio", async () => {
    const drawImage = vi.fn();
    const fillRect = vi.fn();
    const context = {
      drawImage,
      fillRect,
      fillStyle: "",
    };
    const canvas = HTMLCanvasElement.prototype;
    vi.spyOn(canvas, "getContext").mockReturnValue(
      context as unknown as CanvasRenderingContext2D,
    );
    vi.spyOn(canvas, "toBlob").mockImplementation((callback) => {
      callback(new Blob(["png"], { type: "image/png" }));
    });

    const createObjectURL = vi.fn(() => "blob:mermaid-svg");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", {
      ...URL,
      createObjectURL,
      revokeObjectURL,
    });
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;

        set src(_url: string) {
          this.onload?.();
        }
      },
    );

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 240 80");
    svg.setAttribute("width", "240");
    svg.setAttribute("height", "80");

    const blob = await svgToPngBlob(svg, 2);

    expect(blob.type).toBe("image/png");
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:mermaid-svg");
    expect(fillRect).toHaveBeenCalledWith(0, 0, 480, 160);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 480, 160);
  });
});
