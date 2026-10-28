export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

declare global {
  interface Window {
    saldio?: {
      apiUrl?: string;
      platform?: string;
      version?: string;
      printReceipt?: (html: string, width: string) => Promise<boolean>;
    };
  }
}

const TOKEN_KEY = 'saldio.accessToken';
const REFRESH_KEY = 'saldio.refreshToken';

export function getAccessToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY) ?? localStorage.getItem(TOKEN_KEY);
}
export function getRefreshToken(): string | null {
  return sessionStorage.getItem(REFRESH_KEY) ?? localStorage.getItem(REFRESH_KEY);
}
export function setTokens(access: string, refresh: string, scope: 'local' | 'session' = 'local'): void {
  const storage = scope === 'session' ? sessionStorage : localStorage;
  storage.setItem(TOKEN_KEY, access);
  storage.setItem(REFRESH_KEY, refresh);
  if (scope === 'local') {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_KEY);
  }
}
export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_KEY);
}

export function apiBase(): string {
  const configured =
    window.saldio?.apiUrl ||
    localStorage.getItem('saldio.apiUrl') ||
    (import.meta.env.VITE_API_URL as string | undefined) ||
    '/api/v1';
  const trimmed = configured.replace(/\/+$/, '');
  return trimmed.endsWith('/api/v1') ? trimmed : `${trimmed}/api/v1`;
}

function joinPath(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  return `${apiBase()}${path.startsWith('/') ? path : `/${path}`}`;
}

export interface RequestOptions extends Omit<RequestInit, 'body'> {
  body?: unknown;
  raw?: boolean;
  retry?: boolean;
  token?: string | null;
}

async function parseResponse(response: Response): Promise<unknown> {
  const type = response.headers.get('content-type') ?? '';
  if (response.status === 204) return null;
  if (type.includes('application/json')) return response.json();
  return response.text();
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;
  try {
    const response = await fetch(joinPath('/auth/refresh'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) return false;
    const data = (await response.json()) as { accessToken?: string; refreshToken?: string };
    if (!data.accessToken || !data.refreshToken) return false;
    const scope = sessionStorage.getItem(REFRESH_KEY) ? 'session' : 'local';
    setTokens(data.accessToken, data.refreshToken, scope);
    return true;
  } catch {
    return false;
  }
}

export async function request<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, raw, retry = true, token, headers, ...rest } = options;
  const finalHeaders = new Headers(headers);
  if (!(body instanceof FormData) && body !== undefined && !finalHeaders.has('Content-Type')) {
    finalHeaders.set('Content-Type', 'application/json');
  }
  const authToken = token === undefined ? getAccessToken() : token;
  if (authToken) finalHeaders.set('Authorization', `Bearer ${authToken}`);
  let response: Response;
  try {
    response = await fetch(joinPath(path), {
      ...rest,
      headers: finalHeaders,
      body:
        body instanceof FormData || body === undefined
          ? (body as FormData | undefined)
          : raw
            ? (body as BodyInit)
            : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(
      0,
      'No hay conexión con el servidor. Verifique su red e intente nuevamente.',
      'NETWORK_ERROR',
    );
  }
  if (response.status === 401 && retry && !path.includes('/auth/')) {
    const refreshed = await refreshSession();
    if (refreshed) {
      return request<T>(path, { ...options, retry: false });
    }
    clearTokens();
    throw new ApiError(401, 'La sesión expiró. Inicie sesión nuevamente.', 'SESSION_EXPIRED');
  }
  const data = await parseResponse(response);
  if (!response.ok) {
    const payload = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
    const message =
      typeof payload.message === 'string'
        ? payload.message
        : Array.isArray(payload.message)
          ? payload.message.join('. ')
          : `Error ${response.status}`;
    throw new ApiError(
      response.status,
      message,
      typeof payload.code === 'string' ? payload.code : undefined,
      payload,
    );
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'GET' }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body }),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PUT', body }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'PATCH', body }),
  del: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  upload: <T>(path: string, form: FormData) =>
    request<T>(path, { method: 'POST', body: form }),
};

export function queryString(params: Record<string, string | number | boolean | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const result = search.toString();
  return result ? `?${result}` : '';
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

export async function download(path: string, filename: string): Promise<void> {
  const token = getAccessToken();
  const response = await fetch(joinPath(path), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(response.status, (data as { message?: string }).message ?? 'No se pudo descargar.', 'DOWNLOAD_ERROR');
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
