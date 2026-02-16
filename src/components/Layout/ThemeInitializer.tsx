'use client'

import { useEffect } from 'react'
import { useThemeStore, THEMES } from '@/stores/themeStore'

export default function ThemeInitializer() {
  const { theme } = useThemeStore()

  useEffect(() => {
    const colors = THEMES[theme]
    
    document.documentElement.setAttribute('data-theme', theme)
    document.documentElement.style.setProperty('--primary', colors.primary)
    document.documentElement.style.setProperty('--secondary', colors.secondary)
    document.documentElement.style.setProperty('--accent', colors.text)
    document.documentElement.style.setProperty('--bg-theme', colors.background)
  }, [theme])

  return null
}
