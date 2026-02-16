'use client'

import { useState } from 'react'
import { useThemeStore, THEMES, ThemeName } from '@/stores/themeStore'
import { Palette, ChevronDown } from 'lucide-react'

const THEME_LABELS: Record<ThemeName, string> = {
  matrix: 'Matrix',
  amber: 'Amber',
  cyberpunk: 'Cyberpunk',
  hacker: 'Hacker',
  ghost: 'Ghost',
}

export default function ThemeSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const { theme, setTheme } = useThemeStore()

  const handleThemeSelect = (newTheme: ThemeName) => {
    setTheme(newTheme)
    setIsOpen(false)
    
    const colors = THEMES[newTheme]
    document.documentElement.style.setProperty('--theme-primary', colors.primary)
    document.documentElement.style.setProperty('--theme-secondary', colors.secondary)
    document.documentElement.style.setProperty('--theme-text', colors.text)
    document.documentElement.style.setProperty('--theme-bg', colors.background)
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-700 text-gray-300"
      >
        <Palette size={18} />
        <span className="text-sm">{THEME_LABELS[theme]}</span>
        <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)} 
          />
          <div className="absolute right-0 mt-2 w-48 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
            {Object.entries(THEMES).map(([name, colors]) => (
              <button
                key={name}
                onClick={() => handleThemeSelect(name as ThemeName)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors ${
                  theme === name ? 'bg-gray-700/50' : ''
                }`}
              >
                <div 
                  className="w-4 h-4 rounded-full border border-gray-500"
                  style={{ backgroundColor: colors.primary }}
                />
                <div className="flex flex-col items-start">
                  <span className="text-sm text-white">{THEME_LABELS[name as ThemeName]}</span>
                  <div className="flex gap-1 mt-0.5">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: colors.primary }}
                    />
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: colors.secondary }}
                    />
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: colors.text }}
                    />
                  </div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
