/**
 * logStore — durable SQLite log sink for the whole backend.
 *
 * Every log the app produces (HTTP requests, errors, all console output,
 * auth attempts, and the business audit trail) is written as a row in a
 * single `app_log` table inside a SQLite database file. The file lives on a
 * persistent Docker volume (`LOG_DIR`, default ./logs) so logs survive
 * container restarts and re-deploys.
 *
 * Design notes:
 *  - FAIL-OPEN. The native `better-sqlite3` binary is loaded with a dynamic
 *    import inside try/catch; if it is missing or the DB can't be opened the
 *    store silently disables itself and the app keeps running (console only).
 *    A logging subsystem must never take the API down.
 *  - Writes are buffered in memory until the DB is ready, then flushed, so
 *    logs emitted during startup aren't lost.
 *  - Every write is wrapped so a logging failure can never throw into a
 *    request handler.
 */
import path from "node:path";
import fs from "node:fs";

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogEntry {
  level?: LogLevel;
  /** http | error | console | auth | audit | job | security | system */
  category?: string;
  message?: string | null;
  method?: string | null;
  path?: string | null;
  status?: number | null;
  durationMs?: number | null;
  userId?: string | null;
  userEmail?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  meta?: unknown;
}

// keep an untouched reference to the real console.error so our own internal
// diagnostics never recurse through the console-capture wrapper below.
const realError = console.error.bind(console);

let db: any = null;
let insertStmt: any = null;
let ready = false;
let disabled = false;

const queue: LogEntry[] = [];
const MAX_QUEUE = 5000;

function safeJson(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v, (_k, val) =>
      typeof val === "bigint" ? val.toString() : val,
    );
  } catch {
    return String(v);
  }
}

function rowFromEntry(e: LogEntry): Record<string, unknown> {
  return {
    ts: new Date().toISOString(),
    level: e.level ?? "info",
    category: e.category ?? "app",
    message: e.message ?? null,
    method: e.method ?? null,
    path: e.path ? String(e.path).slice(0, 1000) : null,
    status: e.status ?? null,
    duration_ms: e.durationMs ?? null,
    user_id: e.userId ?? null,
    user_email: e.userEmail ?? null,
    ip: e.ip ?? null,
    user_agent: e.userAgent ? String(e.userAgent).slice(0, 500) : null,
    meta: safeJson(e.meta),
  };
}

/** Write a single log row. Never throws. Buffers until the DB is ready. */
export function writeLog(entry: LogEntry): void {
  if (disabled) return;
  if (!ready) {
    if (queue.length < MAX_QUEUE) queue.push(entry);
    return;
  }
  try {
    insertStmt.run(rowFromEntry(entry));
  } catch {
    /* swallow — logging must never break the request */
  }
}

/** Open (or create) the SQLite log DB. Idempotent and fail-open. */
export async function initLogStore(): Promise<void> {
  if (ready || disabled) return;
  try {
    const dir =
      process.env.LOG_DIR && process.env.LOG_DIR.trim()
        ? process.env.LOG_DIR.trim()
        : path.resolve(process.cwd(), "logs");
    fs.mkdirSync(dir, { recursive: true });

    const mod = await import("better-sqlite3");
    const Database = (mod as any).default ?? mod;
    const file = path.join(dir, "wahid-logs.db");
    db = new Database(file);
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = NORMAL");
    db.pragma("busy_timeout = 5000");
    db.exec(`
      CREATE TABLE IF NOT EXISTS app_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        ts          TEXT NOT NULL,
        level       TEXT,
        category    TEXT,
        message     TEXT,
        method      TEXT,
        path        TEXT,
        status      INTEGER,
        duration_ms INTEGER,
        user_id     TEXT,
        user_email  TEXT,
        ip          TEXT,
        user_agent  TEXT,
        meta        TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_log_ts    ON app_log(ts);
      CREATE INDEX IF NOT EXISTS idx_log_cat   ON app_log(category);
      CREATE INDEX IF NOT EXISTS idx_log_level ON app_log(level);
      CREATE INDEX IF NOT EXISTS idx_log_user  ON app_log(user_id);
    `);
    insertStmt = db.prepare(`
      INSERT INTO app_log
        (ts, level, category, message, method, path, status, duration_ms,
         user_id, user_email, ip, user_agent, meta)
      VALUES
        (@ts, @level, @category, @message, @method, @path, @status, @duration_ms,
         @user_id, @user_email, @ip, @user_agent, @meta)
    `);
    ready = true;

    // flush anything buffered during startup
    const pending = queue.splice(0, queue.length);
    if (pending.length) {
      const tx = db.transaction((rows: LogEntry[]) => {
        for (const r of rows) insertStmt.run(rowFromEntry(r));
      });
      try {
        tx(pending);
      } catch {
        /* ignore */
      }
    }
    realError(
      `[logStore] SQLite log store ready at ${file} (flushed ${pending.length} buffered)`,
    );
  } catch (err) {
    disabled = true;
    realError(
      "[logStore] disabled — could not open SQLite log store:",
      (err as Error)?.message ?? err,
    );
  }
}

