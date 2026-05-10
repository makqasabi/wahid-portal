import { create } from 'zustand';

interface FilterState {
  entityId: string;
  teamId: string;
  clientId: string;
  categoryId: string;
  progress: string[];
  priority: string[];
  ownerId: string;
  submittedById: string;
  dueDateFrom: string;
  dueDateTo: string;
  search: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: 'asc' | 'desc';
  setFilter: (key: string, value: unknown) => void;
  clearFilters: () => void;
  setPage: (n: number) => void;
  toQueryString: () => Record<string, unknown>;
}

const initialFilters = {
  entityId: '',
  teamId: '',
  clientId: '',
  categoryId: '',
  progress: [] as string[],
  priority: [] as string[],
  ownerId: '',
  submittedById: '',
  dueDateFrom: '',
  dueDateTo: '',
  search: '',
  page: 1,
  limit: 20,
  sortBy: 'createdAt',
  sortOrder: 'desc' as const,
};

export const useFilterStore = create<FilterState>((set, get) => ({
  ...initialFilters,

  setFilter: (key: string, value: unknown) => {
    set({ [key]: value, page: key === 'page' ? (value as number) : 1 });
  },

  clearFilters: () => {
    set({ ...initialFilters });
  },

  setPage: (n: number) => {
    set({ page: n });
  },

  toQueryString: () => {
    const state = get();
    const params: Record<string, unknown> = {};

    if (state.entityId) params.entityId = state.entityId;
    if (state.teamId) params.teamId = state.teamId;
    if (state.clientId) params.clientId = state.clientId;
    if (state.categoryId) params.categoryId = state.categoryId;
    if (state.progress.length > 0) params.progress = state.progress.join(',');
    if (state.priority.length > 0) params.priority = state.priority.join(',');
    if (state.ownerId) params.ownerId = state.ownerId;
    if (state.submittedById) params.submittedById = state.submittedById;
    if (state.dueDateFrom) params.dueDateFrom = state.dueDateFrom;
    if (state.dueDateTo) params.dueDateTo = state.dueDateTo;
    if (state.search) params.search = state.search;
    params.page = state.page;
    params.limit = state.limit;
    params.sortBy = state.sortBy;
    params.sortOrder = state.sortOrder;

    return params;
  },
}));
