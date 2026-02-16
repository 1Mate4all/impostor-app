'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useUserStore } from '@/stores/userStore'
import ThemeSelector from './ThemeSelector'
import { 
  Menu, 
  X, 
  Home, 
  User, 
  Settings, 
  LogOut,
  Gamepad2,
  Plus
} from 'lucide-react'

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const pathname = usePathname()
  const router = useRouter()
  const { user, isAuthenticated, logout } = useUserStore()

  const handleLogout = () => {
    logout()
    setMenuOpen(false)
    router.push('/')
  }

  if (!isAuthenticated) return null

  return (
    <nav className="bg-gray-900 border-b border-gray-800 fixed top-0 left-0 right-0 z-50">
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="p-2 text-gray-400 hover:text-white"
            >
              {menuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
            
            <Link href="/" className="text-xl font-bold text-purple-500">
              Impostor.Nos
            </Link>
          </div>

          <div className="flex items-center gap-2">
            <ThemeSelector />
            
            <Link
              href="/game"
              className="flex items-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 rounded-lg text-sm font-medium"
            >
              <Plus size={18} />
              Nueva Partida
            </Link>

            <button
              onClick={handleLogout}
              className="p-2 text-gray-400 hover:text-red-400"
              title="Cerrar sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </div>

      {menuOpen && (
        <div className="bg-gray-800 border-t border-gray-700">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-2">
            <Link
              href="/"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                pathname === '/' ? 'bg-purple-600' : 'hover:bg-gray-700'
              }`}
            >
              <Home size={20} />
              Inicio
            </Link>
            
            <Link
              href="/game"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                pathname === '/game' ? 'bg-purple-600' : 'hover:bg-gray-700'
              }`}
            >
              <Gamepad2 size={20} />
              Nueva Partida
            </Link>

            <Link
              href={`/profile/${user?.npub}`}
              onClick={() => setMenuOpen(false)}
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-700"
            >
              <User size={20} />
              Mi Perfil
            </Link>

            <Link
              href="/settings"
              onClick={() => setMenuOpen(false)}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg ${
                pathname === '/settings' ? 'bg-purple-600' : 'hover:bg-gray-700'
              }`}
            >
              <Settings size={20} />
              Configuración
            </Link>

            <button
              onClick={handleLogout}
              className="flex items-center gap-3 px-4 py-3 rounded-lg hover:bg-gray-700 text-red-400 w-full"
            >
              <LogOut size={20} />
              Cerrar Sesión
            </button>
          </div>
        </div>
      )}
    </nav>
  )
}
