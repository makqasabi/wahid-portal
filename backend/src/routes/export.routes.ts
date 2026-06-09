import { Router } from "express";
import type { Response } from "express";
import { v4 as uuidv4 } from "uuid";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import prisma from "../config/prisma.js";
import type { ScopedRequest } from "../middleware/entityScope.js";
import { requireMinRole } from "../middleware/rbac.js";
import { validateBody, validateQuery } from "../middleware/validate.js";
import { ticketFilterSchema } from "../schemas/ticket.schema.js";
import { config } from "../config/env.js";
import { ticketVisibilityWhere, canViewTicket } from "../utils/visibility.js";
import { z } from "zod";
import type { Prisma } from "@prisma/client";

const router = Router();

// ── Helpers ─────────────────────────────────────────────────

function ticketScopeWhere(req: ScopedRequest): Prisma.TicketWhereInput {
  return ticketVisibilityWhere(req.user!);
}

function buildFilterWhere(q: Record<string, any>, scope: Prisma.TicketWhereInput): Prisma.TicketWhereInput {
  const where: Prisma.TicketWhereInput = { ...scope };

  if (q.entityId) where.ownerEntityId = q.entityId;
  if (q.teamId) where.ownerTeamId = q.teamId;
  if (q.clientId) where.clientId = q.clientId;
  if (q.categoryId) where.categoryId = q.categoryId;
  if (q.ownerId) where.ownerId = q.ownerId;
  if (q.submittedById) where.submittedById = q.submittedById;

  if (q.progress) {
    const values = String(q.progress).split(",").map((s: string) => s.trim());
    where.progress = values.length === 1 ? (values[0] as any) : { in: values as any };
  }

  if (q.priority) where.priority = q.priority;

  if (q.dueDateFrom || q.dueDateTo) {
    where.dueDate = {};
    if (q.dueDateFrom) (where.dueDate as any).gte = new Date(q.dueDateFrom);
    if (q.dueDateTo) (where.dueDate as any).lte = new Date(q.dueDateTo);
  }

  if (q.search) {
    where.actionItem = { contains: q.search, mode: "insensitive" };
  }

  return where;
}

// ── GET /tickets/excel — Export tickets to Excel ────────────

