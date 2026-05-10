import { Router } from "express";
import type { Response } from "express";
import multer from "multer";
import path from "node:path";
import fs from "node:fs";
import { v4 as uuidv4 } from "uuid";
import prisma from "../config/prisma.js";
import { config } from "../config/env.js";
import type { ScopedRequest } from "../middleware/entityScope.js";

const router = Router();

// Ensure upload directory exists
const uploadDir = path.resolve(config.UPLOAD_DIR);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer config: 10MB max, store with uuid filename
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  },
});

// Allowed file extensions (whitelist approach)
const ALLOWED_EXTENSIONS = new Set([
  ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
  ".csv", ".txt", ".rtf",
  ".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg",
  ".zip", ".rar", ".7z",
]);

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      cb(new Error(`File type "${ext}" is not allowed. Accepted: ${[...ALLOWED_EXTENSIONS].join(", ")}`));
      return;
    }
    cb(null, true);
  },
});

// Magic-byte validation after upload: detect PE executables disguised with allowed extensions
const PE_MAGIC = Buffer.from([0x4d, 0x5a]); // MZ header (Windows executables)
const ELF_MAGIC = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // ELF header (Linux binaries)

async function validateFileMagicBytes(filePath: string): Promise<boolean> {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(4);
  fs.readSync(fd, buf, 0, 4, 0);
  fs.closeSync(fd);

  // Reject if file is actually an executable despite having an allowed extension
  if (buf.subarray(0, 2).equals(PE_MAGIC)) return false;
  if (buf.subarray(0, 4).equals(ELF_MAGIC)) return false;
  return true;
}

// ── POST /ticket/:ticketId — Upload attachment ─────────────

router.post(
  "/ticket/:ticketId",
  upload.single("file"),
  async (req: ScopedRequest, res: Response) => {
    try {
      const { ticketId } = req.params;
      const userId = req.user!.id;
      const userEntityId = req.user!.entityId;
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: "No file uploaded" });
        return;
      }

      // Validate file isn't a disguised executable
      const isSafe = await validateFileMagicBytes(file.path);
      if (!isSafe) {
        fs.unlinkSync(file.path);
        res.status(400).json({ error: "File content does not match its extension — upload rejected" });
        return;
      }

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
        // Clean up uploaded file
        fs.unlinkSync(file.path);
        res.status(404).json({ error: "Ticket not found" });
        return;
      }

      // Visibility check
      if (req.user!.role !== "SUPER_ADMIN") {
        const canAccess =
          ticket.ownerEntityId === userEntityId ||
          ticket.submittingEntityId === userEntityId ||
          ticket.ownerId === userId ||
          ticket.supportId === userId ||
          ticket.submittedById === userId;
        if (!canAccess) {
          fs.unlinkSync(file.path);
          res.status(403).json({ error: "Access denied to this ticket" });
          return;
        }
      }

      const attachment = await prisma.attachment.create({
        data: {
          ticketId,
          uploaderId: userId,
          fileName: file.originalname,
          filePath: file.filename, // just the uuid filename, not full path
          fileSize: file.size,
          mimeType: file.mimetype,
        },
      });

      // Audit log
      await prisma.auditLog.create({
        data: {
          ticketId,
          userId,
          action: "ATTACHMENT_ADDED",
          newValue: file.originalname,
        },
      });

      res.status(201).json(attachment);
    } catch (err) {
      console.error("POST /attachments/ticket/:ticketId error:", err);
      res.status(500).json({ error: "Failed to upload attachment" });
    }
  },
);

// ── GET /:id/download — Download attachment ─────────────────

router.get("/:id/download", async (req: ScopedRequest, res: Response) => {
  try {
    const attachment = await prisma.attachment.findUnique({
      where: { id: req.params.id },
      include: {
        ticket: {
          select: {
            ownerEntityId: true,
            submittingEntityId: true,
            ownerId: true,
            supportId: true,
            submittedById: true,
          },
        },
      },
    });

    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    // Visibility check via ticket
    if (req.user!.role !== "SUPER_ADMIN") {
      const userId = req.user!.id;
      const entityId = req.user!.entityId;
      const t = attachment.ticket;
      const canAccess =
        t.ownerEntityId === entityId ||
        t.submittingEntityId === entityId ||
        t.ownerId === userId ||
        t.supportId === userId ||
        t.submittedById === userId;
      if (!canAccess) {
        res.status(403).json({ error: "Access denied" });
        return;
      }
    }

    const filePath = path.join(uploadDir, attachment.filePath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "File not found on disk" });
      return;
    }

    res.setHeader("Content-Disposition", `attachment; filename="${attachment.fileName}"`);
    res.setHeader("Content-Type", attachment.mimeType);
    fs.createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error("GET /attachments/:id/download error:", err);
    res.status(500).json({ error: "Failed to download attachment" });
  }
});

// ── DELETE /:id — Delete attachment ─────────────────────────

router.delete("/:id", async (req: ScopedRequest, res: Response) => {
  try {
    const userId = req.user!.id;

    const attachment = await prisma.attachment.findUnique({
      where: { id: req.params.id },
      include: {
        ticket: {
          select: {
            ownerEntityId: true,
            submittingEntityId: true,
            ownerId: true,
            submittedById: true,
          },
        },
      },
    });

    if (!attachment) {
      res.status(404).json({ error: "Attachment not found" });
      return;
    }

    // Only uploader, ticket owner, or admin can delete
    const isUploader = attachment.uploaderId === userId;
    const isTicketOwner = attachment.ticket.ownerId === userId;
    const isAdmin = req.user!.role === "SUPER_ADMIN" || req.user!.role === "ENTITY_ADMIN";
    if (!isUploader && !isTicketOwner && !isAdmin) {
      res.status(403).json({ error: "Only the uploader, ticket owner, or admin can delete attachments" });
      return;
    }

    // Delete file from disk
    const filePath = path.join(uploadDir, attachment.filePath);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    await prisma.attachment.delete({ where: { id: req.params.id } });

    // Audit log
    await prisma.auditLog.create({
      data: {
        ticketId: attachment.ticketId,
        userId,
        action: "ATTACHMENT_REMOVED",
        oldValue: attachment.fileName,
      },
    });

    res.json({ message: "Attachment deleted" });
  } catch (err) {
    console.error("DELETE /attachments/:id error:", err);
    res.status(500).json({ error: "Failed to delete attachment" });
  }
});

export default router;
