import { JSDOM } from "jsdom";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
});

const globalNames = [
  "window",
  "document",
  "Node",
  "Element",
  "HTMLElement",
  "DOMParser",
  "MutationObserver",
  "navigator",
  "getComputedStyle",
  "requestAnimationFrame",
  "cancelAnimationFrame",
] as const;

let active = false;

export function withEditorDom<T>(callback: () => T): T {
  if (active) {
    throw new Error(
      "withEditorDom: re-entrant call detected. Do not call withEditorDom from within another withEditorDom callback.",
    );
  }

  const previous = new Map(
    globalNames.map((name) => [
      name,
      Object.getOwnPropertyDescriptor(globalThis, name),
    ]),
  );

  for (const name of globalNames) {
    const value =
      name === "window"
        ? dom.window
        : name === "document"
          ? dom.window.document
          : name === "getComputedStyle"
            ? dom.window.getComputedStyle.bind(dom.window)
            : (dom.window as unknown as Record<string, unknown>)[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }

  active = true;
  try {
    return callback();
  } finally {
    active = false;
    for (const name of globalNames) {
      const descriptor = previous.get(name);
      if (descriptor) {
        Object.defineProperty(globalThis, name, descriptor);
      } else {
        Reflect.deleteProperty(globalThis, name);
      }
    }
  }
}
