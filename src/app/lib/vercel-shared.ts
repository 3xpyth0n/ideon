export function isRedeploy(d: { source: string | null }): boolean {
  return d.source === "redeploy";
}
