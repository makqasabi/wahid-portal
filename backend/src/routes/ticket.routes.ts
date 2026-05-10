import { Router } from "express";
import type { Response } from "express";
import prisma from "../config/prisma.js";
import type { ScopedRequest } from "../middleware/entityScope.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import {
  createTicketSchema,
  updateTicketSchema,
  ticketFilterSchema,
} from "../schemas/ticket.schema.js";
import { generateDisplayId } from "../utils/displayId.js";
import { calculateSlaVariance } from "../services/sla.service.js";
import {
  createNotification,
  notifyTicketParticipants,
} from "../services/notification.service.js";
import type { Prisma } from "@prisma/client";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────

function visibilityFilter(req: ScopedRequest): Prisma.TicketWhereInput {
  if (req.user?.role === "SUPER_ADMIN") return {};
  const userId = req.user!.id;
  const entityId = req.user!.entityId;
  return {
    OR: [
      { ownerEntityId: entityId },
      { submittingEntityId: entityId },
      { ownerId: userId },
      { supportId: userId },
      { submittedById: userId },
    ],
  };
}

const VALID_TRANSITIONS: Record<string, string[]> = {
  IN_PROGRESS: ["COMPLETED", "ON_HOLD", "DEPENDENT"],
  DELAYED: ["COMPLETED", "ON_HOLD", "IN_PROGRESS"],
  ON_HOLD: ["IN_PROGRESS"],
  DEPENDENT: ["IN_PROGRESS"],
  COMPLETED: ["IN_PROGRESS"], // reopen
};

// ── GET / — List tickets ────────────────────────────────────

router.get("/", validateQuery(ticketFilterSchema), async (req: ScopedRequest, res: Response) => {
  try {
    const q = req.query as Record<string, any>;
    const page: number = q.page ?? 1;
    const limit: number = q.limit ?? 25;
    const skip = (page - 1) * limit;
    const sortBy: string = q.sortBy ?? "dueDate";
    const sortOrder: string = q.sortOrder ?? "asc";

    const where: Prisma.TicketWhereInput = {
      AND: [visibilityFilter(req)],
    };

    // Apply optional filters
    if (q.entityId) (where.AND as Prisma.TicketWhereInput[]).push({ ownerEntityId: q.entityId });
    if (q.teamId) (where.AND as Prisma.TicketWhereInput[]).push({ ownerTeamId: q.teamId });
    if (q.clientId) (where.AND as Prisma.TicketWhereInput[]).push({ clientId: q.clientId });
    if (q.categoryId) (where.AND as Prisma.TicketWhereInput[]).push({ categoryId: q.categoryId });

    // "My Tickets": when both ownerId and submittedById are the same user, use OR
    if (q.ownerId && q.submittedById && q.ownerId === q.submittedById) {
      (where.AND as Prisma.TicketWhereInput[]).push({
        OR: [{ ownerId: q.ownerId }, { submittedById: q.submittedById }],
      });
    } else {
      if (q.ownerId) (where.AND as Prisma.TicketWhereInput[]).push({ ownerId: q.ownerId });
      if (q.submittedById) (where.AND as Prisma.TicketWhereInput[]).push({ submittedById: q.submittedById });
    }

    // Multi-value progress filter (comma-separated)
    if (q.progress) {
      const values = String(q.progress).split(",").map((s: string) => s.trim());
      (where.AND as Prisma.TicketWhereInput[]).push(
        values.length === 1
          ? { progress: values[0] as any }
          : { progress: { in: values as any } },
      );
    }

    // Multi-value priority filter (comma-separated)
    if (q.priority) {
      const pValues = String(q.priority).split(",").map((s: string) => s.trim());
      (where.AND as Prisma.TicketWhereInput[]).push(
        pValues.length === 1
          ? { priority: pValues[0] as any }
          : { priority: { in: pValues as any } },
      );
    }

    if (q.dueDateFrom || q.dueDateTo) {
      const dateFilt: any = {};
      if (q.dueDateFrom) dateFilt.gte = new Date(q.dueDateFrom);
      if (q.dueDateTo) dateFilt.lte = new Date(q.dueDateTo);
      (where.AND as Prisma.TicketWhereInput[]).push({ dueDate: dateFilt });
    }

    if (q.search) {
      (where.AND as Prisma.TicketWhereInput[]).push({
        actionItem: { contains: q.search, mode: "insensitive" },
      });
    }

    const [tickets, total] = await Promise.all([
      prisma.ticket.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          submittingTeam: true,
          category: true,
          client: true,
          submittedBy: { select: { id: true, fullName: true } },
          owner: { select: { id: true, fullName: true } },
          support: { select: { id: true, fullName: true } },
          ownerEntity: true,
          ownerTeam: true,
        },
      }),
      prisma.ticket.count({ where }),
    ]);

    res.json({
      data: tickets,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET /tickets error:", err);
    res.status(500).json({ error: "Failed to fetch tickets" });
  }
});

