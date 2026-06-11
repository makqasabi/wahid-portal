/**
 * Admin configuration API (SUPER_ADMIN only) — the "customize everything"
 * module: runtime settings, dynamic ticket workflow (statuses/priorities),
 * and per-category custom fields. Mounted at /api/admin alongside
 * admin.routes.ts.
 */
import { Router } from "express";
import type { Response } from "express";
import { z } from "zod";
import prisma from "../config/prisma.js";
import type { ScopedRequest } from "../middleware/entityScope.js";
import { requireRole } from "../middleware/rbac.js";
import { validateBody } from "../middleware/validate.js";
import {
  getSettings,
  updateSettingGroup,
  resetSettingGroup,
  settingDefaults,
  SETTING_GROUPS,
  type SettingGroup,
} from "../services/settings.service.js";
import {
  getAllStatuses,
  getAllPriorities,
  invalidateWorkflowCache,
} from "../services/workflow.service.js";
import { scheduleSlaChecker, runSlaCheck } from "../jobs/slaChecker.js";
import { scheduleWeeklyReport, runWeeklyReport } from "../jobs/weeklyReport.js";

const router = Router();
router.use(requireRole("SUPER_ADMIN"));

// ── Settings ────────────────────────────────────────────────

router.get("/settings", async (_req: ScopedRequest, res: Response) => {
  try {
    res.json({ settings: await getSettings(), defaults: settingDefaults() });
  } catch (err) {
    console.error("GET /admin/settings error:", err);
    res.status(500).json({ error: "Failed to load settings" });
  }
});

const groupSchemas: Record<SettingGroup, z.ZodTypeAny> = {
  branding: z.object({
    portalNameEn: z.string().min(1).max(60).optional(),
    portalNameAr: z.string().min(1).max(60).optional(),
    fullNameEn: z.string().min(1).max(120).optional(),
    fullNameAr: z.string().min(1).max(120).optional(),
    taglineEn: z.string().max(200).optional(),
    taglineAr: z.string().max(200).optional(),
    logoUrl: z.string().max(500).optional(),
    primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
    emailSignature: z.string().max(200).optional(),
    emailButtonColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  }),
  sla: z.object({
    defaultWarningDays: z.number().int().min(0).max(365).optional(),
    checkerCron: z.string().max(50).optional(),
  }),
  reports: z.object({
    weeklyEnabled: z.boolean().optional(),
    weeklyCron: z.string().max(50).optional(),
    weeklyRecipients: z.array(z.string().email()).max(50).optional(),
  }),
  toggles: z.object({
    whatsapp: z.boolean().nullable().optional(),
    imap: z.boolean().nullable().optional(),
    oidc: z.boolean().nullable().optional(),
  }),
  templates: z.record(
    z.string().max(40),
    z.object({
      subject: z.string().min(1).max(200),
      body: z.string().min(1).max(1000),
    }),
  ),
};

router.patch("/settings/:group", async (req: ScopedRequest, res: Response) => {
  try {
    const group = req.params.group as SettingGroup;
    if (!(SETTING_GROUPS as readonly string[]).includes(group)) {
      res.status(404).json({ error: "Unknown settings group" });
      return;
    }
    const parsed = groupSchemas[group].safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid settings" });
      return;
    }
    const settings = await updateSettingGroup(group, parsed.data, req.user!.id);
    // Schedules live in settings — re-arm the jobs when they change
    if (group === "sla") await scheduleSlaChecker();
    if (group === "reports") await scheduleWeeklyReport();
    res.json({ settings });
  } catch (err) {
    console.error("PATCH /admin/settings error:", err);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.post("/settings/:group/reset", async (req: ScopedRequest, res: Response) => {
  try {
    const group = req.params.group as SettingGroup;
    if (!(SETTING_GROUPS as readonly string[]).includes(group)) {
      res.status(404).json({ error: "Unknown settings group" });
      return;
    }
    const settings = await resetSettingGroup(group);
    if (group === "sla") await scheduleSlaChecker();
    if (group === "reports") await scheduleWeeklyReport();
    res.json({ settings });
  } catch (err) {
    console.error("POST /admin/settings reset error:", err);
    res.status(500).json({ error: "Failed to reset settings" });
  }
});

// ── Manual job triggers ─────────────────────────────────────

router.post("/jobs/sla-check/run", async (_req: ScopedRequest, res: Response) => {
  void runSlaCheck();
  res.json({ message: "SLA check started" });
});

router.post("/jobs/weekly-report/run", async (_req: ScopedRequest, res: Response) => {
  void runWeeklyReport();
  res.json({ message: "Weekly report started" });
});

// ── Workflow: statuses ──────────────────────────────────────

const statusBodySchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]{1,29}$/, "Key must be UPPER_SNAKE_CASE"),
  name: z.string().min(1).max(60),
  nameEn: z.string().max(60).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
  isClosed: z.boolean().optional(),
  pausesSla: z.boolean().optional(),
  isOverdueFlag: z.boolean().optional(),
  transitionsTo: z.array(z.string()).max(50).optional(),
});

