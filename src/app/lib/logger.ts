import pino from "pino";

const rawNode = process.env.NODE_ENV;
const isTestMode =
  typeof rawNode === "string" && ["test", "dev"].includes(rawNode);
const env = isTestMode ? "test" : "production";
const defaultLevel = process.env.LOG_LEVEL || (isTestMode ? "debug" : "info");

export const logger = pino({
  level: defaultLevel,
  base: null,
  redact: [
    "req.headers.authorization",
    "authorization",
    "password",
    "pass",
    "token",
    "secret",
  ],
});

// Log effective environment and log level at startup once.
try {
  const g = global as unknown as Record<string, unknown>;
  if (!g.__ideon_logger_started) {
    logger.info(
      {
        env,
        effectiveLogLevel: defaultLevel,
        envLOG_LEVEL: process.env.LOG_LEVEL ?? null,
        NODE_ENV: process.env.NODE_ENV ?? null,
      },
      "server:startup:logging-config",
    );
    g.__ideon_logger_started = true;
  }
} catch {
  // ignore
}
