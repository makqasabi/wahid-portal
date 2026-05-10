import type { Request, Response } from "express";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import type { TokenPayload } from "../middleware/auth.js";
import { subscribe } from "../services/notification.bus.js";

const HEARTBEAT_MS = 25_000;

/**
 * Server-Sent Events stream of notifications for the authenticated user.
 *
 * EventSource cannot send custom headers, so the JWT comes via `?token=`.
 * Stays open until the client disconnects.
 */
export function notificationStreamHandler(req: Request, res: Response): void {
  const token =
    (req.query.token as string | undefined) ??
    (req.headers.authorization?.startsWith("Bearer ")
      ? req.headers.authorization.slice(7)
      : undefined);

  if (!token) {
    res.status(401).json({ error: "Authentication required" });
    return;
  }

  let payload: TokenPayload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET) as TokenPayload;
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  res.write(`event: ready\ndata: {"userId":"${payload.id}"}\n\n`);

  const unsubscribe = subscribe(payload.id, (notif) => {
    res.write(`event: notification\ndata: ${JSON.stringify(notif)}\n\n`);
  });

  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
  }, HEARTBEAT_MS);

  const cleanup = () => {
    clearInterval(heartbeat);
    unsubscribe();
  };

  req.on("close", cleanup);
  req.on("end", cleanup);
}