// ── GET /:id — Single ticket ───────────────────────────────

router.get("/:id", async (req: ScopedRequest, res: Response) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        submittingTeam: true,
        submittingEntity: true,
        category: true,
        client: true,
        submittedBy: { select: { id: true, fullName: true, entityId: true } },
        owner: { select: { id: true, fullName: true, entityId: true } },
        support: { select: { id: true, fullName: true, entityId: true } },
        ownerEntity: true,
        ownerTeam: true,
        attachments: true,
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: { select: { id: true, fullName: true } } },
        },
      },
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    // Visibility check
    if (req.user?.role !== "SUPER_ADMIN") {
      const userId = req.user!.id;
      const entityId = req.user!.entityId;
      const canSee =
        ticket.ownerEntityId === entityId ||
        ticket.submittingEntityId === entityId ||
        ticket.ownerId === userId ||
        ticket.supportId === userId ||
        ticket.submittedById === userId;
      if (!canSee) {
        res.status(403).json({ error: "Access denied to this ticket" });
        return;
      }
    }

    // Fetch comments with internal note filtering
    const requesterEntityId = req.user!.entityId;
    const comments = await prisma.comment.findMany({
      where: {
        ticketId: ticket.id,
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

    res.json({ ...ticket, comments });
  } catch (err) {
    console.error("GET /tickets/:id error:", err);
    res.status(500).json({ error: "Failed to fetch ticket" });
  }
});

// ── POST / — Create ticket ─────────────────────────────────

router.post("/", validateBody(createTicketSchema), async (req: ScopedRequest, res: Response) => {
  try {
    const data = req.body;
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const userEntityId = req.user!.entityId;
    const userTeamId = req.user!.teamId;

    // ── Enforce submitting team: regular users can only submit from their own team ──
    if (userRole !== "SUPER_ADMIN" && userRole !== "ENTITY_ADMIN" && userRole !== "TEAM_LEAD") {
      // MEMBER/OBSERVER/EXTERNAL: force their own team
      if (data.submittingTeamId !== userTeamId) {
        res.status(403).json({ error: "You can only submit tickets from your own team" });
        return;
      }
    }

    // ENTITY_ADMIN / TEAM_LEAD: submitting team must be in their entity
    if (userRole === "ENTITY_ADMIN" || userRole === "TEAM_LEAD") {
      const submittingTeamCheck = await prisma.team.findUnique({
        where: { id: data.submittingTeamId },
        select: { entityId: true },
      });
      if (!submittingTeamCheck || submittingTeamCheck.entityId !== userEntityId) {
        res.status(403).json({ error: "Submitting team must belong to your entity" });
        return;
      }
    }

    // Resolve submitting entity from the submitting team
    const team = await prisma.team.findUnique({
      where: { id: data.submittingTeamId },
      select: { entityId: true },
    });

    if (!team) {
      res.status(400).json({ error: "Invalid submitting team" });
      return;
    }

    // ── Validate owner exists and owner team matches owner entity ──
    const ownerUser = await prisma.user.findUnique({
      where: { id: data.ownerId },
      select: { id: true, entityId: true, teamId: true, isActive: true },
    });
    if (!ownerUser || !ownerUser.isActive) {
      res.status(400).json({ error: "Invalid or inactive owner" });
      return;
    }

    // Validate owner team exists and belongs to the owner entity
    const ownerTeam = await prisma.team.findUnique({
      where: { id: data.ownerTeamId },
      select: { entityId: true },
    });
    if (!ownerTeam) {
      res.status(400).json({ error: "Invalid owner team" });
      return;
    }
    if (ownerTeam.entityId !== data.ownerEntityId) {
      res.status(400).json({ error: "Owner team does not belong to the specified owner entity" });
      return;
    }

    // Validate support user exists if provided
    if (data.supportId) {
      const supportUser = await prisma.user.findUnique({
        where: { id: data.supportId },
        select: { isActive: true },
      });
      if (!supportUser || !supportUser.isActive) {
        res.status(400).json({ error: "Invalid or inactive support user" });
        return;
      }
    }

    // Validate category and client exist
    const [category, client] = await Promise.all([
      prisma.category.findUnique({ where: { id: data.categoryId }, select: { isActive: true } }),
      prisma.client.findUnique({ where: { id: data.clientId }, select: { isActive: true } }),
    ]);
    if (!category || !category.isActive) {
      res.status(400).json({ error: "Invalid or inactive category" });
      return;
    }
    if (!client || !client.isActive) {
      res.status(400).json({ error: "Invalid or inactive client" });
      return;
    }

    const displayId = await generateDisplayId(prisma);

    // submittedById is ALWAYS the authenticated user — no impersonation possible
    const ticket = await prisma.ticket.create({
      data: {
        displayId,
        submittingTeamId: data.submittingTeamId,
        submittingEntityId: team.entityId,
        categoryId: data.categoryId,
        clientId: data.clientId,
        actionItem: data.actionItem,
        ownerId: data.ownerId,
        supportId: data.supportId ?? null,
        dueDate: data.dueDate ? new Date(data.dueDate) : null,
        ownerEntityId: data.ownerEntityId,
        ownerTeamId: data.ownerTeamId,
        priority: data.priority ?? "MEDIUM",
        progress: "IN_PROGRESS",
        submittedById: userId,
      },
      include: {
        submittingTeam: true,
        category: true,
        client: true,
        submittedBy: { select: { id: true, fullName: true } },
        owner: { select: { id: true, fullName: true } },
        support: { select: { id: true, fullName: true } },
        ownerEntity: true,
        ownerTeam: true,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        ticketId: ticket.id,
        userId,
        action: "CREATED",
      },
    });

    // Notification for owner
    await createNotification(
      ticket.ownerId,
      ticket.id,
      "ASSIGNED",
      `You have been assigned ticket ${displayId}`,
    );

    res.status(201).json(ticket);
  } catch (err) {
    console.error("POST /tickets error:", err);
    res.status(500).json({ error: "Failed to create ticket" });
  }
});

