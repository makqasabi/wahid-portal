import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import prisma from "../config/prisma.js";
import type { ScopedRequest } from "../middleware/entityScope.js";
import { requireMinRole, requireRole } from "../middleware/rbac.js";
import { validateBody, validateQuery } from "../middleware/validate.js";

const router = Router();

// All admin routes require at least ENTITY_ADMIN
router.use(requireMinRole("ENTITY_ADMIN"));

// ── Schemas ─────────────────────────────────────────────────

const createClientSchema = z.object({
  name: z.string().min(1, "Client name is required"),
  aliases: z.array(z.string()).default([]),
});

const updateClientSchema = createClientSchema.partial().extend({
  isActive: z.boolean().optional(),
});

const createCategorySchema = z.object({
  name: z.string().min(1, "Category name is required"),
});

const updateCategorySchema = createCategorySchema.partial().extend({
  isActive: z.boolean().optional(),
});

const auditLogFilterSchema = z.object({
  ticketId: z.string().uuid().optional(),
  userId: z.string().uuid().optional(),
  action: z.string().optional(),
  dateFrom: z.string().datetime().optional(),
  dateTo: z.string().datetime().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

// ── GET /audit-logs — Paginated audit logs ──────────────────

router.get("/audit-logs", validateQuery(auditLogFilterSchema), async (req: ScopedRequest, res: Response) => {
  try {
    const q = req.query as Record<string, any>;
    const page: number = q.page ?? 1;
    const limit: number = q.limit ?? 25;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = {};

    if (q.ticketId) where.ticketId = q.ticketId;
    if (q.userId) where.userId = q.userId;
    if (q.action) where.action = q.action;

    if (q.dateFrom || q.dateTo) {
      where.createdAt = {};
      if (q.dateFrom) where.createdAt.gte = new Date(q.dateFrom);
      if (q.dateTo) where.createdAt.lte = new Date(q.dateTo);
    }

    // Entity scope: Entity Admin only sees logs for tickets in their entity
    if (req.user?.role === "ENTITY_ADMIN") {
      where.ticket = {
        OR: [
          { ownerEntityId: req.user.entityId },
          { submittingEntityId: req.user.entityId },
        ],
      };
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: { select: { id: true, fullName: true } },
          ticket: { select: { id: true, displayId: true } },
        },
      }),
      prisma.auditLog.count({ where }),
    ]);

    res.json({
      data: logs,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    console.error("GET /admin/audit-logs error:", err);
    res.status(500).json({ error: "Failed to fetch audit logs" });
  }
});

// ── Clients CRUD ────────────────────────────────────────────

router.get("/clients", async (_req: ScopedRequest, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ data: clients });
  } catch (err) {
    console.error("GET /admin/clients error:", err);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

router.post(
  "/clients",
  requireRole("SUPER_ADMIN"),
  validateBody(createClientSchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const { name, aliases } = req.body;

      const existing = await prisma.client.findUnique({ where: { name } });
      if (existing) {
        res.status(409).json({ error: "A client with this name already exists" });
        return;
      }

      const client = await prisma.client.create({ data: { name, aliases } });
      res.status(201).json(client);
    } catch (err) {
      console.error("POST /admin/clients error:", err);
      res.status(500).json({ error: "Failed to create client" });
    }
  },
);

router.patch(
  "/clients/:id",
  requireRole("SUPER_ADMIN"),
  validateBody(updateClientSchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const client = await prisma.client.findUnique({ where: { id: req.params.id } });
      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      const updated = await prisma.client.update({
        where: { id: req.params.id },
        data: req.body,
      });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /admin/clients/:id error:", err);
      res.status(500).json({ error: "Failed to update client" });
    }
  },
);

