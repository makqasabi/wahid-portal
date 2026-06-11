export type Role =
  | 'SUPER_ADMIN'
  | 'ENTITY_ADMIN'
  | 'TEAM_LEAD'
  | 'MEMBER'
  | 'OBSERVER'
  | 'EXTERNAL_STAKEHOLDER';

// Statuses/priorities are admin-defined (dynamic workflow) — any key is valid.
// The historical seed keys (IN_PROGRESS, COMPLETED, …) still exist by default.
export type Progress = string;

export type Priority = string;

export interface WorkflowStatus {
  key: string;
  name: string;
  nameEn?: string | null;
  color: string;
  isDefault: boolean;
  isClosed: boolean;
  pausesSla: boolean;
  isOverdueFlag: boolean;
  transitionsTo: string[];
}

export interface WorkflowPriority {
  key: string;
  name: string;
  nameEn?: string | null;
  color: string;
  isDefault: boolean;
}

export interface CategoryFieldDef {
  id: string;
  key: string;
  label: string;
  labelEn?: string | null;
  type: 'text' | 'textarea' | 'number' | 'date' | 'select';
  options: string[];
  required: boolean;
  sortOrder?: number;
  isActive?: boolean;
  valueCount?: number;
}

export interface TicketFieldValue {
  id: string;
  fieldId: string;
  value: string;
  field: CategoryFieldDef;
}

export interface BrandingSettings {
  portalNameEn: string;
  portalNameAr: string;
  fullNameEn: string;
  fullNameAr: string;
  taglineEn: string;
  taglineAr: string;
  logoUrl: string;
  primaryColor: string;
  emailSignature: string;
  emailButtonColor: string;
}

export interface AppSettings {
  branding: BrandingSettings;
  sla: { defaultWarningDays: number; checkerCron: string };
  reports: { weeklyEnabled: boolean; weeklyCron: string; weeklyRecipients: string[] };
  toggles: { whatsapp: boolean | null; imap: boolean | null; oidc: boolean | null };
  templates: Record<string, { subject: string; body: string }>;
}

export interface AdminWorkflowStatus extends WorkflowStatus {
  id: string;
  sortOrder: number;
  isActive: boolean;
  ticketCount: number;
}

export interface AdminWorkflowPriority extends WorkflowPriority {
  id: string;
  sortOrder: number;
  isActive: boolean;
  ticketCount: number;
}

export type NotificationType =
  | 'ASSIGNED'
  | 'STATUS_CHANGED'
  | 'SLA_WARNING'
  | 'SLA_OVERDUE'
  | 'COMMENT_ADDED'
  | 'ESCALATION';

export interface Entity {
  id: string;
  name: string;
  nameEn?: string | null;
  fullName: string;
  logoUrl?: string;
  slaWarningDays: number;
  slaEscalationDays: number;
  escalationContactId?: string | null;
  escalationContact?: { id: string; fullName: string; email: string } | null;
}

export interface Team {
  id: string;
  name: string;
  nameEn?: string | null;
  entityId: string;
  entity?: Entity;
}

export interface User {
  id: string;
  fullName: string;
  fullNameEn?: string | null;
  phone?: string | null;
  email: string;
  entityId: string;
  teamId: string;
  role: Role;
  isActive: boolean;
  mfaEnabled?: boolean;
  mustChangePassword?: boolean;
  entity?: Entity;
  team?: Team;
}

export interface Client {
  id: string;
  name: string;
  nameEn?: string | null;
  aliases: string[];
  isActive: boolean;
}

export interface Category {
  id: string;
  name: string;
  nameEn?: string | null;
  isActive: boolean;
}

export interface Ticket {
  id: string;
  displayId: string;
  submittingTeamId: string;
  submittingEntityId: string;
  categoryId: string;
  clientId: string;
  submittedById: string;
  actionItem: string;
  ownerId: string;
  supportId?: string;
  dueDate?: string;
  closureDate?: string;
  slaVarianceDays?: number;
  ownerEntityId: string;
  progress: Progress;
  ownerTeamId: string;
  priority: Priority;
  createdAt: string;
  updatedAt: string;
  submittingTeam?: Team;
  category?: Category;
  client?: Client;
  submittedBy?: User;
  owner?: User;
  support?: User;
  ownerEntity?: Entity;
  ownerTeam?: Team;
  comments?: Comment[];
  attachments?: Attachment[];
  auditLogs?: AuditLog[];
  fieldValues?: TicketFieldValue[];
  customFields?: Record<string, string>;
}

export interface Comment {
  id: string;
  ticketId: string;
  authorId: string;
  body: string;
  isInternal: boolean;
  authorEntityId: string;
  createdAt: string;
  author?: User;
}

export interface Attachment {
  id: string;
  ticketId: string;
  uploaderId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  ticketId: string;
  userId: string;
  action: string;
  fieldName?: string;
  oldValue?: string;
  newValue?: string;
  createdAt: string;
  user?: User;
}

export interface Notification {
  id: string;
  userId: string;
  ticketId: string;
  type: NotificationType;
  message: string;
  isRead: boolean;
  sentEmail: boolean;
  createdAt: string;
  ticket?: Ticket;
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface SystemLog {
  id: number;
  ts: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  category: string;
  message: string | null;
  method: string | null;
  path: string | null;
  status: number | null;
  duration_ms: number | null;
  user_id: string | null;
  user_email: string | null;
  ip: string | null;
  user_agent: string | null;
  meta: string | null;
}

export interface SystemLogResponse {
  data: SystemLog[];
  stats: {
    ready: boolean;
    total: number;
    categories: { category: string; c: number }[];
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface DashboardStats {
  totalOpen: number;
  overdue: number;
  completedThisMonth: number;
  avgSlaVariance: number;
  onTimeRate: number;
  onHoldDependent: number;
}

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
