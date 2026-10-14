const MERMAID_LABEL_SELECTOR = [
  ".mermaid-output svg text",
  ".mermaid-output svg tspan",
  ".mermaid-output svg foreignObject *",
].join(", ");

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

export function applyMermaidExportContrast(root: HTMLElement) {
  const diagrams = Array.from(
    root.querySelectorAll<SVGSVGElement>(".mermaid-output svg"),
  );
  const labels = Array.from(
    root.querySelectorAll<HTMLElement | SVGElement>(MERMAID_LABEL_SELECTOR),
  );
  const exportStyles = diagrams.map((diagram) => {
    const style = document.createElementNS(SVG_NAMESPACE, "style");
    style.setAttribute("data-canvas-export-contrast", "");
    style.textContent = `text, tspan, .nodeLabel, .edgeLabel, .cluster-label, foreignObject * { color: #111 !important; fill: #111 !important; }`;
    diagram.insertBefore(style, diagram.firstChild);
    return style;
  });
  const previousStyles = labels.map((label) => ({
    element: label,
    style: label.getAttribute("style"),
    fill: label.getAttribute("fill"),
  }));

  for (const { element } of previousStyles) {
    element.style.setProperty("color", "#111", "important");
    element.style.setProperty("fill", "#111", "important");

    if (element.namespaceURI === SVG_NAMESPACE) {
      element.setAttribute("fill", "#111");
    }
  }

  return () => {
    exportStyles.forEach((style) => style.remove());

    for (const { element, style, fill } of previousStyles) {
      if (style === null) {
        element.removeAttribute("style");
      } else {
        element.setAttribute("style", style);
      }

      if (fill === null) {
        element.removeAttribute("fill");
      } else {
        element.setAttribute("fill", fill);
      }
    }
  };
}
