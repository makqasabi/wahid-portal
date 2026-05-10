import { Router } from "express";
import type { Response } from "express";
import prisma from "../config/prisma.js";
import type { ScopedRequest } from "../middleware/entityScope.js";
import type { Prisma } from "@prisma/client";

const router = Router();

// ── Scope helper ────────────────────────────────────────────

function entityWhere(req: ScopedRequest): Prisma.TicketWhereInput {
  const filterEntityId = req.query.entityId as string | undefined;

  if (req.user?.role === "SUPER_ADMIN") {
    // Super admin can filter by a specific entity or see all
    if (filterEntityId) {
      return {
        OR: [
          { ownerEntityId: filterEntityId },
          { submittingEntityId: filterEntityId },
        ],
      };
    }
    return {};
  }

  // Non-super-admin: always scoped to own entity
  return {
    OR: [
      { ownerEntityId: req.user!.entityId },
      { submittingEntityId: req.user!.entityId },
    ],
  };
}

// ── GET /stats — KPI stats ──────────────────────────────────

router.get("/stats", async (req: ScopedRequest, res: Response) => {
  try {
    const scope = entityWhere(req);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalOpen, overdue, completedThisMonth, slaAgg, onTimeCount, onHoldDependent] =
      await Promise.all([
        prisma.ticket.count({
          where: { ...scope, progress: { in: ["IN_PROGRESS", "DELAYED"] } },
        }),
        prisma.ticket.count({
          where: { ...scope, progress: "DELAYED" },
        }),
        prisma.ticket.count({
          where: {
            ...scope,
            progress: "COMPLETED",
            closureDate: { gte: monthStart },
          },
        }),
        prisma.ticket.aggregate({
          where: { ...scope, slaVarianceDays: { not: null } },
          _avg: { slaVarianceDays: true },
        }),
        prisma.ticket.count({
          where: {
            ...scope,
            progress: "COMPLETED",
            slaVarianceDays: { lte: 0 },
          },
        }),
        prisma.ticket.count({
          where: { ...scope, progress: { in: ["ON_HOLD", "DEPENDENT"] } },
        }),
      ]);

    const totalCompleted = await prisma.ticket.count({
      where: { ...scope, progress: "COMPLETED" },
    });

    const onTimeRate = totalCompleted > 0 ? Math.round((onTimeCount / totalCompleted) * 100) : 0;

    res.json({
      totalOpen,
      overdue,
      completedThisMonth,
      avgSlaVariance: slaAgg._avg.slaVarianceDays ?? 0,
      onTimeRate,
      onHoldDependent,
    });
  } catch (err) {
    console.error("GET /dashboard/stats error:", err);
    res.status(500).json({ error: "Failed to fetch dashboard stats" });
  }
});

// ── GET /entity-split — Counts by entity + status ───────────

router.get("/entity-split", async (req: ScopedRequest, res: Response) => {
  try {
    const scope = entityWhere(req);

    const groups = await prisma.ticket.groupBy({
      by: ["ownerEntityId", "progress"],
      where: scope,
      _count: { id: true },
    });

    // Resolve entity names
    const entityIds = [...new Set(groups.map((g) => g.ownerEntityId))];
    const entities = await prisma.entity.findMany({
      where: { id: { in: entityIds } },
      select: { id: true, name: true, nameEn: true },
    });
    const entityMap = new Map(entities.map((e) => [e.id, { name: e.name, nameEn: e.nameEn }]));

    const data = groups.map((g) => ({
      entityName: entityMap.get(g.ownerEntityId)?.name ?? "Unknown",
      entityNameEn: entityMap.get(g.ownerEntityId)?.nameEn ?? null,
      status: g.progress,
      count: g._count.id,
    }));

    res.json({ data });
  } catch (err) {
    console.error("GET /dashboard/entity-split error:", err);
    res.status(500).json({ error: "Failed to fetch entity split" });
  }
});

// ── GET /sla-trend — Monthly on-time rate last 6 months ─────

router.get("/sla-trend", async (req: ScopedRequest, res: Response) => {
  try {
    const scope = entityWhere(req);
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const completed = await prisma.ticket.findMany({
      where: {
        ...scope,
        progress: "COMPLETED",
        closureDate: { gte: sixMonthsAgo },
      },
      select: {
        closureDate: true,
        slaVarianceDays: true,
        ownerEntityId: true,
      },
    });

    // Resolve entity names
    const entityIds = [...new Set(completed.map((t) => t.ownerEntityId))];
    const entities = await prisma.entity.findMany({
      where: { id: { in: entityIds } },
      select: { id: true, name: true, nameEn: true },
    });
    const entityMap = new Map(entities.map((e) => [e.id, { name: e.name, nameEn: e.nameEn }]));

    // Group by month + entity
    const buckets = new Map<string, { total: number; onTime: number }>();

    // Build nameEn lookup
    const entityNameEnMap = new Map(entities.map((e) => [e.name, e.nameEn]));

    for (const t of completed) {
      if (!t.closureDate) continue;
      const monthKey = `${t.closureDate.getFullYear()}-${String(t.closureDate.getMonth() + 1).padStart(2, "0")}`;
      const entityName = entityMap.get(t.ownerEntityId)?.name ?? "Unknown";
      const key = `${monthKey}|${entityName}`;

      if (!buckets.has(key)) buckets.set(key, { total: 0, onTime: 0 });
      const b = buckets.get(key)!;
      b.total++;
      if (t.slaVarianceDays !== null && t.slaVarianceDays <= 0) b.onTime++;
    }

    const data = Array.from(buckets.entries()).map(([key, val]) => {
      const [month, entityName] = key.split("|");
      return {
        month,
        entityName,
        entityNameEn: entityNameEnMap.get(entityName) ?? null,
        onTimeRate: val.total > 0 ? Math.round((val.onTime / val.total) * 100) : 0,
      };
    });

    data.sort((a, b) => a.month.localeCompare(b.month));

    res.json({ data });
  } catch (err) {
    console.error("GET /dashboard/sla-trend error:", err);
    res.status(500).json({ error: "Failed to fetch SLA trend" });
  }
});

