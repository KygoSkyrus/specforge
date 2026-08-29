'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface AuthState {
  userId: string;
  email: string;
  orgId: string;
  role: string;
  workspaceId?: string;
}

interface AuthStore {
  auth: AuthState | null;
  setAuth: (auth: AuthState | null) => void;
  headers: () => Record<string, string>;
}

export const useAuthStore = create<AuthStore>()(
  persist(
    (set, get) => ({
      auth: null,
      setAuth: (auth) => set({ auth }),
      headers: (): Record<string, string> => {
        const auth = get().auth;
        if (!auth) return {};
        return {
          'x-user-id': auth.userId,
          'x-user-email': auth.email,
          'x-org-id': auth.orgId,
          'x-user-role': auth.role,
        };
      },
    }),
    { name: 'specforge-auth' },
  ),
);

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api/v1';

export async function devLogin(email: string, orgName?: string) {
  const res = await fetch(`${API_URL}/auth/dev-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, orgName }),
  });
  if (!res.ok) throw new Error('Login failed');
  return res.json() as Promise<{
    user: { id: string; email: string; name: string | null };
    org: { id: string; name: string };
    workspace?: { id: string; name: string };
    role: string;
  }>;
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = useAuthStore.getState().headers();
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...headers, ...init?.headers },
  });
  if (!res.ok) throw new Error(`API error: ${res.status}`);
  return res.json() as Promise<T>;
}
