// ─────────────────────────────────────────────────────────────
// Wahid Portal — Excel Import Script
// Imports the 79 action items from the original Excel tracker.
// Run from backend/:  npx tsx ../scripts/import-excel.ts
// ─────────────────────────────────────────────────────────────

import { PrismaClient } from '@prisma/client';
import ExcelJS from 'exceljs';
import path from 'path';

const prisma = new PrismaClient();

// ── Configuration ───────────────────────────────────────────

const EXCEL_PATH = path.resolve(
  'C:/Users/AQ10012430/Desktop/Abdulmohsen/Provider Relations/Meena/Meena Integration Project/TWN Meena Action Items07.06.xlsx',
);
const SHEET_NAME = 'Action items';
const FIRST_DATA_ROW = 2;
const LAST_DATA_ROW = 80;
const DISPLAY_ID_PREFIX = 'TWN-MEENA-';

// ── Progress mapping ────────────────────────────────────────

const PROGRESS_MAP: Record<string, string> = {
  'Completed': 'COMPLETED',
  'In Progress': 'IN_PROGRESS',
  'Delayed': 'DELAYED',
  'On-hold': 'ON_HOLD',
  'Dependent': 'DEPENDENT',
};

// ── Helpers ─────────────────────────────────────────────────

function cellText(cell: ExcelJS.Cell): string | null {
  if (cell.value === null || cell.value === undefined) return null;
  // Formula objects — use the cached result
  if (typeof cell.value === 'object' && 'formula' in (cell.value as any)) {
    const result = (cell.value as any).result;
    if (result === null || result === undefined) return null;
    const str = String(result).trim();
    return str.length === 0 ? null : str;
  }
  // Rich text objects
  if (typeof cell.value === 'object' && 'richText' in (cell.value as any)) {
    return ((cell.value as any).richText as { text: string }[])
      .map((r) => r.text)
      .join('')
      .trim() || null;
  }
  const str = String(cell.value).trim();
  return str.length === 0 ? null : str;
}

function cellDate(cell: ExcelJS.Cell): Date | string | null {
  if (cell.value === null || cell.value === undefined) return null;
  // Formula objects — use the cached result
  if (typeof cell.value === 'object' && 'formula' in (cell.value as any)) {
    const result = (cell.value as any).result;
    if (result === null || result === undefined) return null;
    if (result instanceof Date) return result;
    const str = String(result).trim();
    if (str.length === 0) return null;
    return str;
  }
  if (cell.value instanceof Date) return cell.value;
  const str = String(cell.value).trim();
  if (str.length === 0) return null;
  return str;
}

function parseDateString(val: string): Date | null {
  // DD-MM-YYYY
  const m = val.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    const [, day, month, year] = m;
    return new Date(Number(year), Number(month) - 1, Number(day));
  }
  return null;
}

function daysDiff(a: Date, b: Date): number {
  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((b.getTime() - a.getTime()) / msPerDay);
}

function zeroPad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

// ── Lookup caches (populated once before import) ────────────

interface LookupCache {
  entities: Map<string, { id: string; name: string }>;
  teams: Map<string, { id: string; name: string; entityId: string }>;
  users: Map<string, { id: string; fullName: string; teamId: string; entityId: string }>;
  clients: Map<string, { id: string; name: string }>;
  clientAliases: Map<string, string>; // alias → client name
  categories: Map<string, { id: string; name: string }>;
}

async function buildLookupCache(): Promise<LookupCache> {
  const entities = new Map<string, { id: string; name: string }>();
  for (const e of await prisma.entity.findMany()) {
    entities.set(e.name, { id: e.id, name: e.name });
  }

  const teams = new Map<string, { id: string; name: string; entityId: string }>();
  for (const t of await prisma.team.findMany()) {
    teams.set(`${entityName(entities, t.entityId)}:${t.name}`, {
      id: t.id,
      name: t.name,
      entityId: t.entityId,
    });
    // Also allow lookup by just team name (may collide across entities — but
    // the Owner Team column in the Excel is unambiguous when combined with
    // Owner Entity).
  }

  const users = new Map<string, { id: string; fullName: string; teamId: string; entityId: string }>();
  for (const u of await prisma.user.findMany()) {
    users.set(u.fullName, {
      id: u.id,
      fullName: u.fullName,
      teamId: u.teamId,
      entityId: u.entityId,
    });
  }

  const clients = new Map<string, { id: string; name: string }>();
  const clientAliases = new Map<string, string>();
  for (const c of await prisma.client.findMany()) {
    clients.set(c.name, { id: c.id, name: c.name });
    const aliases: string[] = typeof c.aliases === 'string' ? JSON.parse(c.aliases) : (c.aliases as string[]);
    for (const alias of aliases) {
      clientAliases.set(alias, c.name);
    }
  }

  const categories = new Map<string, { id: string; name: string }>();
  for (const cat of await prisma.category.findMany()) {
    categories.set(cat.name, { id: cat.id, name: cat.name });
  }

  return { entities, teams, users, clients, clientAliases, categories };
}

