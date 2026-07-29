import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import type { LocaleCode } from '@/i18n/translator';

export type ThemeMode = 'light' | 'dark' | 'system';
export type TableDensity = 'compact' | 'comfortable';

interface UiState {
  locale: LocaleCode;
  theme: ThemeMode;
  sidebarCollapsed: boolean;
  mobileSidebarOpen: boolean;
  activeOrganizationId: string | null;
  tableDensity: TableDensity;
  setLocale: (locale: LocaleCode) => void;
  setTheme: (theme: ThemeMode) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMobileSidebarOpen: (open: boolean) => void;
  setActiveOrganizationId: (organizationId: string | null) => void;
  setTableDensity: (density: TableDensity) => void;
}

const defaultLocale = (import.meta.env.VITE_DEFAULT_LOCALE ?? 'id') as LocaleCode;

export const useUiStore = create<UiState>()(
  persist(
    (set) => ({
      locale: ['id', 'en', 'zh'].includes(defaultLocale) ? defaultLocale : 'id',
      theme: 'system',
      sidebarCollapsed: false,
      mobileSidebarOpen: false,
      activeOrganizationId: null,
      tableDensity: 'comfortable',
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      toggleSidebar: () => set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),
      setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
      setMobileSidebarOpen: (mobileSidebarOpen) => set({ mobileSidebarOpen }),
      setActiveOrganizationId: (activeOrganizationId) => set({ activeOrganizationId }),
      setTableDensity: (tableDensity) => set({ tableDensity })
    }),
    {
      name: 'attendflow-ui',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        locale: state.locale,
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        activeOrganizationId: state.activeOrganizationId,
        tableDensity: state.tableDensity
      })
    }
  )
);
