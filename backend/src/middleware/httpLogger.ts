import type { Request, Response, NextFunction } from "express";
import { writeLog } from "../services/logStore.js";

function clientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ??
    req.ip ??
    "unknown"
  );
}

/**
 * Logs every HTTP request/response pair to the SQLite store once the response
 * finishes. Mounted before the routes, so `req.user` (attached later by the
 * auth middleware) is already populated by the time `finish` fires.
 */
export function httpLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  res.on("finish", () => {
    const u = (req as any).user;
    writeLog({
      category: "http",
      level: res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
      method: req.method,
      path: req.originalUrl,
      status: res.statusCode,
      durationMs: Date.now() - start,
      userId: u?.userId ?? u?.id ?? null,
      userEmail: u?.email ?? null,
      ip: clientIp(req),
      userAgent: (req.headers["user-agent"] as string) ?? null,
    });
  });
  next();
}