function entityName(
  entities: Map<string, { id: string; name: string }>,
  entityId: string,
): string {
  for (const [name, e] of entities) {
    if (e.id === entityId) return name;
  }
  return 'UNKNOWN';
}

// ── Resolve helpers ─────────────────────────────────────────

function resolveTeamByNameAndEntity(
  cache: LookupCache,
  teamName: string,
  entityName: string,
): { id: string; name: string; entityId: string } | null {
  return cache.teams.get(`${entityName}:${teamName}`) ?? null;
}

function resolveClient(cache: LookupCache, raw: string): { id: string; name: string } | null {
  const trimmed = raw.trim();
  // Direct match
  if (cache.clients.has(trimmed)) return cache.clients.get(trimmed)!;
  // Alias match
  const aliasTarget = cache.clientAliases.get(trimmed);
  if (aliasTarget && cache.clients.has(aliasTarget)) return cache.clients.get(aliasTarget)!;
  // Case-insensitive fallback
  for (const [name, client] of cache.clients) {
    if (name.toLowerCase() === trimmed.toLowerCase()) return client;
  }
  return null;
}

function resolveCategory(cache: LookupCache, raw: string): { id: string; name: string } | null {
  // Fix known typo
  const corrected = raw.replace(/Efficency/g, 'Efficiency');
  if (cache.categories.has(corrected)) return cache.categories.get(corrected)!;
  // Case-insensitive fallback
  for (const [name, cat] of cache.categories) {
    if (name.toLowerCase() === corrected.toLowerCase()) return cat;
  }
  return null;
}

// ── Main import ─────────────────────────────────────────────

