'use client';

import { EmptyState, Skeleton } from '@specforge/ui';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { DashboardShell } from '@/components/sidebar';
import { apiFetch, useAuthStore } from '@/lib/auth-store';

interface Project {
  id: string;
  name: string;
  clientName: string | null;
  status: string;
}

export default function DashboardPage() {
  const auth = useAuthStore((s) => s.auth);
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!auth) {
      router.replace('/');
      return;
    }
    apiFetch<{ projects: Project[] }>('/projects')
      .then((data) => setProjects(data.projects))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [auth, router]);

  if (!auth) return null;

  return (
    <DashboardShell>
      <div className="p-8">
        <header className="mb-8">
          <h1 className="text-2xl font-semibold text-[var(--sf-text-primary)]">Home</h1>
          <p className="mt-1 text-sm text-[var(--sf-text-secondary)]">
            Welcome back, {auth.email}
          </p>
        </header>

        <section>
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wider text-[var(--sf-text-secondary)]">
            Projects
          </h2>
          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : projects.length === 0 ? (
            <EmptyState
              title="No projects yet"
              description="Create your first project to start turning briefs into specs."
            />
          ) : (
            <ul className="space-y-2">
              {projects.map((p) => (
                <li
                  key={p.id}
                  className="rounded-lg border border-[var(--sf-border)] bg-[var(--sf-surface)] px-4 py-3"
                >
                  <p className="font-medium text-[var(--sf-text-primary)]">{p.name}</p>
                  {p.clientName && (
                    <p className="text-sm text-[var(--sf-text-secondary)]">{p.clientName}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </DashboardShell>
  );
}
