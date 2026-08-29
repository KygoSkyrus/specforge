'use client';

import { blueprintNoir, blueprintPaper, themeToCssVars } from '@specforge/ui';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'dark' | 'light';

interface ThemeStore {
  mode: ThemeMode;
  toggle: () => void;
  setMode: (mode: ThemeMode) => void;
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set, get) => ({
      mode: 'dark',
      toggle: () => set({ mode: get().mode === 'dark' ? 'light' : 'dark' }),
      setMode: (mode) => set({ mode }),
    }),
    { name: 'specforge-theme' },
  ),
);

export function useThemeVars(): Record<string, string> {
  const mode = useThemeStore((s) => s.mode);
  const tokens = mode === 'dark' ? blueprintNoir : blueprintPaper;
  return themeToCssVars(tokens);
}
