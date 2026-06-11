import { Router } from "express";
import type { Request, Response } from "express";
import prisma from "../config/prisma.js";
import { getSettings } from "../services/settings.service.js";
import type { Prisma } from "@prisma/client";

const router = Router();

// ── GET /config — Public branding config (NO AUTH REQUIRED) ─
// Used by the login page / app shell before sign-in. Branding only —
// never expose other setting groups here. Declared before /:token.

router.get("/config", async (_req: Request, res: Response) => {
  try {
    const { branding } = await getSettings();
    res.json({ branding });
  } catch (err) {
    console.error("GET /shared/config error:", err);
    res.status(500).json({ error: "Failed to load config" });
  }
});

// ── GET /:token — Access shared view (NO AUTH REQUIRED) ─────

router.get("/:token", async (req: Request, res: Response) => {
  try {
    const { token } = req.params;

    const link = await prisma.shareLink.findUnique({ where: { token } });

    if (!link) {
      res.status(404).json({ error: "Share link not found" });
      return;
    }

    if (new Date() > link.expiresAt) {
      res.status(410).json({ error: "Share link has expired" });
      return;
    }

    if (link.maxViews !== null && link.viewCount >= link.maxViews) {
      res.status(410).json({ error: "Share link has reached maximum views" });
      return;
    }

    // Increment view count
    await prisma.shareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 } },
    });

    // Build filter from stored filters
    const filters = link.filters as Record<string, any>;
    const where: Prisma.TicketWhereInput = {};

    // Enforce entity scope stored at share-link creation time
    if (filters.creatorEntityId) {
      where.OR = [
        { ownerEntityId: filters.creatorEntityId },
        { submittingEntityId: filters.creatorEntityId },
      ];
    }

    if (filters.entityId) where.ownerEntityId = filters.entityId;
    if (filters.teamId) where.ownerTeamId = filters.teamId;
    if (filters.clientId) where.clientId = filters.clientId;
    if (filters.categoryId) where.categoryId = filters.categoryId;
    if (filters.progress) {
      const values = String(filters.progress).split(",").map((s: string) => s.trim());
      where.progress = values.length === 1 ? (values[0] as any) : { in: values as any };
    }
    if (filters.priority) where.priority = filters.priority;

    const tickets = await prisma.ticket.findMany({
      where,
      include: {
        category: true,
        client: true,
        owner: { select: { fullName: true } },
        support: { select: { fullName: true } },
        ownerEntity: true,
        ownerTeam: true,
        submittedBy: { select: { fullName: true } },
        submittingTeam: true,
      },
      orderBy: { createdAt: "desc" },
    });

    // Dashboard stats for this filter scope
    const [totalOpen, overdue, completed] = await Promise.all([
      prisma.ticket.count({
        where: { ...where, progress: { in: ["IN_PROGRESS", "DELAYED"] } },
      }),
      prisma.ticket.count({
        where: { ...where, progress: "DELAYED" },
      }),
      prisma.ticket.count({
        where: { ...where, progress: "COMPLETED" },
      }),
    ]);

    res.json({
      tickets,
      stats: { totalOpen, overdue, completed, total: tickets.length },
    });
  } catch (err) {
    console.error("GET /shared/:token error:", err);
    res.status(500).json({ error: "Failed to access shared view" });
  }
});

export default router;
