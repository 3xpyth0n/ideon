let mermaidPromise: Promise<typeof import("mermaid").default> | undefined;

function loadMermaid() {
  mermaidPromise ??= import("mermaid").then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: "strict" });
    return mermaid;
  });

  return mermaidPromise;
}

export function renderMermaid(source: string, id: string) {
  return loadMermaid()
    .then((mermaid) => mermaid.render(id, source))
    .then((result) => ({
      ...result,
      svg: normalizeMermaidSvg(result.svg),
    }));
}

function normalizeMermaidSvg(svgMarkup: string) {
  const document = new DOMParser().parseFromString(svgMarkup, "image/svg+xml");
  const svg = document.documentElement;
  const viewBox = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);

  if (viewBox?.length === 4 && viewBox[2] > 0 && viewBox[3] > 0) {
    svg.setAttribute("width", String(viewBox[2]));
    svg.setAttribute("height", String(viewBox[3]));
  }
  svg.style.removeProperty("max-width");
  svg.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const labelElements = svg.querySelectorAll(
    "text, tspan, .label span, .nodeLabel, .edgeLabel, .cluster-label span, foreignObject div, foreignObject span, foreignObject p",
  );
  labelElements.forEach((element) => {
    const currentStyle = element.getAttribute("style")?.trim() ?? "";
    const separator = currentStyle && !currentStyle.endsWith(";") ? ";" : "";
    element.setAttribute(
      "style",
      `${currentStyle}${separator}color: #111 !important; fill: #111 !important;`,
    );

    if (element.namespaceURI === "http://www.w3.org/2000/svg") {
      element.setAttribute("fill", "#111");
    }
  });

  const id = svg.getAttribute("id");
  if (id) {
    const textStyle = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "style",
    );
    textStyle.textContent = `#${id} .label span, #${id} .nodeLabel, #${id} .edgeLabel, #${id} .cluster-label text, #${id} .cluster-label span, #${id} foreignObject div, #${id} foreignObject span, #${id} foreignObject p, #${id} text, #${id} tspan { color: #111 !important; fill: #111 !important; }`;
    svg.appendChild(textStyle);
  }

  return new XMLSerializer().serializeToString(svg);
}
