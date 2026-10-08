import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from './api/client';
import type { AdminUser } from './types';

type AuthContextValue = { admin: AdminUser | null; loading: boolean; login: (email: string, password: string) => Promise<void>; logout: () => Promise<void>; };
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(() => Boolean(sessionStorage.getItem('sancharieAdminToken')));
  useEffect(() => {
    const expire = () => { sessionStorage.removeItem('sancharieAdminToken'); setAdmin(null); };
    window.addEventListener('admin:session-expired', expire);
    const token = sessionStorage.getItem('sancharieAdminToken');
    if (!token) return () => window.removeEventListener('admin:session-expired', expire);
    api.get('/auth/me').then(({ data }) => setAdmin(data.admin)).catch(expire).finally(() => setLoading(false));
    return () => window.removeEventListener('admin:session-expired', expire);
  }, []);
  useEffect(() => {
    if (!admin) return;
    const token = sessionStorage.getItem('sancharieAdminToken');
    if (!token) return;
    try {
      const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
      if (!payload.exp) return;
      const delay = payload.exp * 1000 - Date.now();
      if (delay <= 0) { window.dispatchEvent(new CustomEvent('admin:session-expired')); return; }
      const timer = window.setTimeout(() => window.dispatchEvent(new CustomEvent('admin:session-expired')), delay);
      return () => window.clearTimeout(timer);
    } catch {
      window.dispatchEvent(new CustomEvent('admin:session-expired'));
    }
  }, [admin]);
  const value = useMemo<AuthContextValue>(() => ({
    admin, loading,
    async login(email, password) {
      const { data } = await api.post('/auth/login', { email, password });
      sessionStorage.setItem('sancharieAdminToken', data.token);
      setAdmin(data.admin);
    },
    async logout() {
      try { await api.post('/auth/logout'); } finally { sessionStorage.removeItem('sancharieAdminToken'); setAdmin(null); }
    },
  }), [admin, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be within AuthProvider');
  return value;
};
