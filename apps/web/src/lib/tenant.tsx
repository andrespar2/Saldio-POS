import { createContext, useContext, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from './auth';

export interface TenantAccess {
  store: {
    id: string;
    name: string;
    legalName: string | null;
    taxId: string | null;
    email: string;
    phone: string;
    address: string;
    city: string;
    businessType: string;
    status: string;
    logoUrl: string | null;
    plan: { code: string; name: string; price?: string } | null;
    limits: Record<string, number>;
    suspensionEndsAt?: string | null;
    suspensionReason?: string | null;
  };
  access: {
    allowed: boolean;
    reason?: string;
    role: string;
    permissions: string[];
    modules: string[];
    sectorModules: string[];
    branchId: string | null;
  };
  branches: Array<{ id: string; name: string; code: string; city: string }>;
  onboarding: {
    tasks: Array<{ id: string; key: string; completed: boolean; completedAt: string | null }>;
    completed: string | null;
    progress: Record<string, unknown>;
  };
  support: { active: boolean; readOnly: boolean; sessionId: string } | null;
}

interface TenantState {
  data: TenantAccess | null;
  loading: boolean;
  error: unknown;
  can: (permission: string) => boolean;
  hasModule: (module: string) => boolean;
  refetch: () => void;
}

const TenantContext = createContext<TenantState | null>(null);

export function TenantProvider({ children }: { children: ReactNode }) {
  const { me } = useAuth();
  const query = useQuery({
    queryKey: ['tenant-access', me?.store?.id, me?.user.id],
    queryFn: () => api.get<TenantAccess>('/tenant/access'),
    enabled: Boolean(me?.store?.id),
    retry: 1,
    staleTime: 30_000,
  });
  const data = query.data ?? null;
  const value: TenantState = {
    data,
    loading: query.isLoading,
    error: query.error,
    can: (permission) => Boolean(data?.access.permissions.includes(permission)),
    hasModule: (module) => Boolean(data?.access.modules.includes(module)),
    refetch: () => void query.refetch(),
  };
  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantState {
  const context = useContext(TenantContext);
  if (!context) throw new Error('useTenant debe usarse dentro de TenantProvider');
  return context;
}
