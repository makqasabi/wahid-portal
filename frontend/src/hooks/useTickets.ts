import { useState, useEffect, useCallback } from 'react';
import { ticketsApi } from '@/api/client';
import { useFilterStore } from '@/stores/filterStore';
import type { Ticket } from '@/types';

interface Pagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

export function useTickets() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const filters = useFilterStore((s) => s.toQueryString);
  const page = useFilterStore((s) => s.page);
  const limit = useFilterStore((s) => s.limit);
  const sortBy = useFilterStore((s) => s.sortBy);
  const sortOrder = useFilterStore((s) => s.sortOrder);
  const search = useFilterStore((s) => s.search);
  const entityId = useFilterStore((s) => s.entityId);
  const teamId = useFilterStore((s) => s.teamId);
  const clientId = useFilterStore((s) => s.clientId);
  const categoryId = useFilterStore((s) => s.categoryId);
  const progress = useFilterStore((s) => s.progress);
  const priority = useFilterStore((s) => s.priority);
  const ownerId = useFilterStore((s) => s.ownerId);
  const submittedById = useFilterStore((s) => s.submittedById);
  const dueDateFrom = useFilterStore((s) => s.dueDateFrom);
  const dueDateTo = useFilterStore((s) => s.dueDateTo);

  const fetchTickets = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const queryParams = filters();
      const response = await ticketsApi.list(queryParams);
      setTickets(response.data);
      setPagination(response.pagination);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tickets');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchTickets();
  }, [page, limit, sortBy, sortOrder, search, entityId, teamId, clientId, categoryId, progress, priority, ownerId, submittedById, dueDateFrom, dueDateTo, fetchTickets]);

  const createTicket = useCallback(async (data: Partial<Ticket>) => {
    const ticket = await ticketsApi.create(data);
    await fetchTickets();
    return ticket;
  }, [fetchTickets]);

  const updateTicket = useCallback(async (id: string, data: Partial<Ticket>) => {
    const ticket = await ticketsApi.update(id, data);
    await fetchTickets();
    return ticket;
  }, [fetchTickets]);

  return {
    tickets,
    loading,
    error,
    pagination,
    fetchTickets,
    createTicket,
    updateTicket,
  };
}
