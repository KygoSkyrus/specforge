'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/sidebar';
import { EmptyState } from '@specforge/ui';
import { useAuthStore } from '@/lib/auth-store';

export default function PlaceholderPage({ title }: { title: string }) {
  const auth = useAuthStore((s) => s.auth);
  const router = useRouter();

  useEffect(() => {
    if (!auth) router.replace('/');
  }, [auth, router]);

  if (!auth) return null;

  return (
    <DashboardShell>
      <div className="p-8">
        <h1 className="text-2xl font-semibold text-[var(--sf-text-primary)]">{title}</h1>
        <div className="mt-8">
          <EmptyState title="Coming soon" description={`${title} will be available in a future phase.`} />
        </div>
      </div>
    </DashboardShell>
  );
}
