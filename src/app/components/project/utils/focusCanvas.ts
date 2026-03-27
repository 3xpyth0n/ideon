export function focusProjectCanvas() {
  const el = document.querySelector(
    ".project-canvas-container",
  ) as HTMLElement | null;
  if (el && typeof el.focus === "function") el.focus();
}
