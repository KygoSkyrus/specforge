'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Activity,
  BarChart3,
  BookOpen,
  ChevronLeft,
  ChevronRight,
  FileText,
  GitBranch,
  Home,
  Layers,
  LayoutDashboard,
  Link2,
  MessageSquare,
  Moon,
  Plug,
  Settings,
  Sun,
  Users,
  Zap,
} from 'lucide-react';
import { useState } from 'react';
import { cn } from '@specforge/ui';
import { useThemeStore, useThemeVars } from '@/lib/theme-store';

interface NavGroup {
  label: string;
  items: { href: string; label: string; icon: React.ReactNode }[];
}

const navGroups: NavGroup[] = [
  {
    label: 'OVERVIEW',
    items: [
      { href: '/dashboard', label: 'Home / Activity', icon: <Home size={16} /> },
      { href: '/dashboard/insights', label: 'Insights', icon: <BarChart3 size={16} /> },
    ],
  },
  {
    label: 'DISCOVER',
    items: [
      { href: '/dashboard/intake', label: 'Intake', icon: <BookOpen size={16} /> },
      { href: '/dashboard/briefs', label: 'Briefs', icon: <FileText size={16} /> },
    ],
  },
  {
    label: 'DESIGN',
    items: [
      { href: '/dashboard/specs', label: 'Specs', icon: <Layers size={16} /> },
      { href: '/dashboard/stories', label: 'Stories & backlog', icon: <LayoutDashboard size={16} /> },
      { href: '/dashboard/api', label: 'API & data model', icon: <GitBranch size={16} /> },
      { href: '/dashboard/diagrams', label: 'Diagrams', icon: <Activity size={16} /> },
    ],
  },
  {
    label: 'DELIVER',
    items: [
      { href: '/dashboard/plan', label: 'Delivery plan', icon: <Zap size={16} /> },
      { href: '/dashboard/releases', label: 'Releases', icon: <GitBranch size={16} /> },
    ],
  },
  {
    label: 'CLIENT',
    items: [
      { href: '/dashboard/deal-rooms', label: 'Deal Rooms', icon: <Link2 size={16} /> },
      { href: '/dashboard/share', label: 'Share links', icon: <Link2 size={16} /> },
      { href: '/dashboard/comments', label: 'Comments', icon: <MessageSquare size={16} /> },
    ],
  },
  {
    label: 'AUTOMATE',
    items: [
      { href: '/dashboard/integrations', label: 'Integrations', icon: <Plug size={16} /> },
    ],
  },
  {
    label: 'ADMIN',
    items: [
      { href: '/dashboard/members', label: 'Members & roles', icon: <Users size={16} /> },
      { href: '/dashboard/settings', label: 'Settings', icon: <Settings size={16} /> },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { mode, toggle } = useThemeStore();

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r border-[var(--sf-border)] bg-[var(--sf-surface)] transition-all duration-200',
        collapsed ? 'w-16' : 'w-64',
      )}
    >
      <div className="flex items-center justify-between border-b border-[var(--sf-border)] px-4 py-4">
        {!collapsed && (
          <span className="bg-gradient-to-r from-[var(--sf-accent-from)] to-[var(--sf-accent-to)] bg-clip-text text-lg font-semibold text-transparent">
            ◈ SpecForge
          </span>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="rounded p-1 text-[var(--sf-text-secondary)] hover:bg-white/5"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-2 py-4">
        {navGroups.map((group) => (
          <div key={group.label} className="mb-4">
            {!collapsed && (
              <p className="mb-2 px-2 text-[10px] font-medium tracking-wider text-[var(--sf-text-secondary)]">
                {group.label}
              </p>
            )}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = pathname === item.href;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 rounded-md px-2 py-2 text-sm transition-colors duration-150',
                        active
                          ? 'bg-white/5 text-[var(--sf-text-primary)]'
                          : 'text-[var(--sf-text-secondary)] hover:bg-white/5 hover:text-[var(--sf-text-primary)]',
                      )}
                      title={collapsed ? item.label : undefined}
                    >
                      {item.icon}
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-[var(--sf-border)] p-2">
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm text-[var(--sf-text-secondary)] hover:bg-white/5"
          aria-label="Toggle theme"
        >
          {mode === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          {!collapsed && <span>{mode === 'dark' ? 'Blueprint Paper' : 'Blueprint Noir'}</span>}
        </button>
      </div>
    </aside>
  );
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const themeVars = useThemeVars();

  return (
    <div style={themeVars as React.CSSProperties} className="flex min-h-screen">
      <Sidebar />
      <main className="flex-1 overflow-y-auto blueprint-grid">{children}</main>
    </div>
  );
}
