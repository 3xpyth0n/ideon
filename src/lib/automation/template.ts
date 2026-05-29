// Resolves dot-path notation: "pull_request.title" → payload.pull_request.title
function resolvePath(obj: unknown, path: string): unknown {
  return path.split(".").reduce((cur: unknown, key) => {
    if (
      cur !== null &&
      typeof cur === "object" &&
      key in (cur as Record<string, unknown>)
    ) {
      return (cur as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
}

export function expandTemplate(template: string, payload: unknown): string {
  return template.replace(
    /\{\{payload\.([^}]+)\}\}/g,
    (_match, path: string) => {
      const value = resolvePath(payload, path.trim());
      if (value === undefined || value === null) return "";
      return String(value);
    },
  );
}

export function expandTemplateRecord(
  params: Record<string, unknown>,
  payload: unknown,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    result[key] =
      typeof value === "string" ? expandTemplate(value, payload) : value;
  }
  return result;
}
