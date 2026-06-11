import { Router } from "express";
import type { Response } from "express";
import prisma from "../config/prisma.js";
import type { ScopedRequest } from "../middleware/entityScope.js";
import { getActiveStatuses, getActivePriorities } from "../services/workflow.service.js";

const router = Router();

// ── GET /workflow — active statuses + priorities (for badges/forms) ──
router.get("/workflow", async (_req: ScopedRequest, res: Response) => {
  try {
    const [statuses, priorities] = await Promise.all([
      getActiveStatuses(),
      getActivePriorities(),
    ]);
    res.json({
      statuses: statuses.map((s) => ({
        key: s.key,
        name: s.name,
        nameEn: s.nameEn,
        color: s.color,
        isDefault: s.isDefault,
        isClosed: s.isClosed,
        pausesSla: s.pausesSla,
        isOverdueFlag: s.isOverdueFlag,
        transitionsTo: JSON.parse(s.transitionsTo),
      })),
      priorities: priorities.map((p) => ({
        key: p.key,
        name: p.name,
        nameEn: p.nameEn,
        color: p.color,
        isDefault: p.isDefault,
      })),
    });
  } catch (err) {
    console.error("GET /reference/workflow error:", err);
    res.status(500).json({ error: "Failed to fetch workflow" });
  }
});

// ── GET /categories/:id/fields — active custom fields for the ticket form ──
router.get("/categories/:id/fields", async (req: ScopedRequest, res: Response) => {
  try {
    const fields = await prisma.categoryField.findMany({
      where: { categoryId: req.params.id, isActive: true },
      orderBy: { sortOrder: "asc" },
    });
    res.json({
      data: fields.map((f) => ({
        id: f.id,
        key: f.key,
        label: f.label,
        labelEn: f.labelEn,
        type: f.type,
        options: JSON.parse(f.options),
        required: f.required,
      })),
    });
  } catch (err) {
    console.error("GET /reference/categories/:id/fields error:", err);
    res.status(500).json({ error: "Failed to fetch fields" });
  }
});

// These endpoints are accessible to ANY authenticated user.
// They provide read-only reference data for form dropdowns.

// ── GET /clients ────────────────────────────────────────────
router.get("/clients", async (_req: ScopedRequest, res: Response) => {
  try {
    const clients = await prisma.client.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameEn: true, aliases: true, isActive: true },
    });
    res.json({ data: clients });
  } catch (err) {
    console.error("GET /reference/clients error:", err);
    res.status(500).json({ error: "Failed to fetch clients" });
  }
});

// ── GET /categories ─────────────────────────────────────────
router.get("/categories", async (_req: ScopedRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameEn: true, isActive: true },
    });
    res.json({ data: categories });
  } catch (err) {
    console.error("GET /reference/categories error:", err);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

// ── GET /teams ──────────────────────────────────────────────
router.get("/teams", async (_req: ScopedRequest, res: Response) => {
  try {
    const teams = await prisma.team.findMany({
      orderBy: { name: "asc" },
      include: { entity: { select: { id: true, name: true, nameEn: true } } },
    });
    res.json({ data: teams });
  } catch (err) {
    console.error("GET /reference/teams error:", err);
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

// ── GET /entities ───────────────────────────────────────────
router.get("/entities", async (_req: ScopedRequest, res: Response) => {
  try {
    const entities = await prisma.entity.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, nameEn: true, fullName: true },
    });
    res.json({ data: entities });
  } catch (err) {
    console.error("GET /reference/entities error:", err);
    res.status(500).json({ error: "Failed to fetch entities" });
  }
});

// ── GET /users ──────────────────────────────────────────────
// Returns active users for owner/support dropdowns.
// Non-super-admins see all users (both entities) so they can assign
// cross-entity owners, but we exclude sensitive fields.
router.get("/users", async (_req: ScopedRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { isActive: true },
      select: {
        id: true,
        fullName: true,
        fullNameEn: true,
        entityId: true,
        teamId: true,
        entity: { select: { id: true, name: true, nameEn: true } },
        team: { select: { id: true, name: true, nameEn: true } },
      },
      orderBy: { fullName: "asc" },
    });
    res.json({ data: users });
  } catch (err) {
    console.error("GET /reference/users error:", err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
});

export default router;