router.get("/workflow/statuses", async (_req: ScopedRequest, res: Response) => {
  try {
    const statuses = await getAllStatuses();
    const counts = await prisma.ticket.groupBy({ by: ["progress"], _count: { id: true } });
    const countMap = new Map(counts.map((c) => [c.progress, c._count.id]));
    res.json(
      statuses.map((s) => ({
        ...s,
        transitionsTo: JSON.parse(s.transitionsTo),
        ticketCount: countMap.get(s.key) ?? 0,
      })),
    );
  } catch (err) {
    console.error("GET /admin/workflow/statuses error:", err);
    res.status(500).json({ error: "Failed to load statuses" });
  }
});

router.post(
  "/workflow/statuses",
  validateBody(statusBodySchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const data = req.body;
      const existing = await prisma.ticketStatus.findUnique({ where: { key: data.key } });
      if (existing) {
        res.status(409).json({ error: "A status with this key already exists" });
        return;
      }
      // Single-default / single-overdue-flag invariants
      if (data.isDefault) {
        await prisma.ticketStatus.updateMany({ data: { isDefault: false } });
      }
      if (data.isOverdueFlag) {
        await prisma.ticketStatus.updateMany({ data: { isOverdueFlag: false } });
      }
      const created = await prisma.ticketStatus.create({
        data: { ...data, transitionsTo: JSON.stringify(data.transitionsTo ?? []) },
      });
      invalidateWorkflowCache();
      res.status(201).json({ ...created, transitionsTo: JSON.parse(created.transitionsTo) });
    } catch (err) {
      console.error("POST /admin/workflow/statuses error:", err);
      res.status(500).json({ error: "Failed to create status" });
    }
  },
);

router.patch(
  "/workflow/statuses/:id",
  validateBody(statusBodySchema.partial().omit({ key: true })),
  async (req: ScopedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const data = req.body;
      const status = await prisma.ticketStatus.findUnique({ where: { id } });
      if (!status) {
        res.status(404).json({ error: "Status not found" });
        return;
      }
      // Keep at least one active status and never deactivate the default
      if (data.isActive === false) {
        const activeCount = await prisma.ticketStatus.count({ where: { isActive: true } });
        if (activeCount <= 1) {
          res.status(409).json({ error: "At least one status must remain active" });
          return;
        }
        if (status.isDefault) {
          res.status(409).json({ error: "Cannot deactivate the default status — set another default first" });
          return;
        }
      }
      if (data.isDefault === false && status.isDefault) {
        res.status(409).json({ error: "Set another status as default instead of unsetting this one" });
        return;
      }
      if (data.isDefault) {
        await prisma.ticketStatus.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      }
      if (data.isOverdueFlag) {
        await prisma.ticketStatus.updateMany({ where: { id: { not: id } }, data: { isOverdueFlag: false } });
      }
      const updated = await prisma.ticketStatus.update({
        where: { id },
        data: {
          ...data,
          ...(data.transitionsTo !== undefined
            ? { transitionsTo: JSON.stringify(data.transitionsTo) }
            : {}),
        },
      });
      invalidateWorkflowCache();
      res.json({ ...updated, transitionsTo: JSON.parse(updated.transitionsTo) });
    } catch (err) {
      console.error("PATCH /admin/workflow/statuses error:", err);
      res.status(500).json({ error: "Failed to update status" });
    }
  },
);

