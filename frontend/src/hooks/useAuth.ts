import { useCallback, useMemo } from 'react';
import { useAuthStore } from '@/stores/authStore';
import type { Role } from '@/types';

const ROLE_HIERARCHY: Role[] = [
  'EXTERNAL_STAKEHOLDER',
  'OBSERVER',
  'MEMBER',
  'TEAM_LEAD',
  'ENTITY_ADMIN',
  'SUPER_ADMIN',
];

export function useAuth() {
  const { user, isAuthenticated, login, logout } = useAuthStore();

  const hasRole = useCallback(
    (role: Role): boolean => user?.role === role,
    [user?.role],
  );

  const hasMinRole = useCallback(
    (minRole: Role): boolean => {
      if (!user) return false;
      const userLevel = ROLE_HIERARCHY.indexOf(user.role);
      const minLevel = ROLE_HIERARCHY.indexOf(minRole);
      return userLevel >= minLevel;
    },
    [user],
  );

  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const isEntityAdmin = user?.role === 'ENTITY_ADMIN' || isSuperAdmin;

  return useMemo(
    () => ({
      user,
      isAuthenticated,
      login,
      logout,
      hasRole,
      hasMinRole,
      isEntityAdmin,
      isSuperAdmin,
    }),
    [user, isAuthenticated, login, logout, hasRole, hasMinRole, isEntityAdmin, isSuperAdmin],
  );
}
