'use client'

import { useEffect, useState } from 'react'
import { useThemeStore, THEMES } from '@/stores/themeStore'

export default function ThemeInitializer() {
  const [mounted, setMounted] = useState(false)
  const { theme } = useThemeStore()

  useEffect(() => {
    setMounted(true)
    
    const colors = THEMES[theme]
    document.documentElement.style.setProperty('--theme-primary', colors.primary)
    document.documentElement.style.setProperty('--theme-secondary', colors.secondary)
    document.documentElement.style.setProperty('--theme-text', colors.text)
    document.documentElement.style.setProperty('--theme-bg', colors.background)
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  if (!mounted) {
    return null
  }

  return null
}
