export type Role =
  | 'SUPER_ADMIN'
  | 'ENTITY_ADMIN'
  | 'TEAM_LEAD'
  | 'MEMBER'
  | 'OBSERVER'
  | 'EXTERNAL_STAKEHOLDER';

export type Progress =
  | 'IN_PROGRESS'
  | 'DELAYED'
  | 'COMPLETED'
  | 'ON_HOLD'
  | 'DEPENDENT';

export type Priority = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

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
