'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

export type ThemeName = 'matrix' | 'amber' | 'cyberpunk' | 'hacker' | 'ghost'

export interface ThemeColors {
  primary: string
  secondary: string
  text: string
  background: string
}

export const THEMES: Record<ThemeName, ThemeColors> = {
  matrix: { primary: '#00ff00', secondary: '#00ffff', text: '#00ff00', background: '#000000' },
  amber: { primary: '#ffb000', secondary: '#ffd700', text: '#ffb000', background: '#000000' },
  cyberpunk: { primary: '#ff00ff', secondary: '#00ffff', text: '#ff00ff', background: '#000000' },
  hacker: { primary: '#00ffff', secondary: '#00ff00', text: '#00ffff', background: '#000000' },
  ghost: { primary: '#ffffff', secondary: '#cccccc', text: '#ffffff', background: '#000000' },
}

interface ThemeStore {
  theme: ThemeName
  setTheme: (theme: ThemeName) => void
}

const storage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(name)
  },
  setItem: (name: string, value: string): void => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(name, value)
    }
  },
  removeItem: (name: string): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(name)
    }
  },
}

export const useThemeStore = create<ThemeStore>()(
  persist(
    (set) => ({
      theme: 'matrix',
      setTheme: (theme) => set({ theme }),
    }),
    {
      name: 'theme-storage',
      storage: createJSONStorage(() => storage),
    }
  )
)
