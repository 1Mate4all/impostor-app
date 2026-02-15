'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { useUserStore } from '@/stores/userStore'
import Navbar from '@/components/Layout/Navbar'
import { encodePubkey, decodeNpub } from '@/lib/nostr'
import { Trophy, MessageCircle, Users } from 'lucide-react'

interface Stats {
  partidasJugadas: number
  partidasGanadas: number
  partidasPerdidas: number
  vecesImpostor: number
  vecesCiudadano: number
}

export default function Profile() {
  const params = useParams()
  const { user: currentUser } = useUserStore()
  const [stats, setStats] = useState<Stats>({
    partidasJugadas: 0,
    partidasGanadas: 0,
    partidasPerdidas: 0,
    vecesImpostor: 0,
    vecesCiudadano: 0
  })
  const [globalStats, setGlobalStats] = useState({ totalPartidas: 0, totalImpostores: 0, totalCiudadanos: 0 })
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'stats' | 'global'>('stats')
  const [profileName, setProfileName] = useState<string | null>(null)

  const npub = (params.npub as string) || ''
  const { relays } = useUserStore()

  if (!npub || npub.length < 5) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 text-center text-gray-400">Perfil no válido</main>
      </div>
    )
  }

  const isMyProfile = currentUser?.npub === npub

  const loadStats = () => {
    try {
      const allStats: any[] = JSON.parse(localStorage.getItem('impostor-stats') || '[]')
      const userStats = allStats.filter(s => s.npub === npub)
      
      const stats: Stats = {
        partidasJugadas: userStats.length,
        partidasGanadas: userStats.filter(s => s.gano).length,
        partidasPerdidas: userStats.filter(s => !s.gano).length,
        vecesImpostor: userStats.filter(s => s.rol === 'impostor').length,
        vecesCiudadano: userStats.filter(s => s.rol === 'ciudadano').length,
      }
      setStats(stats)
      
      const global = JSON.parse(localStorage.getItem('impostor-global-stats') || '{"totalPartidas":0,"totalImpostores":0,"totalCiudadanos":0}')
      setGlobalStats(global)
    } catch (error) {
      console.error('Error loading stats:', error)
    } finally {
      setLoading(false)
    }
  }

  const loadProfileName = async () => {
    try {
      const pubkey = decodeNpub(npub)
      if (!pubkey) {
        setLoading(false)
        return
      }

      const activeRelays = relays.filter(r => r.active)
      if (activeRelays.length === 0) {
        setLoading(false)
        return
      }

      const { SimplePool } = await import('nostr-tools')
      const pool = new SimplePool()
      const relayUrls = activeRelays.map(r => r.url)

      const events = await pool.querySync(relayUrls, {
        kinds: [0],
        authors: [pubkey]
      })

      if (events.length > 0) {
        const profile = JSON.parse(events[0].content)
        if (profile.name || profile.display_name) {
          setProfileName(profile.display_name || profile.name)
        }
      }
      
      setTimeout(() => {
        try { pool.close(relayUrls) } catch (e) {}
      }, 2000)
    } catch (error) {
      console.error('Error loading profile name:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!npub) return
    setLoading(true)
    loadStats()
    if (!isMyProfile) {
      loadProfileName()
    } else {
      setLoading(false)
    }
  }, [npub, isMyProfile])

  const username = isMyProfile ? currentUser?.username : (profileName || npub.slice(0, 16) + '...')

  const winRate = stats.partidasJugadas > 0
    ? Math.round((stats.partidasGanadas / stats.partidasJugadas) * 100)
    : 0

  if (loading || !npub) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <main className="pt-20 text-center">Cargando...</main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <main className="max-w-2xl mx-auto p-4 pt-20 space-y-6">
        <div className="bg-gray-800 rounded-lg p-6">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-16 h-16 bg-purple-600 rounded-full flex items-center justify-center text-2xl font-bold">
              {(isMyProfile ? currentUser?.username || 'U' : npub.slice(0, 2)).toUpperCase()}
            </div>
            <div>
              <h1 className="text-2xl font-bold">{username}</h1>
              <p className="text-gray-400 text-sm font-mono">{encodePubkey(npub).slice(0, 20)}...</p>
            </div>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                activeTab === 'stats' ? 'bg-purple-600' : 'bg-gray-700'
              }`}
            >
              <Trophy size={18} />
              Mis Estadísticas
            </button>
            <button
              onClick={() => setActiveTab('global')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                activeTab === 'global' ? 'bg-purple-600' : 'bg-gray-700'
              }`}
            >
              <Users size={18} />
              Global
            </button>
          </div>
        </div>

        {activeTab === 'stats' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Mis Estadísticas</h2>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-purple-400">{stats.partidasJugadas}</p>
                <p className="text-sm text-gray-400">Partidas jugadas</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-green-400">{winRate}%</p>
                <p className="text-sm text-gray-400">Win rate</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-green-500">{stats.partidasGanadas}</p>
                <p className="text-sm text-gray-400">Ganadas</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-red-500">{stats.partidasPerdidas}</p>
                <p className="text-sm text-gray-400">Perdidas</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-red-400">{stats.vecesImpostor}</p>
                <p className="text-sm text-gray-400">Veces impostor</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-blue-400">{stats.vecesCiudadano}</p>
                <p className="text-sm text-gray-400">Veces ciudadano</p>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'global' && (
          <div className="bg-gray-800 rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Estadísticas Globales</h2>
            <p className="text-gray-400 mb-4">Estadísticas de todas las partidas jugadas en el ecosistema</p>
            
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-purple-400">{globalStats.totalPartidas}</p>
                <p className="text-sm text-gray-400">Total Partidas</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-red-400">{globalStats.totalImpostores}</p>
                <p className="text-sm text-gray-400">Total Impostores</p>
              </div>
              
              <div className="bg-gray-700 rounded-lg p-4 text-center">
                <p className="text-3xl font-bold text-blue-400">{globalStats.totalCiudadanos}</p>
                <p className="text-sm text-gray-400">Total Ciudadanos</p>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
