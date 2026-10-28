import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearTokens, getAccessToken, setTokens } from './api';

export interface SessionUser {
  id: string;
  username: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  mustChangePassword: boolean;
  platformRole: 'SUPER_ADMIN' | 'ADMIN' | 'SUPPORT' | null;
  platformPermissions: string[];
  isPlatformAdmin: boolean;
}

export interface StoreSummary {
  id: string;
  name: string;
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED' | 'DISABLED';
  businessType: string;
  plan?: { code: string; name: string } | null;
}

export interface MembershipSummary {
  id: string;
  tenantId: string;
  role: string;
  branchId: string | null;
  store: StoreSummary | null;
}

export interface MeResponse {
  user: SessionUser;
  role?: string | null;
  permissions: string[];
  branchId?: string | null;
  memberships: MembershipSummary[];
  store: StoreSummary | null;
  platform: boolean;
  platformPermissions: string[];
  supportSessionId?: string;
  readOnly?: boolean;
}

interface LoginResponse {
  accessToken?: string;
  refreshToken?: string;
  requiresStoreSelection?: boolean;
  selectionToken?: string;
  user?: SessionUser;
  store?: StoreSummary | null;
  memberships?: MembershipSummary[];
  platform?: boolean;
}

interface AuthState {
  me: MeResponse | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<LoginResponse>;
  selectTenant: (tenantId: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  applySession: (data: LoginResponse) => void;
  setSupportSession: (tokens: { accessToken: string; refreshToken: string }) => Promise<void>;
  exitSupport: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectionToken, setSelectionToken] = useState<string | null>(null);

  const loadMe = useCallback(async () => {
    if (!getAccessToken()) {
      setMe(null);
      return;
    }
    try {
      const data = await api.get<MeResponse>('/auth/me');
      setMe(data);
    } catch {
      setMe(null);
    }
  }, []);

  useEffect(() => {
    (async () => {
      await loadMe();
      setLoading(false);
    })();
  }, [loadMe]);

  const login = useCallback(async (username: string, password: string) => {
    const data = await api.post<LoginResponse>('/auth/login', { username, password }, { token: null });
    if (data.requiresStoreSelection && data.selectionToken) {
      setSelectionToken(data.selectionToken);
      return data;
    }
    if (data.accessToken && data.refreshToken) {
      const scope = new URLSearchParams(window.location.search).has('support') ? 'session' : 'local';
      setTokens(data.accessToken, data.refreshToken, scope);
      await loadMe();
    }
    return data;
  }, [loadMe]);

  const selectTenant = useCallback(async (tenantId: string) => {
    if (!selectionToken) throw new Error('Selección de tienda expirada.');
    const data = await api.post<LoginResponse>(
      '/auth/select-tenant',
      { selectionToken, tenantId },
      { token: null },
    );
    if (data.accessToken && data.refreshToken) {
      setTokens(data.accessToken, data.refreshToken, 'local');
      setSelectionToken(null);
      await loadMe();
    }
  }, [loadMe, selectionToken]);

  const applySession = useCallback((data: LoginResponse) => {
    if (data.accessToken && data.refreshToken) {
      const scope = new URLSearchParams(window.location.search).has('support') ? 'session' : 'local';
      setTokens(data.accessToken, data.refreshToken, scope);
    }
    void loadMe();
  }, [loadMe]);

  const setSupportSession = useCallback(async (tokens: { accessToken: string; refreshToken: string }) => {
    setTokens(tokens.accessToken, tokens.refreshToken, 'session');
    await loadMe();
  }, [loadMe]);

  const exitSupport = useCallback(async () => {
    sessionStorage.removeItem('saldio.accessToken');
    sessionStorage.removeItem('saldio.refreshToken');
    setMe(null);
    window.location.hash = '#/admin';
    window.location.reload();
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.post('/auth/logout');
    } catch {
      // La sesión local se limpia aunque el servidor no responda.
    }
    clearTokens();
    setMe(null);
    setSelectionToken(null);
  }, []);

  const refresh = useCallback(async () => {
    await loadMe();
  }, [loadMe]);

  const value = useMemo<AuthState>(
    () => ({ me, loading, login, selectTenant, logout, refresh, applySession, setSupportSession, exitSupport }),
    [me, loading, login, selectTenant, logout, refresh, applySession, setSupportSession, exitSupport],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return context;
}
