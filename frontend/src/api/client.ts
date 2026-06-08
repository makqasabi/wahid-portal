import axios from 'axios';
import type {
  LoginResponse,
  User,
  Ticket,
  Comment,
  Notification,
  DashboardStats,
  PaginatedResponse,
  AuditLog,
  Client,
  Category,
  Team,
  Entity,
} from '@/types';

const api = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true, // send httpOnly refresh cookie
});

// In-memory token accessor — set by authStore, read by interceptor
let getAccessToken: () => string | null = () => null;
let setAccessToken: (token: string | null) => void = () => {};

export function bindTokenAccessors(
  getter: () => string | null,
  setter: (token: string | null) => void,
) {
  getAccessToken = getter;
  setAccessToken = setter;
}

// Request interceptor: attach Bearer token from memory
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor: handle 401 with cookie-based refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        // Refresh via httpOnly cookie — no token in the body needed
        const { data } = await axios.post('/api/auth/refresh', {}, { withCredentials: true });
        setAccessToken(data.accessToken);

        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest);
      } catch {
        setAccessToken(null);
        window.location.href = '/login';
        return Promise.reject(error);
      }
    }

    return Promise.reject(error);
  },
);

// --- Auth ---
export const authApi = {
  login: (email: string, password: string, totpCode?: string) =>
    api.post<LoginResponse>('/auth/login', { email, password, totpCode }).then((r) => r.data),

  refresh: () =>
    api
      .post<{ accessToken: string; refreshToken: string }>('/auth/refresh', {})
      .then((r) => r.data),

  logout: () => api.post('/auth/logout').then((r) => r.data),

  changePassword: (oldPassword: string, newPassword: string) =>
    api.post('/auth/change-password', { oldPassword, newPassword }).then((r) => r.data),

  forgotPassword: (email: string) =>
    api.post('/auth/forgot-password', { email }).then((r) => r.data),

  resetPassword: (token: string, newPassword: string) =>
    api.post('/auth/reset-password', { token, newPassword }).then((r) => r.data),

  setup2FA: () =>
    api.post<{ secret: string; otpauthUrl: string }>('/auth/2fa/setup', {}).then((r) => r.data),

  verify2FA: (code: string) =>
    api.post('/auth/2fa/verify', { code }).then((r) => r.data),

  disable2FA: (password: string) =>
    api.post('/auth/2fa/disable', { password }).then((r) => r.data),

  // --- Microsoft / OIDC single sign-on ---
  ssoEnabled: () =>
    api.get<{ enabled: boolean }>('/auth/oidc/enabled').then((r) => r.data.enabled).catch(() => false),

  ssoExchange: (ticket: string) =>
    api.post<LoginResponse>('/auth/oidc/exchange', { ticket }).then((r) => r.data),
};

/** Absolute URL that kicks off the server-side OIDC redirect flow. */
export const ssoLoginUrl = '/api/auth/oidc/login';

// --- Tickets ---
export const ticketsApi = {
  list: (filters?: Record<string, unknown>) =>
    api.get<PaginatedResponse<Ticket>>('/tickets', { params: filters }).then((r) => r.data),

  getById: (id: string) =>
    api.get<Ticket>(`/tickets/${id}`).then((r) => r.data),

  create: (data: Partial<Ticket>) =>
    api.post<Ticket>('/tickets', data).then((r) => r.data),

  update: (id: string, data: Partial<Ticket>) =>
    api.patch<Ticket>(`/tickets/${id}`, data).then((r) => r.data),

  delete: (id: string) =>
    api.delete(`/tickets/${id}`).then((r) => r.data),
};

// --- Comments ---
export const commentsApi = {
  listByTicket: (ticketId: string) =>
    api.get(`/comments/ticket/${ticketId}`).then((r) => r.data.data ?? r.data) as Promise<Comment[]>,

  create: (ticketId: string, body: string, isInternal: boolean) =>
    api
      .post<Comment>(`/comments/ticket/${ticketId}`, { body, isInternal })
      .then((r) => r.data),
};

// --- Dashboard ---
export const dashboardApi = {
  getStats: (entityId?: string) =>
    api.get<DashboardStats>('/dashboard/stats', { params: entityId ? { entityId } : {} }).then((r) => r.data),

  getEntitySplit: (entityId?: string) =>
    api.get('/dashboard/entity-split', { params: entityId ? { entityId } : {} }).then((r) => r.data.data ?? r.data),

  getSlaTrend: (entityId?: string) =>
    api.get('/dashboard/sla-trend', { params: entityId ? { entityId } : {} }).then((r) => r.data.data ?? r.data),

  getCategoryBreakdown: (entityId?: string) =>
    api.get('/dashboard/category-breakdown', { params: entityId ? { entityId } : {} }).then((r) => r.data.data ?? r.data),

  getTeamAccountability: (entityId?: string) =>
    api.get('/dashboard/team-accountability', { params: entityId ? { entityId } : {} }).then((r) => r.data.data ?? r.data),

  getAging: (entityId?: string) =>
    api.get('/dashboard/aging', { params: entityId ? { entityId } : {} }).then((r) => r.data.data ?? r.data),
};