router.delete("/workflow/statuses/:id", async (req: ScopedRequest, res: Response) => {
  try {
    const id = req.params.id;
    const status = await prisma.ticketStatus.findUnique({ where: { id } });
    if (!status) {
      res.status(404).json({ error: "Status not found" });
      return;
    }
    const inUse = await prisma.ticket.count({
      where: { progress: status.key, deletedAt: undefined },
    });
    if (inUse > 0) {
      res.status(409).json({
        error: `${inUse} ticket(s) still use this status — deactivate it instead, or move those tickets first`,
      });
      return;
    }
    if (status.isDefault) {
      res.status(409).json({ error: "Cannot delete the default status" });
      return;
    }
    await prisma.ticketStatus.delete({ where: { id } });
    // Remove the deleted key from other statuses' transitions
    const others = await prisma.ticketStatus.findMany();
    for (const s of others) {
      try {
        const t: string[] = JSON.parse(s.transitionsTo);
        if (t.includes(status.key)) {
          await prisma.ticketStatus.update({
            where: { id: s.id },
            data: { transitionsTo: JSON.stringify(t.filter((k) => k !== status.key)) },
          });
        }
      } catch {
        /* skip unparseable */
      }
    }
    invalidateWorkflowCache();
    res.json({ message: "Status deleted" });
  } catch (err) {
    console.error("DELETE /admin/workflow/statuses error:", err);
    res.status(500).json({ error: "Failed to delete status" });
  }
});

// ── Workflow: priorities ────────────────────────────────────

const priorityBodySchema = z.object({
  key: z.string().regex(/^[A-Z][A-Z0-9_]{1,29}$/, "Key must be UPPER_SNAKE_CASE"),
  name: z.string().min(1).max(60),
  nameEn: z.string().max(60).nullable().optional(),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
  isDefault: z.boolean().optional(),
});

router.get("/workflow/priorities", async (_req: ScopedRequest, res: Response) => {
  try {
    const priorities = await getAllPriorities();
    const counts = await prisma.ticket.groupBy({ by: ["priority"], _count: { id: true } });
    const countMap = new Map(counts.map((c) => [c.priority, c._count.id]));
    res.json(priorities.map((p) => ({ ...p, ticketCount: countMap.get(p.key) ?? 0 })));
  } catch (err) {
    console.error("GET /admin/workflow/priorities error:", err);
    res.status(500).json({ error: "Failed to load priorities" });
  }
});

router.post(
  "/workflow/priorities",
  validateBody(priorityBodySchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const data = req.body;
      const existing = await prisma.ticketPriority.findUnique({ where: { key: data.key } });
      if (existing) {
        res.status(409).json({ error: "A priority with this key already exists" });
        return;
      }
      if (data.isDefault) {
        await prisma.ticketPriority.updateMany({ data: { isDefault: false } });
      }
      const created = await prisma.ticketPriority.create({ data });
      invalidateWorkflowCache();
      res.status(201).json(created);
    } catch (err) {
      console.error("POST /admin/workflow/priorities error:", err);
      res.status(500).json({ error: "Failed to create priority" });
    }
  },
);

router.patch(
  "/workflow/priorities/:id",
  validateBody(priorityBodySchema.partial().omit({ key: true })),
  async (req: ScopedRequest, res: Response) => {
    try {
      const id = req.params.id;
      const data = req.body;
      const priority = await prisma.ticketPriority.findUnique({ where: { id } });
      if (!priority) {
        res.status(404).json({ error: "Priority not found" });
        return;
      }
      if (data.isActive === false) {
        const activeCount = await prisma.ticketPriority.count({ where: { isActive: true } });
        if (activeCount <= 1) {
          res.status(409).json({ error: "At least one priority must remain active" });
          return;
        }
        if (priority.isDefault) {
          res.status(409).json({ error: "Cannot deactivate the default priority — set another default first" });
          return;
        }
      }
      if (data.isDefault) {
        await prisma.ticketPriority.updateMany({ where: { id: { not: id } }, data: { isDefault: false } });
      }
      const updated = await prisma.ticketPriority.update({ where: { id }, data });
      invalidateWorkflowCache();
      res.json(updated);
    } catch (err) {
      console.error("PATCH /admin/workflow/priorities error:", err);
      res.status(500).json({ error: "Failed to update priority" });
    }
  },
);

router.delete("/workflow/priorities/:id", async (req: ScopedRequest, res: Response) => {
  try {
    const id = req.params.id;
    const priority = await prisma.ticketPriority.findUnique({ where: { id } });
    if (!priority) {
      res.status(404).json({ error: "Priority not found" });
      return;
    }
    const inUse = await prisma.ticket.count({
      where: { priority: priority.key, deletedAt: undefined },
    });
    if (inUse > 0) {
      res.status(409).json({
        error: `${inUse} ticket(s) still use this priority — deactivate it instead`,
      });
      return;
    }
    if (priority.isDefault) {
      res.status(409).json({ error: "Cannot delete the default priority" });
      return;
    }
    await prisma.ticketPriority.delete({ where: { id } });
    invalidateWorkflowCache();
    res.json({ message: "Priority deleted" });
  } catch (err) {
    console.error("DELETE /admin/workflow/priorities error:", err);
    res.status(500).json({ error: "Failed to delete priority" });
  }
});

