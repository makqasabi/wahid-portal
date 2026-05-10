import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

// Role values as strings (SQLite doesn't support enums)
const Role = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ENTITY_ADMIN: 'ENTITY_ADMIN',
  TEAM_LEAD: 'TEAM_LEAD',
  MEMBER: 'MEMBER',
  OBSERVER: 'OBSERVER',
  EXTERNAL_STAKEHOLDER: 'EXTERNAL_STAKEHOLDER',
} as const;
type Role = (typeof Role)[keyof typeof Role];

const prisma = new PrismaClient();

const DEFAULT_PASSWORD = 'Twnm33n@2026';

function toEmail(fullName: string, domain: string): string {
  const parts = fullName.trim().split(/\s+/);
  const first = parts[0].toLowerCase();
  const last = parts[parts.length - 1].toLowerCase();
  return `${first}.${last}@${domain}`;
}

async function main() {
  const hash = await bcrypt.hash(DEFAULT_PASSWORD, 12);

  // ── Entities ─────────────────────────────────────────────

  const twn = await prisma.entity.upsert({
    where: { name: 'التعاونية' },
    update: {},
    create: {
      name: 'التعاونية',
      fullName: 'التعاونية',
      slaWarningDays: 3,
      slaEscalationDays: 7,
      workWeekDays: '0,1,2,3,4',
    },
  });

  const meena = await prisma.entity.upsert({
    where: { name: 'مينا' },
    update: {},
    create: {
      name: 'مينا',
      fullName: 'مينا',
      slaWarningDays: 3,
      slaEscalationDays: 7,
      workWeekDays: '0,1,2,3,4',
    },
  });

  // ── Teams ────────────────────────────────────────────────

  const twnTeamNames = [
    'علاقات مقدمي الخدمات',
    'المبيعات',
    'إدارة صحة السكان',
    'الطب المهني',
    'الحوكمة الصحية',
    'المطالبات',
    'التسويق',
  ];

  const meenaTeamNames = [
    'العمليات',
    'تطوير الأعمال',
    'إدارة صحة السكان',
    'إدارة دورة الإيرادات',
    'التسويق',
    'الطب المهني والعيادات الداخلية',
  ];

  const teams: Record<string, { id: string; entityId: string }> = {};

  for (const name of twnTeamNames) {
    const team = await prisma.team.upsert({
      where: { name_entityId: { name, entityId: twn.id } },
      update: {},
      create: { name, entityId: twn.id },
    });
    teams[`التعاونية:${name}`] = team;
  }

  for (const name of meenaTeamNames) {
    const team = await prisma.team.upsert({
      where: { name_entityId: { name, entityId: meena.id } },
      update: {},
      create: { name, entityId: meena.id },
    });
    teams[`مينا:${name}`] = team;
  }

  // ── Categories ───────────────────────────────────────────

  const categoryNames = [
    'دعم توسع مينا',
    'تميز خدمات مينا (التكلفة)',
    'تميز خدمات مينا (رضا العملاء)',
    'تميز خدمات مينا (الجودة الطبية)',
    'تميز خدمات مينا (الكفاءة التشغيلية)',
    'تميز عمليات التعاونية (التكلفة)',
    'تميز عمليات التعاونية (رضا العملاء)',
    'تميز عمليات التعاونية (الجودة الطبية)',
    'تميز عمليات التعاونية (الكفاءة التشغيلية)',
  ];

  for (const name of categoryNames) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  // ── Clients ──────────────────────────────────────────────

  const clients: { name: string; aliases?: string[] }[] = [
    { name: 'شركة الاتصالات السعودية (STC)' },
    { name: 'شركة علم (ELM)' },
    { name: 'شركة المياه الوطنية (NWC)' },
    { name: 'الحوكمة والامتثال' },
    { name: 'البنك السعودي الأول (SAB)' },
    { name: 'الشركة السعودية للخدمات الأرضية (SGS)' },
    { name: 'بنك الرياض' },
    { name: 'كأس آسيا' },
    { name: 'الأمير محمد بن فهد' },
    { name: 'جاهز' },
    { name: 'المركز الوطني للتأمين الصحي (NMIC)' },
    { name: 'الخطوط السعودية', aliases: ['Saudi Airlines Clinics Project'] },
    { name: 'الحج والعمرة' },
    { name: 'الهيئة السعودية للمياه (SWA)' },
    { name: 'داخلي' },
    { name: 'أخرى' },
  ];

  for (const c of clients) {
    await prisma.client.upsert({
      where: { name: c.name },
      update: {},
      create: { name: c.name, aliases: JSON.stringify(c.aliases ?? []) },
    });
  }

  // ── Users ────────────────────────────────────────────────

  interface UserSeed {
    fullName: string;
    email: string;
    entity: 'التعاونية' | 'مينا';
    team: string;
    role?: Role;
  }

  const users: UserSeed[] = [
    // التعاونية users (11)
    { fullName: 'عبدالمحسن القصبي', email: 'abdulmohsen.alqasabi@tawuniya.com', entity: 'التعاونية', team: 'علاقات مقدمي الخدمات', role: Role.TEAM_LEAD },
    { fullName: 'سامي فهد العنزي',   email: 'sami.alanazi@tawuniya.com',        entity: 'التعاونية', team: 'المبيعات' },
    { fullName: 'يوسف يونس',        email: 'yousif.younis@tawuniya.com',       entity: 'التعاونية', team: 'إدارة صحة السكان' },
    { fullName: 'أحمد البدري',        email: 'ahmed.elbadry@tawuniya.com',       entity: 'التعاونية', team: 'الطب المهني' },
    { fullName: 'أسامة العبدالقادر',   email: 'osama.abdlkader@tawuniya.com',    entity: 'التعاونية', team: 'الحوكمة الصحية' },
    { fullName: 'أيمن خليل',         email: 'ayman.khalil@tawuniya.com',        entity: 'التعاونية', team: 'علاقات مقدمي الخدمات' },
    { fullName: 'مهنا العنزي',       email: 'mohana.alenezi@tawuniya.com',      entity: 'التعاونية', team: 'إدارة صحة السكان' },
    { fullName: 'محمد البراك',    email: 'mohammed.albarrak@tawuniya.com',   entity: 'التعاونية', team: 'المبيعات' },
    { fullName: 'محمد عصمت',        email: 'mohamed.esmat@tawuniya.com',       entity: 'التعاونية', team: 'المطالبات' },
    { fullName: 'طارق السحن',        email: 'tareq.alsahan@tawuniya.com',       entity: 'التعاونية', team: 'التسويق' },
    { fullName: 'عصام الدين أبوغنيمة', email: 'essameldeen.aboughanema@tawuniya.com', entity: 'التعاونية', team: 'الطب المهني' },

    // مينا users (7)
    { fullName: 'سارة الهريري',       email: 'sara.alhurayri@meena.com',        entity: 'مينا', team: 'العمليات', role: Role.TEAM_LEAD },
    { fullName: 'ساري القحطاني',       email: 'sari.alqahtani@meena.com',        entity: 'مينا', team: 'تطوير الأعمال' },
    { fullName: 'ناصر النهدي',       email: 'nasser.alnahdi@meena.com',        entity: 'مينا', team: 'الطب المهني والعيادات الداخلية' },
    { fullName: 'عبدالعزيز العيسى',   email: 'abdulaziz.eissa@meena.com',       entity: 'مينا', team: 'إدارة صحة السكان' },
    { fullName: 'شهد المديهش',   email: 'shahad.almudaihish@meena.com',     entity: 'مينا', team: 'التسويق' },
    { fullName: 'أحمد الخون',         email: 'ahmed.elkhon@meena.com',           entity: 'مينا', team: 'إدارة دورة الإيرادات' },
    { fullName: 'محمد الرميح',    email: 'mohammad.alrumaih@meena.com',      entity: 'مينا', team: 'العمليات' },
  ];

  for (const u of users) {
    const email = u.email;
    const entityObj = u.entity === 'التعاونية' ? twn : meena;
    const teamObj = teams[`${u.entity}:${u.team}`];

    await prisma.user.upsert({
      where: { email },
      update: { passwordHash: hash, fullName: u.fullName },
      create: {
        fullName: u.fullName,
        email,
        passwordHash: hash,
        entityId: entityObj.id,
        teamId: teamObj.id,
        role: u.role ?? Role.MEMBER,
        mustChangePassword: true,
      },
    });
  }

  // Super Admin
  await prisma.user.upsert({
    where: { email: 'admin@wahid.com' },
    update: { passwordHash: hash },
    create: {
      fullName: 'مدير النظام',
      email: 'admin@wahid.com',
      passwordHash: hash,
      entityId: twn.id,
      teamId: teams['التعاونية:علاقات مقدمي الخدمات'].id,
      role: Role.SUPER_ADMIN,
    },
  });

  console.log('Seed completed successfully.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