// --- Users ---
export const usersApi = {
  list: (search?: string) =>
    api.get<PaginatedResponse<User>>('/users', { params: { search } }).then((r) => r.data),

  getById: (id: string) =>
    api.get<User>(`/users/${id}`).then((r) => r.data),

  invite: (data: Partial<User> & { password?: string }) =>
    api.post<User>('/users/invite', data).then((r) => r.data),

  update: (id: string, data: Partial<User>) =>
    api.patch<User>(`/users/${id}`, data).then((r) => r.data),

  deactivate: (id: string, transferToId?: string) =>
    api.post(`/users/${id}/deactivate`, transferToId ? { transferToId } : {}).then((r) => r.data),

  pendingCount: (id: string) =>
    api.get<{ ownedPending: number; supportPending: number }>(`/users/${id}/pending-count`).then((r) => r.data),
};

// --- Admin ---
export const adminApi = {
  getAuditLogs: (filters?: Record<string, unknown>) =>
    api.get<PaginatedResponse<AuditLog>>('/admin/audit-logs', { params: filters }).then((r) => r.data),

  getClients: () =>
    api.get('/admin/clients').then((r) => r.data.data ?? r.data) as Promise<Client[]>,

  getCategories: () =>
    api.get('/admin/categories').then((r) => r.data.data ?? r.data) as Promise<Category[]>,

  getTeams: () =>
    api.get('/admin/teams').then((r) => r.data.data ?? r.data) as Promise<Team[]>,

  getEntities: () =>
    api.get('/admin/entities').then((r) => r.data.data ?? r.data) as Promise<Entity[]>,

  updateEntity: (id: string, data: { escalationContactId?: string | null; slaWarningDays?: number; slaEscalationDays?: number }) =>
    api.patch<Entity>(`/admin/entities/${id}`, data).then((r) => r.data),

  createClient: (name: string) =>
    api.post<Client>('/admin/clients', { name }).then((r) => r.data),

  updateClient: (id: string, data: Partial<Client>) =>
    api.patch<Client>(`/admin/clients/${id}`, data).then((r) => r.data),

  deleteClient: (id: string) =>
    api.delete(`/admin/clients/${id}`).then((r) => r.data),

  createCategory: (name: string) =>
    api.post<Category>('/admin/categories', { name }).then((r) => r.data),

  updateCategory: (id: string, data: Partial<Category>) =>
    api.patch<Category>(`/admin/categories/${id}`, data).then((r) => r.data),

  deleteCategory: (id: string) =>
    api.delete(`/admin/categories/${id}`).then((r) => r.data),
};

// --- Reference Data (any authenticated user) ---
export const referenceApi = {
  getClients: () =>
    api.get('/reference/clients').then((r) => r.data.data ?? r.data) as Promise<Client[]>,

  getCategories: () =>
    api.get('/reference/categories').then((r) => r.data.data ?? r.data) as Promise<Category[]>,

  getTeams: () =>
    api.get('/reference/teams').then((r) => r.data.data ?? r.data) as Promise<Team[]>,

  getEntities: () =>
    api.get('/reference/entities').then((r) => r.data.data ?? r.data) as Promise<Entity[]>,

  getUsers: () =>
    api.get('/reference/users').then((r) => r.data.data ?? r.data) as Promise<User[]>,
};

// --- Notifications ---
export const notificationsApi = {
  getUnread: () =>
    api.get<Notification[]>('/notifications/unread').then((r) => r.data),

  markRead: (id: string) =>
    api.patch(`/notifications/${id}/read`).then((r) => r.data),

  markAllRead: () =>
    api.patch('/notifications/read-all').then((r) => r.data),
};

// --- Export ---
export const exportApi = {
  ticketsExcel: (filters?: Record<string, unknown>) =>
    api
      .get('/export/tickets/excel', { params: filters, responseType: 'blob' })
      .then((r) => r.data),

  ticketPdf: (id: string) =>
    api.get(`/export/tickets/${id}/pdf`, { responseType: 'blob' }).then((r) => r.data),

  createShareLink: (data: { ticketId: string; expiresInHours?: number }) =>
    api.post<{ url: string }>('/export/share-link', data).then((r) => r.data),
};

// --- Attachments ---
export const attachmentsApi = {
  upload: (ticketId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api
      .post(`/attachments/ticket/${ticketId}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data);
  },

  download: (id: string) =>
    api.get(`/attachments/${id}/download`, { responseType: 'blob' }).then((r) => r.data),

  remove: (id: string) =>
    api.delete(`/attachments/${id}`).then((r) => r.data),
};

export default api;
