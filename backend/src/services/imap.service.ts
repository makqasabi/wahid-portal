import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { config } from "../config/env.js";
import prisma from "../config/prisma.js";
import { notifyTicketParticipants } from "./notification.service.js";

/**
 * Inbound email poller.
 *
 * Polls a mailbox over IMAP and turns replies into ticket comments: it matches
 * the sender to a known user and the ticket display id (e.g. WAH-0008) in the
 * subject, then appends the email body as a public comment and notifies
 * participants. Unmatched mail is left untouched.
 *
 * Guarded by IMAP_ENABLED — does nothing until host/user/pass are configured.
 */

const DISPLAY_ID_RE = /\b(WAH-\d{1,8})\b/i;
const MAX_BODY = 5000;

let polling = false;

async function handleMessage(source: Buffer): Promise<boolean> {
  const parsed = await simpleParser(source);
  const fromAddr = parsed.from?.value?.[0]?.address?.toLowerCase();
  const subject = parsed.subject ?? "";
  const text = (parsed.text ?? "").trim();
  if (!fromAddr || !text) return false;

  const match = subject.match(DISPLAY_ID_RE);
  if (!match) return false;
  const displayId = match[1]!.toUpperCase();

  const [user, ticket] = await Promise.all([
    prisma.user.findUnique({
      where: { email: fromAddr },
      select: { id: true, entityId: true, fullName: true, isActive: true },
    }),
    prisma.ticket.findUnique({ where: { displayId }, select: { id: true } }),
  ]);
  if (!user || !user.isActive || !ticket) return false;

  await prisma.comment.create({
    data: {
      ticketId: ticket.id,
      authorId: user.id,
      authorEntityId: user.entityId,
      body: text.slice(0, MAX_BODY),
      isInternal: false,
    },
  });

  await notifyTicketParticipants(
    ticket.id,
    user.id,
    "COMMENT_ADDED",
    `${user.fullName} replied by email`,
  );
  return true;
}

async function pollOnce(): Promise<void> {
  if (polling) return;
  polling = true;
  const client = new ImapFlow({
    host: config.IMAP_HOST,
    port: config.IMAP_PORT,
    secure: config.IMAP_TLS,
    auth: { user: config.IMAP_USER, pass: config.IMAP_PASS },
    logger: false,
  });
  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.IMAP_MAILBOX);
    try {
      const unseen = await client.search({ seen: false });
      if (unseen && unseen.length) {
        for await (const msg of client.fetch({ seen: false }, { source: true })) {
          let processed = false;
          try {
            processed = await handleMessage(msg.source as Buffer);
          } catch (err) {
            console.error("[IMAP] message handling failed:", (err as Error).message);
          }
          // Always mark as seen so we don't reprocess; processed ones became comments
          try {
            await client.messageFlagsAdd(msg.uid, ["\\Seen"], { uid: true });
          } catch {
            /* ignore */
          }
          if (processed) console.log(`[IMAP] inbound email → comment (uid ${msg.uid})`);
        }
      }
    } finally {
      lock.release();
    }
  } catch (err) {
    console.error("[IMAP] poll error:", (err as Error).message);
  } finally {
    try {
      await client.logout();
    } catch {
      /* ignore */
    }
    polling = false;
  }
}

export function startImapPoller(): void {
  if (!config.IMAP_ENABLED) {
    console.log("[IMAP] inbound polling disabled (not configured)");
    return;
  }
  console.log(
    `[IMAP] polling ${config.IMAP_USER}@${config.IMAP_HOST}:${config.IMAP_PORT} every ${config.IMAP_POLL_SECONDS}s`,
  );
  void pollOnce();
  setInterval(() => void pollOnce(), config.IMAP_POLL_SECONDS * 1000).unref();
}
