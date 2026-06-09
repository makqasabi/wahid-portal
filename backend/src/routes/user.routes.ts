import { Router } from "express";
import type { Response } from "express";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import prisma from "../config/prisma.js";
import type { ScopedRequest } from "../middleware/entityScope.js";
import { requireMinRole } from "../middleware/rbac.js";
import { validateBody } from "../middleware/validate.js";
import { inviteUserSchema, updateUserSchema } from "../schemas/user.schema.js";

const router = Router();

const ROLE_HIERARCHY = [
  "SUPER_ADMIN",
  "ENTITY_ADMIN",
  "TEAM_LEAD",
  "MEMBER",
  "OBSERVER",
  "EXTERNAL_STAKEHOLDER",
];

// ── GET / — List users ──────────────────────────────────────

router.get("/", async (req: ScopedRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    const userEntityId = req.user!.entityId;
    const userTeamId = req.user!.teamId;
    const search = req.query.search as string | undefined;

    let where: Record<string, any> = {};

    if (userRole === "SUPER_ADMIN") {
      // See all
    } else if (userRole === "ENTITY_ADMIN") {
      where.entityId = userEntityId;
    } else if (userRole === "TEAM_LEAD") {
      where.teamId = userTeamId;
    } else {
      // MEMBER, OBSERVER, EXTERNAL_STAKEHOLDER — see all in their entity (for dropdowns)
      where.entityId = userEntityId;
    }

    if (search) {
      where.fullName = { contains: search, mode: "insensitive" };
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        entityId: true,
        teamId: true,
        createdAt: true,
        entity: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
      orderBy: { fullName: "asc" },
    });

    res.json({ data: users });
  } catch (err) {
    console.error("GET /users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

// ── GET /:id — Get user details ─────────────────────────────

router.get("/:id", async (req: ScopedRequest, res: Response) => {
  try {
    const userRole = req.user!.role;
    const userEntityId = req.user!.entityId;

    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        entityId: true,
        teamId: true,
        entity: { select: { id: true, name: true } },
        team: { select: { id: true, name: true } },
      },
    });

    if (!user) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    // Scope check
    if (userRole !== "SUPER_ADMIN" && user.entityId !== userEntityId) {
      res.status(403).json({ error: "Access denied" });
      return;
    }

    res.json(user);
  } catch (err) {
    console.error("GET /users/:id error:", err);
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// ── POST /invite — Invite new user ─────────────────────────

router.post(
  "/invite",
  requireMinRole("ENTITY_ADMIN"),
  validateBody(inviteUserSchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const userRole = req.user!.role;
      const userEntityId = req.user!.entityId;
      const { fullName, fullNameEn, email, entityId, teamId, role } = req.body;

      // Entity admin can only invite to their own entity
      if (userRole === "ENTITY_ADMIN" && entityId !== userEntityId) {
        res.status(403).json({ error: "Entity admins can only invite users to their own entity" });
        return;
      }

      // Entity admin cannot assign SUPER_ADMIN or ENTITY_ADMIN role
      if (userRole === "ENTITY_ADMIN") {
        const roleIndex = ROLE_HIERARCHY.indexOf(role);
        const adminIndex = ROLE_HIERARCHY.indexOf("ENTITY_ADMIN");
        if (roleIndex < adminIndex) {
          res.status(403).json({ error: "Cannot assign a role higher than your own" });
          return;
        }
      }

      // Check email uniqueness
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) {
        res.status(409).json({ error: "A user with this email already exists" });
        return;
      }

      // Verify team belongs to entity
      const team = await prisma.team.findUnique({
        where: { id: teamId },
        select: { entityId: true },
      });
      if (!team || team.entityId !== entityId) {
        res.status(400).json({ error: "Team does not belong to the specified entity" });
        return;
      }

      // Generate temp password
      const tempPassword = crypto.randomBytes(12).toString("base64url");
      const passwordHash = await bcrypt.hash(tempPassword, 12);

      const user = await prisma.user.create({
        data: { fullName, fullNameEn: fullNameEn ?? null, email, passwordHash, entityId, teamId, role },
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          entity: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
      });

      // In production: send invite email with tempPassword
      console.log(`[Invite] Temp password for ${email}: ${tempPassword}`);

      res.status(201).json({ user, tempPassword });
    } catch (err) {
      console.error("POST /users/invite error:", err);
      res.status(500).json({ error: "Failed to invite user" });
    }
  },
);

