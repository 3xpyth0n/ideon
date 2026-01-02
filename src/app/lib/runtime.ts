export type RuntimeMode = "dev" | "prod";

export function getRuntimeMode(): RuntimeMode {
  return process.env.NODE_ENV === "production" ? "prod" : "dev";
}

export function isBuildMode(): boolean {
  return (
    process.env.IS_NEXT_BUILD === "1" ||
    process.env.NEXT_PHASE === "phase-production-build"
  );
}