// ── PATCH /:id — Update ticket ──────────────────────────────

router.patch("/:id", validateBody(updateTicketSchema), async (req: ScopedRequest, res: Response) => {
  try {
    const ticketId = req.params.id;
    const userId = req.user!.id;
    const userRole = req.user!.role;
    const userEntityId = req.user!.entityId;
    const userTeamId = req.user!.teamId;
    const updates = req.body;

    const existing = await prisma.ticket.findUnique({ where: { id: ticketId } });
    if (!existing) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    // ── Permission checks ──
    const isOwner = existing.ownerId === userId;
    const isSubmitter = existing.submittedById === userId;
    const isTeamLead = userRole === "TEAM_LEAD" && existing.ownerTeamId === userTeamId;
    const isEntityAdmin = userRole === "ENTITY_ADMIN" && existing.ownerEntityId === userEntityId;
    const isSuperAdmin = userRole === "SUPER_ADMIN";

    if (!isOwner && !isSubmitter && !isTeamLead && !isEntityAdmin && !isSuperAdmin) {
      res.status(403).json({ error: "Insufficient permissions to update this ticket" });
      return;
    }

    // Field-level permission enforcement
    const fieldKeys = Object.keys(updates);
    if (!isSuperAdmin && !isEntityAdmin && !isTeamLead) {
      for (const key of fieldKeys) {
        if (key === "progress" || key === "closureDate" || key === "priority") {
          if (!isOwner) {
            res.status(403).json({ error: `Only the owner can update '${key}'` });
            return;
          }
        }
        if (key === "dueDate") {
          if (!isSubmitter) {
            res.status(403).json({ error: "Only the submitter can update 'dueDate'" });
            return;
          }
        }
      }
    }

    // ── Progress transition validation ──
    if (updates.progress && updates.progress !== existing.progress) {
      const allowed = VALID_TRANSITIONS[existing.progress] ?? [];
      if (!allowed.includes(updates.progress)) {
        res.status(400).json({
          error: `Cannot transition from ${existing.progress} to ${updates.progress}`,
        });
        return;
      }

      // Reopen check: only submitter or admin can reopen
      if (existing.progress === "COMPLETED" && updates.progress === "IN_PROGRESS") {
        if (!isSubmitter && !isEntityAdmin && !isSuperAdmin) {
          res.status(403).json({ error: "Only the submitter or admin can reopen a completed ticket" });
          return;
        }
      }
    }

    // ── Validate referenced entities on update ──
    if (updates.ownerId) {
      const newOwner = await prisma.user.findUnique({
        where: { id: updates.ownerId },
        select: { isActive: true },
      });
      if (!newOwner || !newOwner.isActive) {
        res.status(400).json({ error: "Invalid or inactive owner" });
        return;
      }
    }
    if (updates.supportId) {
      const newSupport = await prisma.user.findUnique({
        where: { id: updates.supportId },
        select: { isActive: true },
      });
      if (!newSupport || !newSupport.isActive) {
        res.status(400).json({ error: "Invalid or inactive support user" });
        return;
      }
    }
    if (updates.ownerTeamId && updates.ownerEntityId) {
      const newTeam = await prisma.team.findUnique({
        where: { id: updates.ownerTeamId },
        select: { entityId: true },
      });
      if (!newTeam || newTeam.entityId !== updates.ownerEntityId) {
        res.status(400).json({ error: "Owner team does not belong to the specified owner entity" });
        return;
      }
    }

    // ── Restrict reassignment fields to admins/leads ──
    const reassignFields = ["ownerId", "supportId", "ownerEntityId", "ownerTeamId", "submittingTeamId"];
    if (!isSuperAdmin && !isEntityAdmin && !isTeamLead) {
      for (const key of reassignFields) {
        if (updates[key] !== undefined) {
          res.status(403).json({ error: `Only admins or team leads can update '${key}'` });
          return;
        }
      }
    }

    // ── Build update data ──
    const updateData: Record<string, any> = {};
    const auditEntries: Array<{
      ticketId: string;
      userId: string;
      action: string;
      fieldName: string;
      oldValue: string | null;
      newValue: string | null;
    }> = [];

    const trackableFields = [
      "actionItem", "ownerId", "supportId", "dueDate", "closureDate",
      "ownerEntityId", "ownerTeamId", "priority", "progress", "categoryId",
      "clientId", "submittingTeamId",
    ];

    for (const key of trackableFields) {
      if (updates[key] !== undefined) {
        const oldVal = (existing as any)[key];
        const newVal = updates[key];

        // Convert dates for storage
        if (key === "dueDate" || key === "closureDate") {
          updateData[key] = newVal ? new Date(newVal) : null;
        } else {
          updateData[key] = newVal;
        }

        auditEntries.push({
          ticketId,
          userId,
          action: "FIELD_CHANGED",
          fieldName: key,
          oldValue: oldVal != null ? String(oldVal) : null,
          newValue: newVal != null ? String(newVal) : null,
        });
      }
    }

    // ── Completion logic ──
    if (updates.progress === "COMPLETED" && existing.progress !== "COMPLETED") {
      if (!updateData.closureDate) {
        updateData.closureDate = new Date();
      }
      const closureDate = updateData.closureDate as Date;
      const variance = calculateSlaVariance(existing.dueDate, closureDate);
      updateData.slaVarianceDays = variance;
    }

    // ── Reopen logic ──
    if (updates.progress === "IN_PROGRESS" && existing.progress === "COMPLETED") {
      updateData.closureDate = null;
      updateData.slaVarianceDays = null;
    }

    const updated = await prisma.ticket.update({
      where: { id: ticketId },
      data: updateData,
      include: {
        submittingTeam: true,
        category: true,
        client: true,
        submittedBy: { select: { id: true, fullName: true } },
        owner: { select: { id: true, fullName: true } },
        support: { select: { id: true, fullName: true } },
        ownerEntity: true,
        ownerTeam: true,
      },
    });

    // Audit logs
    if (auditEntries.length > 0) {
      await prisma.auditLog.createMany({ data: auditEntries });
    }

    // Notifications on status change
    if (updates.progress && updates.progress !== existing.progress) {
      await notifyTicketParticipants(
        ticketId,
        userId,
        "STATUS_CHANGED",
        `Ticket ${existing.displayId} status changed from ${existing.progress} to ${updates.progress}`,
      );
    }

    res.json(updated);
  } catch (err) {
    console.error("PATCH /tickets/:id error:", err);
    res.status(500).json({ error: "Failed to update ticket" });
  }
});

// ── DELETE /:id — Not allowed ───────────────────────────────

router.delete("/:id", (_req, res: Response) => {
  res.status(405).json({ error: "Ticket deletion is not supported" });
});

export default router;