// ── GET /category-breakdown — Progress by category ──────────

router.get("/category-breakdown", async (req: ScopedRequest, res: Response) => {
  try {
    const scope = entityWhere(req);

    const groups = await prisma.ticket.groupBy({
      by: ["categoryId", "progress"],
      where: scope,
      _count: { id: true },
    });

    const categoryIds = [...new Set(groups.map((g) => g.categoryId))];
    const categories = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
      select: { id: true, name: true, nameEn: true },
    });
    const catMap = new Map(categories.map((c) => [c.id, { name: c.name, nameEn: c.nameEn }]));

    const data = groups.map((g) => ({
      categoryName: catMap.get(g.categoryId)?.name ?? "Unknown",
      categoryNameEn: catMap.get(g.categoryId)?.nameEn ?? null,
      status: g.progress,
      count: g._count.id,
    }));

    res.json({ data });
  } catch (err) {
    console.error("GET /dashboard/category-breakdown error:", err);
    res.status(500).json({ error: "Failed to fetch category breakdown" });
  }
});

// ── GET /team-accountability — Team metrics table ───────────

router.get("/team-accountability", async (req: ScopedRequest, res: Response) => {
  try {
    const scope = entityWhere(req);

    const allTickets = await prisma.ticket.findMany({
      where: scope,
      select: {
        ownerTeamId: true,
        progress: true,
        slaVarianceDays: true,
      },
    });

    // Resolve team names
    const teamIds = [...new Set(allTickets.map((t) => t.ownerTeamId))];
    const teams = await prisma.team.findMany({
      where: { id: { in: teamIds } },
      select: { id: true, name: true, nameEn: true, entity: { select: { name: true, nameEn: true } } },
    });
    const teamMap = new Map(teams.map((t) => [t.id, { name: t.name, nameEn: t.nameEn, entityName: t.entity.name, entityNameEn: t.entity.nameEn }]));

    // Aggregate per team
    const teamStats = new Map<
      string,
      { open: number; overdue: number; completed: number; slaSum: number; slaCount: number; onTime: number }
    >();

    for (const t of allTickets) {
      if (!teamStats.has(t.ownerTeamId)) {
        teamStats.set(t.ownerTeamId, { open: 0, overdue: 0, completed: 0, slaSum: 0, slaCount: 0, onTime: 0 });
      }
      const s = teamStats.get(t.ownerTeamId)!;

      if (t.progress === "IN_PROGRESS" || t.progress === "DELAYED") s.open++;
      if (t.progress === "DELAYED") s.overdue++;
      if (t.progress === "COMPLETED") {
        s.completed++;
        if (t.slaVarianceDays !== null) {
          s.slaSum += t.slaVarianceDays;
          s.slaCount++;
          if (t.slaVarianceDays <= 0) s.onTime++;
        }
      }
    }

    const data = Array.from(teamStats.entries()).map(([teamId, s]) => {
      const info = teamMap.get(teamId);
      return {
        teamId,
        teamName: info?.name ?? "Unknown",
        teamNameEn: info?.nameEn ?? null,
        entityName: info?.entityName ?? "Unknown",
        entityNameEn: info?.entityNameEn ?? null,
        open: s.open,
        overdue: s.overdue,
        completed: s.completed,
        avgSlaVariance: s.slaCount > 0 ? Math.round((s.slaSum / s.slaCount) * 10) / 10 : null,
        onTimeRate: s.completed > 0 && s.slaCount > 0
          ? Math.round((s.onTime / s.slaCount) * 100)
          : null,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error("GET /dashboard/team-accountability error:", err);
    res.status(500).json({ error: "Failed to fetch team accountability" });
  }
});

// ── GET /aging — Open ticket age histogram ──────────────────

router.get("/aging", async (req: ScopedRequest, res: Response) => {
  try {
    const scope = entityWhere(req);
    const now = new Date();

    const openTickets = await prisma.ticket.findMany({
      where: { ...scope, progress: { in: ["IN_PROGRESS", "DELAYED"] } },
      select: { createdAt: true },
    });

    const buckets = { "0-7": 0, "8-14": 0, "15-30": 0, "30+": 0 };

    for (const t of openTickets) {
      const ageDays = Math.floor(
        (now.getTime() - t.createdAt.getTime()) / 86_400_000,
      );
      if (ageDays <= 7) buckets["0-7"]++;
      else if (ageDays <= 14) buckets["8-14"]++;
      else if (ageDays <= 30) buckets["15-30"]++;
      else buckets["30+"]++;
    }

    const data = Object.entries(buckets).map(([bucket, count]) => ({
      bucket,
      count,
    }));

    res.json({ data });
  } catch (err) {
    console.error("GET /dashboard/aging error:", err);
    res.status(500).json({ error: "Failed to fetch aging data" });
  }
});

export default router;
