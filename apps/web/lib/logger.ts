import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  // Note: pino-pretty transport is incompatible with Next.js webpack bundling.
  // Use plain JSON logging in all environments.
  base: {
    service: "ceosrun-web",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
});
