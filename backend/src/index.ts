import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { config } from "./config/env.js";
import { apiLimiter } from "./middleware/rateLimiter.js";
import { authenticateToken } from "./middleware/auth.js";
import { entityScopeMiddleware } from "./middleware/entityScope.js";

// ── Route imports ───────────────────────────────────────────
import authRoutes from "./routes/auth.routes.js";
import sharedRoutes from "./routes/shared.routes.js";
import ticketRoutes from "./routes/ticket.routes.js";
import commentRoutes from "./routes/comment.routes.js";
import userRoutes from "./routes/user.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import exportRoutes from "./routes/export.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import attachmentRoutes from "./routes/attachment.routes.js";

// ── Express app ──────────────────────────────────────────────
const app = express();
app.set("trust proxy", 1);

// ── Global middleware ────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: [config.FRONTEND_URL, "http://95.177.171.54", "https://wahid.live"],
  credentials: true,
}));
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(apiLimiter);

// ── Health check (public) ────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ── Public routes (no auth) ─────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/shared", sharedRoutes);

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
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    ...(process.env.NODE_ENV !== "production" && { message: err.message }),
  });
});

// ── Background jobs ─────────────────────────────────────────
import { scheduleSlaChecker } from "./jobs/slaChecker.js";
import { scheduleWeeklyReport } from "./jobs/weeklyReport.js";

scheduleSlaChecker();
scheduleWeeklyReport();

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
