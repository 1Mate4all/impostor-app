'use client'

import { useState } from 'react'
import { generateKeyPair, decodeNsec, getPublicKeyFromPrivate, encodePubkey } from '@/lib/nostr'
import { useUserStore } from '@/stores/userStore'
import { useRouter } from 'next/navigation'

export default function Auth() {
  const [mode, setMode] = useState<'select' | 'create' | 'login'>('select')
  const [username, setUsername] = useState('')
  const [privateKeyInput, setPrivateKeyInput] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  
  const { setUser } = useUserStore()
  const router = useRouter()

  const handleCreate = async () => {
    if (!username.trim()) {
      setError('Ingresa un nombre de usuario')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      const keys = generateKeyPair()
      
      setUser({
        npub: keys.npub,
        publicKey: keys.publicKey,
        username: username.trim()
      }, keys.privateKey)
      
      router.push('/')
    } catch (err) {
      setError('Error al generar claves')
    } finally {
      setLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!privateKeyInput.trim()) {
      setError('Ingresa tu clave privada')
      return
    }
    
    setLoading(true)
    setError('')
    
    try {
      let privateKey = privateKeyInput.trim()
      
      if (privateKey.startsWith('nsec1')) {
        const decoded = decodeNsec(privateKey)
        if (!decoded) {
          setError('Clave privada inválida')
          setLoading(false)
          return
        }
        privateKey = decoded
      }

      const publicKey = getPublicKeyFromPrivate(privateKey)
      const npub = encodePubkey(publicKey)

      setUser({
        npub,
        publicKey,
        username: npub.slice(0, 16) + '...'
      }, privateKey)
      
      router.push('/')
    } catch (err) {
      setError('Clave privada inválida')
    } finally {
      setLoading(false)
    }
  }

  if (mode === 'select') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
        <div className="max-w-md w-full space-y-8 text-center">
          <div>
            <h1 className="text-4xl font-bold mb-2 text-theme-primary">Impostor.Nos</h1>
            <p className="text-theme-accent">Juego social con Nostr</p>
          </div>
          
          <div className="space-y-4">
            <button
              onClick={() => setMode('create')}
              className="w-full py-3 px-4 bg-theme-primary hover:opacity-80 rounded-lg font-semibold transition"
            >
              Crear nuevas claves
            </button>
            
            <button
              onClick={() => setMode('login')}
              className="w-full py-3 px-4 bg-theme-bg hover:opacity-80 rounded-lg font-semibold transition"
            >
              Usar claves existentes
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white p-4">
      <div className="max-w-md w-full space-y-6">
        <button
          onClick={() => setMode('select')}
          className="text-theme-accent hover:text-theme-foreground"
        >
          ← Volver
        </button>

        <div>
          <h2 className="text-2xl font-bold">
            {mode === 'create' ? 'Crear cuenta' : 'Iniciar sesión'}
          </h2>
          <p className="text-theme-accent mt-2">
            {mode === 'create' 
              ? 'Genera un nuevo par de claves Nostr'
              : 'Ingresa tu clave privada'
            }
          </p>
        </div>

        {mode === 'create' ? (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Nombre de usuario
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Tu nombre"
                className="w-full px-4 py-3 bg-theme-bg border border-theme-bg rounded-lg focus:outline-none focus:border-theme-primary"
              />
            </div>
            
            <button
              onClick={handleCreate}
              disabled={loading}
              className="w-full py-3 bg-theme-primary hover:opacity-80 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Creando...' : 'Crear cuenta'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                Clave privada (nsec o hex)
              </label>
              <input
                type="password"
                value={privateKeyInput}
                onChange={(e) => setPrivateKeyInput(e.target.value)}
                placeholder="nsec1..."
                className="w-full px-4 py-3 bg-theme-bg border border-theme-bg rounded-lg focus:outline-none focus:border-theme-primary"
              />
            </div>
            
            <button
              onClick={handleLogin}
              disabled={loading}
              className="w-full py-3 bg-theme-primary hover:opacity-80 rounded-lg font-semibold transition disabled:opacity-50"
            >
              {loading ? 'Iniciando...' : 'Iniciar sesión'}
            </button>
          </div>
        )}

        {error && (
          <p className="text-red-500 text-center">{error}</p>
        )}
      </div>
    </div>
  )
}
