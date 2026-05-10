import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import prisma from "../config/prisma.js";
import type { ScopedRequest } from "../middleware/entityScope.js";
import { validateBody } from "../middleware/validate.js";
import { notifyTicketParticipants } from "../services/notification.service.js";

const router = Router();

const createCommentSchema = z.object({
  body: z.string().min(1, "Comment body is required"),
  isInternal: z.boolean().default(false),
});

// ── GET /ticket/:ticketId — List comments ───────────────────

router.get("/ticket/:ticketId", async (req: ScopedRequest, res: Response) => {
  try {
    const { ticketId } = req.params;
    const requesterEntityId = req.user!.entityId;
    const userId = req.user!.id;

    // Verify ticket exists and user has access
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        ownerEntityId: true,
        submittingEntityId: true,
        ownerId: true,
        supportId: true,
        submittedById: true,
      },
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    // Visibility check
    if (req.user!.role !== "SUPER_ADMIN") {
      const canAccess =
        ticket.ownerEntityId === requesterEntityId ||
        ticket.submittingEntityId === requesterEntityId ||
        ticket.ownerId === userId ||
        ticket.supportId === userId ||
        ticket.submittedById === userId;
      if (!canAccess) {
        res.status(403).json({ error: "Access denied to this ticket" });
        return;
      }
    }

    const comments = await prisma.comment.findMany({
      where: {
        ticketId,
        OR: [
          { isInternal: false },
          { isInternal: true, authorEntityId: requesterEntityId },
        ],
      },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, fullName: true, entityId: true } },
      },
    });

    res.json({ data: comments });
  } catch (err) {
    console.error("GET /comments/ticket/:ticketId error:", err);
    res.status(500).json({ error: "Failed to fetch comments" });
  }
});

// ── POST /ticket/:ticketId — Add comment ────────────────────

router.post(
  "/ticket/:ticketId",
  validateBody(createCommentSchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const { ticketId } = req.params;
      const userId = req.user!.id;
      const userEntityId = req.user!.entityId;
      const { body, isInternal } = req.body;

      // Verify ticket exists and user has access
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          id: true,
          displayId: true,
          ownerEntityId: true,
          submittingEntityId: true,
          ownerId: true,
          supportId: true,
          submittedById: true,
        },
      });

      if (!ticket) {
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      // Visibility check: user must be involved with this ticket
      if (req.user!.role !== "SUPER_ADMIN") {
        const canAccess =
          ticket.ownerEntityId === userEntityId ||
          ticket.submittingEntityId === userEntityId ||
          ticket.ownerId === userId ||
          ticket.supportId === userId ||
          ticket.submittedById === userId;
        if (!canAccess) {
          res.status(403).json({ error: "Access denied to this ticket" });
          return;
        }
      }

      const comment = await prisma.comment.create({
        data: {
          ticketId,
          authorId: userId,
          authorEntityId: userEntityId,
          body,
          isInternal,
        },
        include: {
          author: { select: { id: true, fullName: true, entityId: true } },
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          ticketId,
          userId,
          action: "COMMENTED",
          fieldName: isInternal ? "internal_comment" : "comment",
          newValue: body.substring(0, 200),
        },
      });

      // Notifications
      if (isInternal) {
        await notifyTicketParticipants(
          ticketId,
          userId,
          "COMMENT_ADDED",
          `New internal comment on ticket ${ticket.displayId}`,
          userEntityId, // restrict to same entity
        );
      } else {
        await notifyTicketParticipants(
          ticketId,
          userId,
          "COMMENT_ADDED",
          `New comment on ticket ${ticket.displayId}`,
        );
      }

      res.status(201).json(comment);
    } catch (err) {
      console.error("POST /comments/ticket/:ticketId error:", err);
      res.status(500).json({ error: "Failed to create comment" });
    }
  },
);

export default router;
