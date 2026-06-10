import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/env.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { authenticateToken } from "./middleware/auth.js";
import { entityScopeMiddleware } from "./middleware/entityScope.js";
import { httpLogger } from "./middleware/httpLogger.js";
import {
  initLogStore,
  installConsoleCapture,
  writeLog,
  pruneOldLogs,
} from "./services/logStore.js";

// Capture all console output and open the durable SQLite log store as early
// as possible (writes are buffered until it's ready, so nothing is lost).
installConsoleCapture();
void initLogStore();

// ── Route imports ───────────────────────────────────────────
import authRoutes from "./routes/auth.routes.js";
import oidcRoutes from "./routes/oidc.routes.js";
import sharedRoutes from "./routes/shared.routes.js";
import ticketRoutes from "./routes/ticket.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import userRoutes from "./routes/user.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import exportRoutes from "./routes/export.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import { notificationStreamHandler } from "./routes/notificationStream.js";
import attachmentRoutes from "./routes/attachment.routes.js";

// ── Express app ──────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);

// ── Global middleware ────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [config.FRONTEND_URL, "https://wahid.live", "https://www.wahid.live"],
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
// Persist every request/response to the SQLite log store (before the rate
// limiter, so throttled 429s are recorded too).
app.use(httpLogger);
app.use(apiLimiter);

// ── Health check (public) ────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Public routes (no auth) ─────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/auth/oidc", oidcRoutes);
app.use("/api/shared", sharedRoutes);

// SSE stream — handles its own auth via query token (EventSource can't set headers)
app.get("/api/notifications/stream", notificationStreamHandler);

// ── Protected routes ────────────────────────────────────────
app.use("/api", authenticateToken, entityScopeMiddleware);
app.use("/api/tickets", ticketRoutes);
app.use("/api/comments", commentRoutes);
app.use("/api/users", userRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/export", exportRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/attachments", attachmentRoutes);

// ── Reference data routes (any authenticated user) ─────────
import referenceRoutes from "./routes/reference.routes.js";
app.use("/api/reference", referenceRoutes);

// ── Global error handler ─────────────────────────────────────
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  writeLog({
    category: "error",
    level: "error",
    message: err.message,
    method: req.method,
    path: req.originalUrl,
    status: 500,
    userId: (req as any).user?.userId ?? (req as any).user?.id ?? null,
    ip: (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ?? req.ip ?? null,
    meta: { stack: err.stack },
  });
  res.status(500).json({
    error: "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { message: err.message }),
  });
});

// ── Background jobs ─────────────────────────────────────────
import { scheduleSlaChecker } from "./jobs/slaChecker.js";
import { scheduleWeeklyReport } from "./jobs/weeklyReport.js";
import { startImapPoller } from "./services/imap.service.js";

scheduleSlaChecker();
scheduleWeeklyReport();
startImapPoller();

// Prune old logs once shortly after boot (when the store is ready) and daily.
function runLogPrune() {
  const n = pruneOldLogs(config.LOG_RETENTION_DAYS);
  if (n > 0) console.log(`[logStore] pruned ${n} logs older than ${config.LOG_RETENTION_DAYS}d`);
}
setTimeout(runLogPrune, 15_000);
setInterval(runLogPrune, 24 * 60 * 60 * 1000);

// ── Start server ─────────────────────────────────────────────
app.listen(config.PORT, () => {
  console.log(`Server running on port ${config.PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV ?? "development"}`);
});

// ── Graceful shutdown ────────────────────────────────────────
import prisma from "./config/prisma.js";

process.on("SIGTERM", async () => {
  console.log("SIGTERM received, shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});

process.on("SIGINT", async () => {
  console.log("SIGINT received, shutting down...");
  await prisma.$disconnect();
  process.exit(0);
});

export default app;