export interface LogQuery {
  level?: string;
  category?: string;
  q?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}

/** Query stored logs (newest first). Returns {total, rows}. */
export function queryLogs(opts: LogQuery): { total: number; rows: any[] } {
  if (!ready) return { total: 0, rows: [] };
  try {
    const where: string[] = [];
    const p: Record<string, unknown> = {};
    if (opts.level) {
      where.push("level = @level");
      p.level = opts.level;
    }
    if (opts.category) {
      where.push("category = @category");
      p.category = opts.category;
    }
    if (opts.from) {
      where.push("ts >= @from");
      p.from = opts.from;
    }
    if (opts.to) {
      where.push("ts <= @to");
      p.to = opts.to;
    }
    if (opts.q) {
      where.push(
        "(message LIKE @q OR path LIKE @q OR user_email LIKE @q OR meta LIKE @q OR ip LIKE @q)",
      );
      p.q = `%${opts.q}%`;
    }
    const w = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 1000);
    const offset = Math.max(opts.offset ?? 0, 0);
    const total = (db.prepare(`SELECT COUNT(*) AS c FROM app_log ${w}`).get(p) as any)
      .c as number;
    const rows = db
      .prepare(`SELECT * FROM app_log ${w} ORDER BY id DESC LIMIT ${limit} OFFSET ${offset}`)
      .all(p);
    return { total, rows };
  } catch (err) {
    realError("[logStore] query failed:", (err as Error)?.message ?? err);
    return { total: 0, rows: [] };
  }
}

/** Distinct categories + a few counts, for the viewer's filter UI. */
export function logStats(): { ready: boolean; total: number; categories: any[] } {
  if (!ready) return { ready: false, total: 0, categories: [] };
  try {
    const total = (db.prepare("SELECT COUNT(*) AS c FROM app_log").get() as any).c;
    const categories = db
      .prepare("SELECT category, COUNT(*) AS c FROM app_log GROUP BY category ORDER BY c DESC")
      .all();
    return { ready: true, total, categories };
  } catch {
    return { ready: false, total: 0, categories: [] };
  }
}

/** Delete rows older than `days`. Returns number deleted. */
export function pruneOldLogs(days: number): number {
  if (!ready) return 0;
  try {
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString();
    const info = db.prepare("DELETE FROM app_log WHERE ts < ?").run(cutoff);
    db.pragma("wal_checkpoint(TRUNCATE)");
    return info.changes ?? 0;
  } catch (err) {
    realError("[logStore] prune failed:", (err as Error)?.message ?? err);
    return 0;
  }
}

/**
 * Replace console.log/info/warn/error/debug so everything printed anywhere in
 * the app is also persisted (category = "console"). The original methods are
 * still called, so stdout/`docker logs` keep working unchanged.
 */
export function installConsoleCapture(): void {
  const map: { name: "log" | "info" | "warn" | "error" | "debug"; level: LogLevel }[] = [
    { name: "log", level: "info" },
    { name: "info", level: "info" },
    { name: "warn", level: "warn" },
    { name: "error", level: "error" },
    { name: "debug", level: "debug" },
  ];
  for (const m of map) {
    const orig = (console as any)[m.name].bind(console);
    (console as any)[m.name] = (...args: unknown[]) => {
      orig(...args);
      try {
        const message = args
          .map((a) =>
            typeof a === "string"
              ? a
              : a instanceof Error
                ? `${a.message}\n${a.stack ?? ""}`
                : safeJson(a),
          )
          .join(" ");
        writeLog({ category: "console", level: m.level, message });
      } catch {
        /* never let logging break a console call */
      }
    };
  }
}