// ── Custom fields per category (form builder) ───────────────

const fieldBodySchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,29}$/, "Key must be lower_snake_case"),
  label: z.string().min(1).max(80),
  labelEn: z.string().max(80).nullable().optional(),
  type: z.enum(["text", "textarea", "number", "date", "select"]).optional(),
  options: z.array(z.string().min(1).max(120)).max(50).optional(),
  required: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(999).optional(),
  isActive: z.boolean().optional(),
});

router.get("/categories/:categoryId/fields", async (req: ScopedRequest, res: Response) => {
  try {
    const fields = await prisma.categoryField.findMany({
      where: { categoryId: req.params.categoryId },
      orderBy: { sortOrder: "asc" },
    });
    const counts = await prisma.ticketFieldValue.groupBy({
      by: ["fieldId"],
      where: { fieldId: { in: fields.map((f) => f.id) } },
      _count: { id: true },
    });
    const countMap = new Map(counts.map((c) => [c.fieldId, c._count.id]));
    res.json(
      fields.map((f) => ({
        ...f,
        options: JSON.parse(f.options),
        valueCount: countMap.get(f.id) ?? 0,
      })),
    );
  } catch (err) {
    console.error("GET /admin/categories/:id/fields error:", err);
    res.status(500).json({ error: "Failed to load fields" });
  }
});

router.post(
  "/categories/:categoryId/fields",
  validateBody(fieldBodySchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const categoryId = req.params.categoryId;
      const category = await prisma.category.findUnique({ where: { id: categoryId } });
      if (!category) {
        res.status(404).json({ error: "Category not found" });
        return;
      }
      const data = req.body;
      if (data.type === "select" && (!data.options || data.options.length === 0)) {
        res.status(400).json({ error: "Select fields need at least one option" });
        return;
      }
      const dup = await prisma.categoryField.findUnique({
        where: { categoryId_key: { categoryId, key: data.key } },
      });
      if (dup) {
        res.status(409).json({ error: "A field with this key already exists on the category" });
        return;
      }
      const created = await prisma.categoryField.create({
        data: { ...data, categoryId, options: JSON.stringify(data.options ?? []) },
      });
      res.status(201).json({ ...created, options: JSON.parse(created.options) });
    } catch (err) {
      console.error("POST /admin/categories/:id/fields error:", err);
      res.status(500).json({ error: "Failed to create field" });
    }
  },
);

router.patch(
  "/category-fields/:id",
  validateBody(fieldBodySchema.partial().omit({ key: true })),
  async (req: ScopedRequest, res: Response) => {
    try {
      const data = req.body;
      const field = await prisma.categoryField.findUnique({ where: { id: req.params.id } });
      if (!field) {
        res.status(404).json({ error: "Field not found" });
        return;
      }
      const updated = await prisma.categoryField.update({
        where: { id: req.params.id },
        data: {
          ...data,
          ...(data.options !== undefined ? { options: JSON.stringify(data.options) } : {}),
        },
      });
      res.json({ ...updated, options: JSON.parse(updated.options) });
    } catch (err) {
      console.error("PATCH /admin/category-fields error:", err);
      res.status(500).json({ error: "Failed to update field" });
    }
  },
);

router.delete("/category-fields/:id", async (req: ScopedRequest, res: Response) => {
  try {
    const field = await prisma.categoryField.findUnique({
      where: { id: req.params.id },
    });
    if (!field) {
      res.status(404).json({ error: "Field not found" });
      return;
    }
    const valueCount = await prisma.ticketFieldValue.count({
      where: { fieldId: field.id },
    });
    if (valueCount > 0) {
      // Values exist on tickets — deactivate instead of destroying data
      await prisma.categoryField.update({
        where: { id: field.id },
        data: { isActive: false },
      });
      res.json({ message: "Field has saved values — deactivated instead of deleted" });
      return;
    }
    await prisma.categoryField.delete({ where: { id: field.id } });
    res.json({ message: "Field deleted" });
  } catch (err) {
    console.error("DELETE /admin/category-fields error:", err);
    res.status(500).json({ error: "Failed to delete field" });
  }
});

export default router;