router.delete(
  "/clients/:id",
  requireRole("SUPER_ADMIN"),
  async (req: ScopedRequest, res: Response) => {
    try {
      const client = await prisma.client.findUnique({ where: { id: req.params.id as string } });
      if (!client) {
        res.status(404).json({ error: "Client not found" });
        return;
      }

      // Check if client is referenced by any tickets
      const ticketCount = await prisma.ticket.count({ where: { clientId: client.id } });
      if (ticketCount > 0) {
        // Soft-delete: deactivate instead
        const updated = await prisma.client.update({
          where: { id: client.id },
          data: { isActive: false },
        });
        res.json({ ...updated, message: "Client has tickets — deactivated instead of deleted" });
        return;
      }

      await prisma.client.delete({ where: { id: client.id } });
      res.json({ message: "Client deleted" });
    } catch (err) {
      console.error("DELETE /admin/clients/:id error:", err);
      res.status(500).json({ error: "Failed to delete client" });
    }
  },
);

// ── Categories CRUD ─────────────────────────────────────────

router.get("/categories", async (_req: ScopedRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    res.json({ data: categories });
  } catch (err) {
    console.error("GET /admin/categories error:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.post(
  "/categories",
  requireRole("SUPER_ADMIN"),
  validateBody(createCategorySchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const { name } = req.body;

      const existing = await prisma.category.findUnique({ where: { name } });
      if (existing) {
        res.status(409).json({ error: "A category with this name already exists" });
        return;
      }

      const category = await prisma.category.create({ data: { name } });
      res.status(201).json(category);
    } catch (err) {
      console.error("POST /admin/categories error:", err);
      res.status(500).json({ error: "Failed to create category" });
    }
  },
);

router.patch(
  "/categories/:id",
  requireRole("SUPER_ADMIN"),
  validateBody(updateCategorySchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const category = await prisma.category.findUnique({ where: { id: req.params.id } });
      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }

      const updated = await prisma.category.update({
        where: { id: req.params.id },
        data: req.body,
      });
      res.json(updated);
    } catch (err) {
      console.error("PATCH /admin/categories/:id error:", err);
      res.status(500).json({ error: "Failed to update category" });
    }
  },
);

router.delete(
  "/categories/:id",
  requireRole("SUPER_ADMIN"),
  async (req: ScopedRequest, res: Response) => {
    try {
      const category = await prisma.category.findUnique({ where: { id: req.params.id as string } });
      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }

      const ticketCount = await prisma.ticket.count({ where: { categoryId: category.id } });
      if (ticketCount > 0) {
        const updated = await prisma.category.update({
          where: { id: category.id },
          data: { isActive: false },
        });
        res.json({ ...updated, message: "Category has tickets — deactivated instead of deleted" });
        return;
      }

      await prisma.category.delete({ where: { id: category.id } });
      res.json({ message: "Category deleted" });
    } catch (err) {
      console.error("DELETE /admin/categories/:id error:", err);
      res.status(500).json({ error: "Failed to delete category" });
    }
  },
);

// ── Teams (entity scoped) ───────────────────────────────────

router.get("/teams", async (req: ScopedRequest, res: Response) => {
  try {
    const where: Record<string, any> = {};
    if (req.user?.role !== "SUPER_ADMIN") {
      where.entityId = req.user!.entityId;
    }

    const teams = await prisma.team.findMany({
      where,
      orderBy: { name: "asc" },
      include: { entity: { select: { id: true, name: true } } },
    });
    res.json({ data: teams });
  } catch (err) {
    console.error("GET /admin/teams error:", err);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

// ── Entities (SUPER_ADMIN only) ─────────────────────────────

router.get(
  "/entities",
  requireRole("SUPER_ADMIN"),
  async (_req: ScopedRequest, res: Response) => {
    try {
      const entities = await prisma.entity.findMany({
        orderBy: { name: "asc" },
      });
      res.json({ data: entities });
    } catch (err) {
      console.error("GET /admin/entities error:", err);
      res.status(500).json({ error: "Failed to fetch entities" });
    }
  },
);

export default router;
