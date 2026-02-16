'use client'

import { useState, useEffect } from 'react'
import { useThemeStore, THEMES, ThemeName } from '@/stores/themeStore'
import { Palette, ChevronDown, Check, X } from 'lucide-react'

const THEME_LABELS: Record<ThemeName, string> = {
  matrix: 'Matrix',
  amber: 'Amber',
  cyberpunk: 'Cyberpunk',
  hacker: 'Hacker',
  ghost: 'Ghost',
}

export default function ThemeSelector() {
  const [isOpen, setIsOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pendingTheme, setPendingTheme] = useState<ThemeName | null>(null)
  const { theme, setTheme } = useThemeStore()

  useEffect(() => {
    setMounted(true)
  }, [])

  const applyTheme = (newTheme: ThemeName) => {
    document.documentElement.setAttribute('data-theme', newTheme)
    
    setTheme(newTheme)
    setPendingTheme(null)
    setIsOpen(false)
  }

  const handleSelectTheme = (name: ThemeName) => {
    setPendingTheme(name)
  }

  const handleSave = () => {
    if (pendingTheme) {
      applyTheme(pendingTheme)
    }
  }

  const handleCancel = () => {
    setPendingTheme(null)
    setIsOpen(false)
  }

  const displayTheme = pendingTheme || theme

  if (!mounted) {
    return null
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
            onClick={handleCancel} 
          />
          <div className="absolute right-0 mt-2 w-56 bg-gray-800 border border-gray-700 rounded-lg shadow-xl z-50 overflow-hidden">
            {Object.entries(THEMES).map(([name, colors]) => (
              <button
                key={name}
                onClick={() => handleSelectTheme(name as ThemeName)}
                className={`w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-700 transition-colors ${
                  displayTheme === name ? 'bg-gray-700/50' : ''
                }`}
              >
                <div 
                  className="w-4 h-4 rounded-full border border-gray-500"
                  style={{ backgroundColor: colors.primary }}
                />
                <div className="flex flex-col items-start flex-1">
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
                {pendingTheme === name && (
                  <Check size={16} className="text-green-400" />
                )}
              </button>
            ))}
            
            {pendingTheme && pendingTheme !== theme && (
              <div className="flex border-t border-gray-700">
                <button
                  onClick={handleCancel}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-gray-400 hover:bg-gray-700 hover:text-gray-200 transition-colors"
                >
                  <X size={16} />
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-3 text-green-400 hover:bg-gray-700 hover:text-green-300 transition-colors border-l border-gray-700"
                >
                  <Check size={16} />
                  Guardar
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
