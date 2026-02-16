'use client'

import { useEffect } from 'react'
import { useThemeStore } from '@/stores/themeStore'

export default function ThemeInitializer() {
  const { theme } = useThemeStore()

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
  }, [theme])

  return null
}
