import { describe, expect, it } from "vitest";
import {
  classifyCanvasTouchTarget,
  computePinchViewport,
} from "./useCanvasTouchViewport";

describe("useCanvasTouchViewport helpers", () => {
  it("classifies the pane as canvas navigation", () => {
    const pane = document.createElement("div");
    pane.className = "react-flow__pane";
    document.body.appendChild(pane);

    expect(classifyCanvasTouchTarget(pane)).toBe("pane");

    pane.remove();
  });

  it("classifies block content separately from block chrome", () => {
    const node = document.createElement("div");
    node.className = "react-flow__node";
    const content = document.createElement("div");
    content.className = "nopan";
    node.appendChild(content);
    document.body.appendChild(node);

    expect(classifyCanvasTouchTarget(node)).toBe("block");
    expect(classifyCanvasTouchTarget(content)).toBe("content");

    node.remove();
  });

  it("prefers block chrome over the node wrapper nopan class", () => {
    const node = document.createElement("div");
    node.className = "react-flow__node nopan";
    const blockCard = document.createElement("div");
    blockCard.className = "block-card";
    const header = document.createElement("div");
    header.className = "block-header";
    blockCard.appendChild(header);
    node.appendChild(blockCard);
    document.body.appendChild(node);

    expect(classifyCanvasTouchTarget(header)).toBe("block");

    node.remove();
  });

  it("treats resize handles inside draggable nodes as block chrome", () => {
    const node = document.createElement("div");
    node.className = "react-flow__node nopan";
    const handle = document.createElement("div");
    handle.className = "react-flow__resize-control top right";
    node.appendChild(handle);
    document.body.appendChild(node);

    expect(classifyCanvasTouchTarget(handle)).toBe("block");

    node.remove();
  });

  it("keeps the pinch midpoint anchored while zooming", () => {
    const viewport = computePinchViewport(
      { x: 100, y: 80, zoom: 1 },
      { x: 200, y: 150 },
      { x: 220, y: 165 },
      100,
      200,
      0.1,
      4,
    );

    expect(viewport.zoom).toBe(2);
    expect(viewport.x).toBeCloseTo(20);
    expect(viewport.y).toBeCloseTo(95);
  });

  it("clamps pinch zoom to the configured bounds", () => {
    const viewport = computePinchViewport(
      { x: 0, y: 0, zoom: 1 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      100,
      1000,
      0.1,
      1.5,
    );

    expect(viewport.zoom).toBe(1.5);
  });
});
