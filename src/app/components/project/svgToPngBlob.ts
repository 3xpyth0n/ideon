function getSvgDimensions(svg: SVGSVGElement) {
  const viewBox = svg
    .getAttribute("viewBox")
    ?.trim()
    .split(/[\s,]+/)
    .map(Number);
  const width = Number.parseFloat(svg.getAttribute("width") || "");
  const height = Number.parseFloat(svg.getAttribute("height") || "");
  const resolvedWidth = width || (viewBox?.length === 4 ? viewBox[2] : 0);
  const resolvedHeight = height || (viewBox?.length === 4 ? viewBox[3] : 0);

  if (
    !Number.isFinite(resolvedWidth) ||
    !Number.isFinite(resolvedHeight) ||
    resolvedWidth <= 0 ||
    resolvedHeight <= 0
  ) {
    throw new Error("Mermaid SVG has invalid dimensions");
  }

  return { width: resolvedWidth, height: resolvedHeight };
}

export function svgToPngBlob(
  svg: SVGSVGElement,
  pixelRatio = 2,
): Promise<Blob> {
  const { width, height } = getSvgDimensions(svg);
  const svgBlob = new Blob([new XMLSerializer().serializeToString(svg)], {
    type: "image/svg+xml;charset=utf-8",
  });
  const svgUrl = URL.createObjectURL(svgBlob);

  return new Promise((resolve, reject) => {
    const image = new Image();
    let urlRevoked = false;
    const revokeSvgUrl = () => {
      if (urlRevoked) return;
      URL.revokeObjectURL(svgUrl);
      urlRevoked = true;
    };

    image.onload = () => {
      revokeSvgUrl();

      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.ceil(width * pixelRatio);
        canvas.height = Math.ceil(height * pixelRatio);
        const context = canvas.getContext("2d");

        if (!context) {
          throw new Error("Canvas 2D context is unavailable");
        }

        context.fillStyle = "#fff";
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("PNG encoding failed"));
          }
        }, "image/png");
      } catch (error) {
        reject(error);
      }
    };

    image.onerror = () => {
      revokeSvgUrl();
      reject(new Error("Mermaid SVG could not be decoded"));
    };

    image.src = svgUrl;
  });
}