// ── PATCH /:id — Update user ────────────────────────────────

router.patch(
  "/:id",
  requireMinRole("ENTITY_ADMIN"),
  validateBody(updateUserSchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const userRole = req.user!.role;
      const userEntityId = req.user!.entityId;
      const targetId = req.params.id;
      const updates = req.body;

      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, entityId: true, role: true },
      });

      if (!target) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      // Entity admin cannot edit SUPER_ADMIN users
      if (userRole === "ENTITY_ADMIN" && target.role === "SUPER_ADMIN") {
        res.status(403).json({ error: "Cannot modify a super admin" });
        return;
      }

      // Entity admin can only update users in their entity
      if (userRole === "ENTITY_ADMIN" && target.entityId !== userEntityId) {
        res.status(403).json({ error: "Cannot update users outside your entity" });
        return;
      }

      // Entity admin cannot set role higher than ENTITY_ADMIN
      if (userRole === "ENTITY_ADMIN" && updates.role) {
        const roleIndex = ROLE_HIERARCHY.indexOf(updates.role);
        const adminIndex = ROLE_HIERARCHY.indexOf("ENTITY_ADMIN");
        if (roleIndex < adminIndex) {
          res.status(403).json({ error: "Cannot assign a role higher than ENTITY_ADMIN" });
          return;
        }
      }

      // Cannot deactivate self
      if (updates.isActive === false && targetId === req.user!.id) {
        res.status(400).json({ error: "Cannot deactivate your own account" });
        return;
      }

      // Hash password if being updated
      const data: Record<string, any> = { ...updates };
      if (data.password) {
        data.passwordHash = await bcrypt.hash(data.password, 12);
        delete data.password;
      }

      const updated = await prisma.user.update({
        where: { id: targetId },
        data,
        select: {
          id: true,
          fullName: true,
          email: true,
          role: true,
          isActive: true,
          createdAt: true,
          entity: { select: { id: true, name: true } },
          team: { select: { id: true, name: true } },
        },
      });

      res.json(updated);
    } catch (err) {
      console.error("PATCH /users/:id error:", err);
      res.status(500).json({ error: "Failed to update user" });
    }
  },
);

// ── GET /:id/pending-count — Count of pending owned tickets ──

router.get(
  "/:id/pending-count",
  requireMinRole("ENTITY_ADMIN"),
  async (req: ScopedRequest, res: Response) => {
    try {
      const targetId = req.params.id;
      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { entityId: true },
      });
      if (!target) {
        res.status(404).json({ error: "User not found" });
        return;
      }
      if (req.user!.role === "ENTITY_ADMIN" && target.entityId !== req.user!.entityId) {
        res.status(403).json({ error: "Cannot view users outside your entity" });
        return;
      }

      const ownedPending = await prisma.ticket.count({
        where: { ownerId: targetId, progress: { not: "COMPLETED" } },
      });
      const supportPending = await prisma.ticket.count({
        where: { supportId: targetId, progress: { not: "COMPLETED" } },
      });

      res.json({ ownedPending, supportPending });
    } catch (err) {
      console.error("GET /users/:id/pending-count error:", err);
      res.status(500).json({ error: "Failed to fetch pending count" });
    }
  },
);

// ── POST /:id/deactivate — Deactivate user (with ticket transfer) ──