router.get("/tickets/excel", validateQuery(ticketFilterSchema), async (req: ScopedRequest, res: Response) => {
  try {
    const q = req.query as Record<string, any>;
    const where = buildFilterWhere(q, ticketScopeWhere(req));

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        submittingTeam: true,
        category: true,
        client: true,
        submittedBy: { select: { fullName: true } },
        owner: { select: { fullName: true } },
        support: { select: { fullName: true } },
        ownerEntity: true,
        ownerTeam: true,
      },
    });

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Tickets");

    sheet.columns = [
      { header: "Display ID", key: "displayId", width: 18 },
      { header: "Action Item", key: "actionItem", width: 40 },
      { header: "Status", key: "progress", width: 14 },
      { header: "Priority", key: "priority", width: 12 },
      { header: "Category", key: "category", width: 20 },
      { header: "Client", key: "client", width: 20 },
      { header: "Owner", key: "owner", width: 20 },
      { header: "Support", key: "support", width: 20 },
      { header: "Owner Entity", key: "ownerEntity", width: 16 },
      { header: "Owner Team", key: "ownerTeam", width: 16 },
      { header: "Submitted By", key: "submittedBy", width: 20 },
      { header: "Submitting Team", key: "submittingTeam", width: 16 },
      { header: "Due Date", key: "dueDate", width: 14 },
      { header: "Closure Date", key: "closureDate", width: 14 },
      { header: "SLA Variance (days)", key: "slaVarianceDays", width: 18 },
      { header: "Created", key: "createdAt", width: 14 },
    ];

    // Style header row
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };

    for (const t of tickets) {
      sheet.addRow({
        displayId: t.displayId,
        actionItem: t.actionItem,
        progress: t.progress,
        priority: t.priority,
        category: t.category.name,
        client: t.client.name,
        owner: t.owner.fullName,
        support: t.support?.fullName ?? "",
        ownerEntity: t.ownerEntity.name,
        ownerTeam: t.ownerTeam.name,
        submittedBy: t.submittedBy.fullName,
        submittingTeam: t.submittingTeam.name,
        dueDate: t.dueDate ? t.dueDate.toISOString().slice(0, 10) : "",
        closureDate: t.closureDate ? t.closureDate.toISOString().slice(0, 10) : "",
        slaVarianceDays: t.slaVarianceDays ?? "",
        createdAt: t.createdAt.toISOString().slice(0, 10),
      });
    }

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="tickets-${new Date().toISOString().slice(0, 10)}.xlsx"`,
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("GET /export/tickets/excel error:", err);
    res.status(500).json({ error: "Failed to export tickets" });
  }
});

// ── GET /tickets/:id/pdf — Export single ticket as PDF ──────

router.get("/tickets/:id/pdf", async (req: ScopedRequest, res: Response) => {
  try {
    const ticket = await prisma.ticket.findUnique({
      where: { id: req.params.id },
      include: {
        submittingTeam: true,
        submittingEntity: true,
        category: true,
        client: true,
        submittedBy: { select: { fullName: true, entityId: true } },
        owner: { select: { fullName: true } },
        support: { select: { fullName: true } },
        ownerEntity: true,
        ownerTeam: true,
        auditLogs: {
          orderBy: { createdAt: "desc" },
          take: 50,
          include: { user: { select: { fullName: true } } },
        },
      },
    });

    if (!ticket) {
      res.status(404).json({ error: "Ticket not found" });
      return;
    }

    // Visibility check (role-based)
    if (!canViewTicket(req.user!, ticket)) {
      res.status(403).json({ error: "Access denied to this ticket" });
      return;
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
      include: { author: { select: { fullName: true } } },
    });

    const doc = new PDFDocument({ size: "A4", margin: 50 });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="ticket-${ticket.displayId}.pdf"`,
    );

    doc.pipe(res);

    // Title
    doc.fontSize(18).font("Helvetica-Bold").text(`Ticket: ${ticket.displayId}`, { align: "center" });
    doc.moveDown();

    // Details
    doc.fontSize(11).font("Helvetica");
    const details = [
      ["Action Item", ticket.actionItem],
      ["Status", ticket.progress],
      ["Priority", ticket.priority],
      ["Category", ticket.category.name],
      ["Client", ticket.client.name],
      ["Owner", ticket.owner.fullName],
      ["Support", ticket.support?.fullName ?? "N/A"],
      ["Owner Entity", ticket.ownerEntity.name],
      ["Owner Team", ticket.ownerTeam.name],
      ["Submitted By", ticket.submittedBy.fullName],
      ["Submitting Team", ticket.submittingTeam.name],
      ["Due Date", ticket.dueDate ? ticket.dueDate.toISOString().slice(0, 10) : "N/A"],
      ["Closure Date", ticket.closureDate ? ticket.closureDate.toISOString().slice(0, 10) : "N/A"],
      ["SLA Variance", ticket.slaVarianceDays != null ? `${ticket.slaVarianceDays} days` : "N/A"],
      ["Created", ticket.createdAt.toISOString().slice(0, 10)],
    ];

    for (const [label, value] of details) {
      doc.font("Helvetica-Bold").text(`${label}: `, { continued: true });
      doc.font("Helvetica").text(String(value));
    }

    // Comments
    doc.moveDown();
    doc.fontSize(14).font("Helvetica-Bold").text("Comments");
    doc.moveDown(0.5);
    doc.fontSize(10).font("Helvetica");

    if (comments.length === 0) {
      doc.text("No comments.");
    } else {
      for (const c of comments) {
        const label = c.isInternal ? " [Internal]" : "";
        doc.font("Helvetica-Bold").text(
          `${c.author.fullName}${label} — ${c.createdAt.toISOString().slice(0, 16).replace("T", " ")}`,
        );
        doc.font("Helvetica").text(c.body);
        doc.moveDown(0.3);
      }
    }

    // Audit trail
    doc.moveDown();
    doc.fontSize(14).font("Helvetica-Bold").text("Audit Trail");
    doc.moveDown(0.5);
    doc.fontSize(9).font("Helvetica");

    for (const log of ticket.auditLogs) {
      const ts = log.createdAt.toISOString().slice(0, 16).replace("T", " ");
      let line = `[${ts}] ${log.user.fullName} — ${log.action}`;
      if (log.fieldName) line += ` (${log.fieldName}: ${log.oldValue ?? "—"} → ${log.newValue ?? "—"})`;
      doc.text(line);
    }

    doc.end();
  } catch (err) {
    console.error("GET /export/tickets/:id/pdf error:", err);
    res.status(500).json({ error: "Failed to export ticket PDF" });
  }
});

// ── POST /share-link — Create share link ────────────────────

const shareLinkSchema = z.object({
  filters: z.record(z.any()),
  expiresInHours: z.number().min(1).max(720),
  maxViews: z.number().int().min(1).optional(),
});

router.post(
  "/share-link",
  requireMinRole("TEAM_LEAD"),
  validateBody(shareLinkSchema),
  async (req: ScopedRequest, res: Response) => {
    try {
      const { filters, expiresInHours, maxViews } = req.body;
      const token = uuidv4();
      const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

      // Force the creator's entity scope into the filters so shared links
      // can never expose cross-entity data
      const scopedFilters = { ...filters };
      if (req.user!.role !== "SUPER_ADMIN") {
        scopedFilters.creatorEntityId = req.user!.entityId;
      }

      await prisma.shareLink.create({
        data: {
          createdById: req.user!.id,
          token,
          filters: scopedFilters,
          expiresAt,
          maxViews: maxViews ?? null,
        },
      });

      res.status(201).json({
        url: `${config.FRONTEND_URL}/shared/${token}`,
        token,
        expiresAt,
      });
    } catch (err) {
      console.error("POST /export/share-link error:", err);
      res.status(500).json({ error: "Failed to create share link" });
    }
  },
);

export default router;
