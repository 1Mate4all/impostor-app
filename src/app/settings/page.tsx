'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useUserStore } from '@/stores/userStore'
import Navbar from '@/components/Layout/Navbar'
import { encodePubkey } from '@/lib/nostr'
import { Eye, EyeOff, Key, Users, Globe, Save, CheckCircle, RotateCcw } from 'lucide-react'

export default function Settings() {
  const router = useRouter()
  const { user, privateKey, relays, updateUsername, toggleRelay, addRelay, logout, resetRelays } = useUserStore()
  const [newUsername, setNewUsername] = useState('')
  const [showPrivateKey, setShowPrivateKey] = useState(false)
  const [newRelay, setNewRelay] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (user?.username) {
      setNewUsername(user.username)
    }
  }, [user])

  const handleSaveUsername = async () => {
    if (!newUsername.trim() || !user) return
    
    setSaving(true)
    try {
      const response = await fetch('/api/auth/update-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npub: user.npub, username: newUsername.trim() })
      })
      
      if (response.ok) {
        updateUsername(newUsername.trim())
      }
    } catch (error) {
      console.error('Error saving username:', error)
    } finally {
      setSaving(false)
    }
  }

  const handleAddRelay = () => {
    if (!newRelay.trim()) return
    
    let url = newRelay.trim()
    if (!url.startsWith('wss://') && !url.startsWith('ws://')) {
      url = 'wss://' + url
    }
    
    // Check for duplicates
    if (relays.some(r => r.url === url)) {
      alert('Este relay ya está añadido')
      return
    }
    
    addRelay(url)
    setNewRelay('')
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <main className="max-w-2xl mx-auto p-4 pt-20 space-y-6">
        <h1 className="text-2xl font-bold mb-6">Configuración</h1>

        <section className="bg-gray-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Key size={20} />
            Cuenta
          </h2>
          
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Nombre de usuario
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="flex-1 px-4 py-2 bg-theme-bg rounded-lg focus:outline-none focus:border-theme-primary"
                />
                <button
                  onClick={handleSaveUsername}
                  disabled={saving}
                  className="px-4 py-2 bg-theme-primary hover:opacity-80 rounded-lg flex items-center gap-2"
                >
                  <Save size={18} />
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm text-theme-accent mb-2">
                Clave pública (npub)
              </label>
              <input
                type="text"
                value={user?.npub || ''}
                readOnly
                className="w-full px-4 py-2 bg-theme-bg rounded-lg text-theme-accent"
              />
            </div>

            <div>
              <label className="block text-sm text-theme-accent mb-2">
                Clave privada
              </label>
              <div className="flex gap-2">
                <input
                  type={showPrivateKey ? 'text' : 'password'}
                  value={privateKey || ''}
                  readOnly
                  className="flex-1 px-4 py-2 bg-theme-bg rounded-lg text-theme-accent font-mono"
                />
                <button
                  onClick={() => setShowPrivateKey(!showPrivateKey)}
                  className="px-4 py-2 bg-theme-bg hover:opacity-80 rounded-lg"
                >
                  {showPrivateKey ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-xs text-yellow-500 mt-2">
                ⚠️ Nunca compartas tu clave privada
              </p>
            </div>
          </div>
        </section>

        <section className="bg-theme-bg rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Globe size={20} />
            Relays
          </h2>
          
          <div className="space-y-3">
            {relays.map((relay) => (
              <div
                key={relay.url}
                className="flex items-center justify-between p-3 bg-theme-bg rounded-lg"
              >
                <span className="text-sm truncate flex-1">{relay.url}</span>
                <button
                  onClick={() => toggleRelay(relay.url)}
                  className={`px-3 py-1 rounded text-sm ${
                    relay.active
                      ? 'bg-green-600 text-white'
                      : 'bg-theme-bg text-theme-accent'
                  }`}
                >
                  {relay.active ? 'Activo' : 'Inactivo'}
                </button>
              </div>
            ))}

            <div className="flex gap-2 mt-4">
              <input
                type="text"
                value={newRelay}
                onChange={(e) => setNewRelay(e.target.value)}
                placeholder="wss://tu-relay.com"
                className="flex-1 px-4 py-2 bg-theme-bg rounded-lg focus:outline-none focus:border-theme-primary"
              />
              <button
                onClick={handleAddRelay}
                className="px-4 py-2 bg-theme-primary hover:opacity-80 rounded-lg"
              >
                Añadir
              </button>
            </div>

            <button
              onClick={() => {
                if (confirm('¿Resetear relays a valores por defecto? Esto eliminará los relays personalizados.')) {
                  resetRelays()
                  alert('Relays reseteados')
                }
              }}
              className="w-full mt-2 py-2 bg-red-600/50 hover:bg-red-600 rounded-lg flex items-center justify-center gap-2 text-sm"
            >
              <RotateCcw size={16} />
              Resetear a valores por defecto
            </button>

            <button
              onClick={() => {
                setSaved(true)
                setTimeout(() => {
                  router.push('/')
                }, 500)
              }}
              className="w-full mt-4 py-3 bg-green-600 hover:bg-green-700 rounded-lg flex items-center justify-center gap-2"
            >
              <Save size={20} />
              Guardar Cambios
            </button>

            {saved && (
              <p className="text-center text-green-400 mt-2 flex items-center justify-center gap-2">
                <CheckCircle size={16} />
                Cambios guardados
              </p>
            )}
          </div>
        </section>

        <button
          onClick={logout}
          className="w-full py-3 bg-red-600 hover:bg-red-700 rounded-lg"
        >
          Cerrar Sesión
        </button>
      </main>
    </div>
  )
}