router.post(
  "/:id/deactivate",
  requireMinRole("ENTITY_ADMIN"),
  async (req: ScopedRequest, res: Response) => {
    try {
      const userRole = req.user!.role;
      const userEntityId = req.user!.entityId;
      const actorId = req.user!.id;
      const targetId = req.params.id;
      const transferToId: string | undefined = req.body?.transferToId;

      if (targetId === actorId) {
        res.status(400).json({ error: "Cannot deactivate your own account" });
        return;
      }

      const target = await prisma.user.findUnique({
        where: { id: targetId },
        select: { id: true, entityId: true, role: true, fullName: true },
      });

      if (!target) {
        res.status(404).json({ error: "User not found" });
        return;
      }

      if (userRole === "ENTITY_ADMIN" && target.entityId !== userEntityId) {
        res.status(403).json({ error: "Cannot deactivate users outside your entity" });
        return;
      }

      if (userRole === "ENTITY_ADMIN" && target.role === "SUPER_ADMIN") {
        res.status(403).json({ error: "Cannot deactivate a super admin" });
        return;
      }

      // Find pending tickets where target is owner or support
      const ownedPending = await prisma.ticket.findMany({
        where: { ownerId: targetId, progress: { not: "COMPLETED" } },
        select: { id: true, displayId: true },
      });
      const supportPending = await prisma.ticket.findMany({
        where: { supportId: targetId, progress: { not: "COMPLETED" } },
        select: { id: true, displayId: true },
      });

      // Owner reassignment requires a transferee — supportId can be safely nulled
      if (ownedPending.length > 0 && !transferToId) {
        res.status(409).json({
          error: "User owns pending tickets — provide transferToId",
          requiresTransfer: true,
          ownedPending: ownedPending.length,
          supportPending: supportPending.length,
        });
        return;
      }

      // Validate transferee if provided
      if (transferToId) {
        if (transferToId === targetId) {
          res.status(400).json({ error: "Transferee cannot be the user being deactivated" });
          return;
        }
        const transferee = await prisma.user.findUnique({
          where: { id: transferToId },
          select: { id: true, entityId: true, isActive: true },
        });
        if (!transferee) {
          res.status(400).json({ error: "Transferee not found" });
          return;
        }
        if (!transferee.isActive) {
          res.status(400).json({ error: "Transferee is not active" });
          return;
        }
        if (transferee.entityId !== target.entityId) {
          res.status(400).json({ error: "Transferee must be in the same entity as the user being deactivated" });
          return;
        }
      }

      // Run reassignment + deactivation in a transaction
      await prisma.$transaction(async (tx) => {
        if (ownedPending.length > 0 && transferToId) {
          await tx.ticket.updateMany({
            where: { id: { in: ownedPending.map((t) => t.id) } },
            data: { ownerId: transferToId },
          });
          await tx.auditLog.createMany({
            data: ownedPending.map((t) => ({
              ticketId: t.id,
              userId: actorId,
              action: "OWNER_TRANSFERRED",
              fieldName: "ownerId",
              oldValue: targetId,
              newValue: transferToId,
            })),
          });
        }
        if (supportPending.length > 0) {
          // Null out support — it's optional and a transferee replacement is too presumptuous
          await tx.ticket.updateMany({
            where: { id: { in: supportPending.map((t) => t.id) } },
            data: { supportId: null },
          });
          await tx.auditLog.createMany({
            data: supportPending.map((t) => ({
              ticketId: t.id,
              userId: actorId,
              action: "SUPPORT_REMOVED",
              fieldName: "supportId",
              oldValue: targetId,
            })),
          });
        }
        await tx.user.update({
          where: { id: targetId },
          data: { isActive: false },
        });
      });

      res.json({
        message: "User deactivated successfully",
        reassignedOwned: ownedPending.length,
        clearedSupport: supportPending.length,
      });
    } catch (err) {
      console.error("POST /users/:id/deactivate error:", err);
      res.status(500).json({ error: "Failed to deactivate user" });
    }
  },
);

export default router;
