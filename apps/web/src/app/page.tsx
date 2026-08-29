'use client';

import { Button, EmptyState } from '@specforge/ui';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { devLogin, useAuthStore } from '@/lib/auth-store';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [orgName, setOrgName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const setAuth = useAuthStore((s) => s.setAuth);
  const router = useRouter();

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const result = await devLogin(email, orgName || undefined);
      setAuth({
        userId: result.user.id,
        email: result.user.email,
        orgId: result.org.id,
        role: result.role,
        workspaceId: result.workspace?.id,
      });
      router.push('/dashboard');
    } catch {
      setError('Login failed. Is the API running?');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className="flex min-h-screen items-center justify-center"
      style={{
        background: '#0B0D10',
        color: '#F4F5F7',
      }}
    >
      <div className="w-full max-w-md rounded-lg border border-white/10 bg-[#12151A] p-8">
        <h1 className="bg-gradient-to-r from-[#5EE7FF] to-[#8B7CFF] bg-clip-text text-2xl font-semibold text-transparent">
          ◈ SpecForge
        </h1>
        <p className="mt-2 text-sm text-[#9BA3B0]">
          Turn ideas into structured, versioned delivery artifacts.
        </p>

        <form onSubmit={handleLogin} className="mt-8 space-y-4">
          <div>
            <label htmlFor="email" className="text-sm text-[#9BA3B0]">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-[#0B0D10] px-3 py-2 text-sm focus:border-[#5EE7FF] focus:outline-none"
              placeholder="you@agency.com"
            />
          </div>
          <div>
            <label htmlFor="org" className="text-sm text-[#9BA3B0]">
              Org name (first login only)
            </label>
            <input
              id="org"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              className="mt-1 w-full rounded-md border border-white/10 bg-[#0B0D10] px-3 py-2 text-sm focus:border-[#5EE7FF] focus:outline-none"
              placeholder="Acme Agency"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Signing in…' : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}
