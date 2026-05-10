import { Router } from "express";
import type { Response } from "express";
import prisma from "../config/prisma.js";
import type { ScopedRequest } from "../middleware/entityScope.js";

const router = Router();

// ── GET /unread — Unread notifications for current user ─────

router.get("/unread", async (req: ScopedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const notifications = await prisma.notification.findMany({
      where: { userId, isRead: false },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        ticket: { select: { id: true, displayId: true } },
      },
    });

    res.json(notifications);
  } catch (err) {
    console.error("GET /notifications/unread error:", err);
    res.status(500).json({ error: "Failed to fetch notifications" });
  }
});

// ── PATCH /:id/read — Mark single notification as read ──────

router.patch("/:id/read", async (req: ScopedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const notificationId = req.params.id;

    const result = await prisma.notification.updateMany({
      where: { id: notificationId, userId },
      data: { isRead: true },
    });

    if (result.count === 0) {
      res.status(404).json({ error: "Notification not found" });
      return;
    }

    res.json({ message: "Notification marked as read" });
  } catch (err) {
    console.error("PATCH /notifications/:id/read error:", err);
    res.status(500).json({ error: "Failed to mark notification as read" });
  }
});

// ── PATCH /read-all — Mark all notifications as read ────────

router.patch("/read-all", async (req: ScopedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const result = await prisma.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true },
    });

    res.json({ message: `Marked ${result.count} notifications as read` });
  } catch (err) {
    console.error("PATCH /notifications/read-all error:", err);
    res.status(500).json({ error: "Failed to mark notifications as read" });
  }
});

export default router;
