export function getMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message || "";
  try {
    return JSON.stringify(err);
  } catch {
    return String(err || "");
  }
}

export default getMessage;