async function main() {
  console.log('Loading lookup caches from database...');
  const cache = await buildLookupCache();

  console.log(`  Entities:   ${cache.entities.size}`);
  console.log(`  Teams:      ${cache.teams.size}`);
  console.log(`  Users:      ${cache.users.size}`);
  console.log(`  Clients:    ${cache.clients.size}`);
  console.log(`  Categories: ${cache.categories.size}`);

  // ── Idempotency check ───────────────────────────────────
  const existingTickets = await prisma.ticket.findMany({
    where: { displayId: { startsWith: DISPLAY_ID_PREFIX } },
    select: { displayId: true },
  });
  const existingIds = new Set(existingTickets.map((t) => t.displayId));

  if (existingIds.size > 0) {
    console.log(`\nFound ${existingIds.size} existing tickets with prefix "${DISPLAY_ID_PREFIX}".`);
    console.log('Rows with matching displayIds will be skipped.\n');
  }

  // ── Read Excel ──────────────────────────────────────────
  console.log(`Reading Excel file: ${EXCEL_PATH}`);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(EXCEL_PATH);

  const sheet = workbook.getWorksheet(SHEET_NAME);
  if (!sheet) {
    throw new Error(`Sheet "${SHEET_NAME}" not found in workbook.`);
  }

  // ── Import counters ─────────────────────────────────────
  let totalRows = 0;
  let imported = 0;
  let skipped = 0;
  const warnings: string[] = [];
  const errors: string[] = [];
  const slaIssues: string[] = [];

  for (let rowNum = FIRST_DATA_ROW; rowNum <= LAST_DATA_ROW; rowNum++) {
    totalRows++;
    const seqNum = rowNum - FIRST_DATA_ROW + 1; // 1-based sequence
    const displayId = `${DISPLAY_ID_PREFIX}${zeroPad(seqNum, 4)}`;

    try {
      // Skip if already imported
      if (existingIds.has(displayId)) {
        skipped++;
        warnings.push(`Row ${rowNum}: ${displayId} already exists — skipped.`);
        continue;
      }

      const row = sheet.getRow(rowNum);

      // ── Extract raw values ────────────────────────────
      const rawSubmittingTeam = cellText(row.getCell(1));
      const rawCategory       = cellText(row.getCell(2));
      const rawClient         = cellText(row.getCell(3));
      const rawSubmittedBy    = cellText(row.getCell(4));
      const rawActionItem     = cellText(row.getCell(5));
      const rawOwner          = cellText(row.getCell(6));
      const rawSupport        = cellText(row.getCell(7));
      const rawDueDate        = cellDate(row.getCell(8));
      const rawClosureDate    = cellDate(row.getCell(9));
      const rawSlaCell        = row.getCell(10).value;
      const rawSla            = (typeof rawSlaCell === 'object' && rawSlaCell !== null && 'formula' in (rawSlaCell as any)) ? (rawSlaCell as any).result : rawSlaCell;
      const rawOwnerEntity    = cellText(row.getCell(11));
      const rawProgress       = cellText(row.getCell(12));
      const rawOwnerTeam      = cellText(row.getCell(13));

      // ── Validate required fields ──────────────────────
      if (!rawCategory) throw new Error('Missing Category');
      if (!rawClient) throw new Error('Missing Client');
      if (!rawSubmittedBy) throw new Error('Missing Submitted By');
      if (!rawActionItem) throw new Error('Missing Action Item');
      if (!rawOwner) throw new Error('Missing Owner');
      if (!rawOwnerEntity) throw new Error('Missing Owner Entity');
      if (!rawProgress) throw new Error('Missing Progress');
      if (!rawOwnerTeam) throw new Error('Missing Owner Team');

      // ── Resolve references ────────────────────────────

      // Submitted By
      const submittedByUser = cache.users.get(rawSubmittedBy);
      if (!submittedByUser) throw new Error(`User not found for Submitted By: "${rawSubmittedBy}"`);

      // Submitting Team
      let submittingTeamId: string;
      let submittingEntityId: string;

      if (!rawSubmittingTeam || rawSubmittingTeam === '#N/A' || rawSubmittingTeam === '[object Object]') {
        // Infer from submitter's team
        submittingTeamId = submittedByUser.teamId;
        submittingEntityId = submittedByUser.entityId;
        warnings.push(`Row ${rowNum}: Submitting Team was "${rawSubmittingTeam}" — inferred from "${rawSubmittedBy}".`);
      } else {
        // Excel uses compound names like "TWN Provider Relations" or "Meena Operations"
        // Try to split by known entity prefix
        let found = false;
        for (const [entityNameKey, entity] of cache.entities) {
          // Check if the team name starts with entity prefix (e.g. "TWN " or "Meena ")
          if (rawSubmittingTeam.startsWith(entityNameKey + ' ')) {
            const teamName = rawSubmittingTeam.substring(entityNameKey.length + 1);
            const team = resolveTeamByNameAndEntity(cache, teamName, entityNameKey);
            if (team) {
              submittingTeamId = team.id;
              submittingEntityId = team.entityId;
              found = true;
              break;
            }
          }
          // Also try direct match
          const team = resolveTeamByNameAndEntity(cache, rawSubmittingTeam, entityNameKey);
          if (team) {
            submittingTeamId = team.id;
            submittingEntityId = team.entityId;
            found = true;
            break;
          }
        }
        if (!found) throw new Error(`Submitting Team not found: "${rawSubmittingTeam}"`);
      }

      // Category
      const category = resolveCategory(cache, rawCategory);
      if (!category) throw new Error(`Category not found: "${rawCategory}"`);

      // Client
      const client = resolveClient(cache, rawClient);
      if (!client) throw new Error(`Client not found: "${rawClient}"`);

      // Owner
      const ownerUser = cache.users.get(rawOwner);
      if (!ownerUser) throw new Error(`User not found for Owner: "${rawOwner}"`);

      // Support (optional)
      let supportId: string | null = null;
      if (rawSupport) {
        const supportUser = cache.users.get(rawSupport);
        if (!supportUser) {
          warnings.push(`Row ${rowNum}: Support user not found: "${rawSupport}" — setting to null.`);
        } else {
          supportId = supportUser.id;
        }
      }

      // Owner Entity
      const ownerEntity = cache.entities.get(rawOwnerEntity);
      if (!ownerEntity) throw new Error(`Owner Entity not found: "${rawOwnerEntity}"`);

      // Owner Team (resolve under the owner entity)
      // Excel uses compound names like "TWN Provider Relations" — strip entity prefix
      let ownerTeamName = rawOwnerTeam;
      if (rawOwnerTeam.startsWith(rawOwnerEntity + ' ')) {
        ownerTeamName = rawOwnerTeam.substring(rawOwnerEntity.length + 1);
      }
      const ownerTeam = resolveTeamByNameAndEntity(cache, ownerTeamName, rawOwnerEntity);
      if (!ownerTeam) throw new Error(`Owner Team not found: "${rawOwnerTeam}" (tried "${ownerTeamName}") under entity "${rawOwnerEntity}"`);

      // Progress
      const progress = PROGRESS_MAP[rawProgress];
      if (!progress) throw new Error(`Unknown Progress value: "${rawProgress}"`);

      // Due Date
      let dueDate: Date | null = null;
      if (rawDueDate instanceof Date) {
        dueDate = rawDueDate;
      } else if (typeof rawDueDate === 'string') {
        const lower = rawDueDate.toLowerCase();
        if (lower === 'on-hold' || lower === 'dependent') {
          dueDate = null;
        } else {
          dueDate = parseDateString(rawDueDate);
          if (!dueDate) {
            warnings.push(`Row ${rowNum}: Could not parse due date "${rawDueDate}" — setting to null.`);
          }
        }
      }

      // Closure Date
      let closureDate: Date | null = null;
      if (rawClosureDate instanceof Date) {
        closureDate = rawClosureDate;
      }

      // SLA Variance Days
      let slaVarianceDays: number | null = null;
      if (rawSla !== null && rawSla !== undefined && typeof rawSla === 'number') {
        slaVarianceDays = Math.round(rawSla);
      } else if (rawSla !== null && rawSla !== undefined) {
        const parsed = Number(rawSla);
        if (!isNaN(parsed)) {
          slaVarianceDays = Math.round(parsed);
        }
      }

      // ── SLA Verification ──────────────────────────────
      if (progress === 'COMPLETED' && dueDate && closureDate && slaVarianceDays !== null) {
        const calculatedDays = daysDiff(dueDate, closureDate);
        if (Math.abs(calculatedDays - slaVarianceDays) > 1) {
          slaIssues.push(
            `Row ${rowNum}: Excel says ${slaVarianceDays} days, calculated ${calculatedDays} days (mismatch)`,
          );
        }
      }

      // ── Create ticket ─────────────────────────────────
      await prisma.ticket.create({
        data: {
          displayId,
          submittingTeamId: submittingTeamId!,
          submittingEntityId: submittingEntityId!,
          categoryId: category.id,
          clientId: client.id,
          submittedById: submittedByUser.id,
          actionItem: rawActionItem,
          ownerId: ownerUser.id,
          supportId,
          dueDate,
          closureDate,
          slaVarianceDays,
          ownerEntityId: ownerEntity.id,
          progress,
          ownerTeamId: ownerTeam.id,
          priority: 'MEDIUM',
        },
      });

      imported++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`Row ${rowNum}: ${message}`);
    }
  }

  // ── Import Report ───────────────────────────────────────

  console.log('\n==========================================');
  console.log('IMPORT REPORT — TWN Meena Action Items');
  console.log('==========================================');
  console.log(`Total rows processed: ${totalRows}`);
  console.log(`Successfully imported: ${imported}`);
  console.log(`Skipped (already exist): ${skipped}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Errors: ${errors.length}`);

  if (warnings.length > 0) {
    console.log('\nWARNINGS:');
    for (const w of warnings) {
      console.log(`  - ${w}`);
    }
  }

  if (errors.length > 0) {
    console.log('\nERRORS:');
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
  }

  if (slaIssues.length > 0) {
    console.log('\nSLA VERIFICATION:');
    for (const s of slaIssues) {
      console.log(`  - ${s}`);
    }
  }

  console.log('==========================================\n');

  if (errors.length > 0) {
    process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error('Fatal error:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
