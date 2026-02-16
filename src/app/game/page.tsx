'use client'

import { useState, useEffect } from 'react'
import { useUserStore } from '@/stores/userStore'
import { useRouter } from 'next/navigation'
import Navbar from '@/components/Layout/Navbar'
import { HelpCircle, Users as UsersIcon, UserMinus, Play, RefreshCw, Copy, Check, Eye, Smartphone, Lock, XCircle } from 'lucide-react'

type Phase = 'setup' | 'words' | 'voting' | 'result'

interface Player {
  id: number
  name: string
  isImpostor: boolean
  eliminated: boolean
  word?: string
  votes: number
  votedFor: number | null  // ID del jugador por quien votó
}

export default function Game() {
  const router = useRouter()
  const { user, privateKey } = useUserStore()
  
  const [phase, setPhase] = useState<Phase>('setup')
  const [showRules, setShowRules] = useState(false)
  const [playerCount, setPlayerCount] = useState(3)
  const [impostorCount, setImpostorCount] = useState(1)
  const [selectedCategories, setSelectedCategories] = useState<number[]>([])
  const [players, setPlayers] = useState<Player[]>([])
  const [round, setRound] = useState(1)
  const [categories, setCategories] = useState<{id: number, nombre: string}[]>([])
  const [sessionCode, setSessionCode] = useState('')
  const [copied, setCopied] = useState(false)
  const [localNames, setLocalNames] = useState<string[]>(['Jugador 1', 'Jugador 2', 'Jugador 3'])
  const [statsSaved, setStatsSaved] = useState(false)
  
  // Modo local - pasar dispositivo
  const [currentViewer, setCurrentViewer] = useState(0)
  const [showWord, setShowWord] = useState(false)
  const [allViewed, setAllViewed] = useState(false)
  const [word, setWord] = useState('')
  const [category, setCategory] = useState('')

  // Calcular valores derivados antes de cualquier return
  const impostorsRemaining = players.filter(p => p.isImpostor && !p.eliminated).length
  const citizensRemaining = players.filter(p => !p.isImpostor && !p.eliminated).length
  const impostorsWin = impostorsRemaining > 0 && (citizensRemaining === 0 || impostorsRemaining >= citizensRemaining)

  useEffect(() => {
    fetchCategories()
  }, [])

  // Detectar navegación fuera de la página para mostrar advertencia
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (phase === 'words' || phase === 'voting') {
        e.preventDefault()
        e.returnValue = ''
      }
    }

    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [phase])

  useEffect(() => {
    const newNames = [...localNames]
    while (newNames.length < playerCount) {
      newNames.push(`Jugador ${newNames.length + 1}`)
    }
    setLocalNames(newNames.slice(0, playerCount))
  }, [playerCount])

  // Guardar stats al terminar (solo si no se publicó en Nostr)
  useEffect(() => {
    if (phase === 'result' && !statsSaved && players.length > 0) {
      const myPlayer = players[0]
      if (myPlayer) {
        const gano = impostorsWin ? myPlayer.isImpostor : !myPlayer.isImpostor
        const rol = myPlayer.isImpostor ? 'impostor' : 'ciudadano'
        saveStats(gano, rol)
        setStatsSaved(true)
      }
    }
  }, [phase, statsSaved, impostorsWin])

  const fetchCategories = async () => {
    try {
      const res = await fetch('/api/game/categories')
      const data = await res.json()
      setCategories(data)
      setSelectedCategories(data.map((c: any) => c.id))
    } catch (error) {
      console.error('Error fetching categories:', error)
    }
  }

  const handleImpostorChange = (value: number) => {
    setImpostorCount(Math.min(value, playerCount - 1))
  }

  const toggleCategory = (id: number) => {
    setSelectedCategories(prev => 
      prev.includes(id) 
        ? prev.filter(c => c !== id)
        : [...prev, id]
    )
  }

  const fetchWord = async (catIds: number[]): Promise<string> => {
    try {
      const res = await fetch(`/api/game/word?categories=${catIds.join(',')}`)
      const data = await res.json()
      return data.word
    } catch {
      return 'CASA'
    }
  }

  const handleStartGame = async () => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase()
    setSessionCode(code)

    const newPlayers: Player[] = []
    for (let i = 0; i < playerCount; i++) {
      newPlayers.push({
        id: i,
        name: localNames[i] || `Jugador ${i + 1}`,
        isImpostor: false,
        eliminated: false,
        votes: 0,
        votedFor: null
      })
    }

    const impostorIndices: number[] = []
    while (impostorIndices.length < impostorCount) {
      const idx = Math.floor(Math.random() * playerCount)
      if (!impostorIndices.includes(idx)) {
        impostorIndices.push(idx)
      }
    }

    newPlayers.forEach((p, i) => {
      if (impostorIndices.includes(i)) {
        p.isImpostor = true
      }
    })

    const selectedCat = categories.find(c => selectedCategories.includes(c.id))
    if (selectedCat) {
      setCategory(selectedCat.nombre)
    }

    const w = await fetchWord(selectedCategories)
    setWord(w)
    
    newPlayers.forEach((p) => {
      if (!p.isImpostor) {
        p.word = w
      }
    })

    setPlayers(newPlayers)
    setCurrentViewer(0)
    setShowWord(false)
    setAllViewed(false)
    setPhase('words')
  }

  const nextViewer = () => {
    if (currentViewer < players.length - 1) {
      setCurrentViewer(currentViewer + 1)
      setShowWord(false)
    } else {
      setAllViewed(true)
    }
  }

  // Cuando todos han visto la palabra, pasar a votaciones
  useEffect(() => {
    if (allViewed && phase === 'words') {
      setPhase('voting')
    }
  }, [allViewed, phase])

  const [currentVoterIndex, setCurrentVoterIndex] = useState(0)

  const handleVote = (targetPlayerId: number) => {
    // Obtener lista de jugadores activos
    const activePlayers = players.filter(p => !p.eliminated)
    
    // Obtener el jugador que está votando actualmente
    const voter = activePlayers[currentVoterIndex]
    
    if (!voter) {
      alert('Error: No se encontró el votante')
      return
    }
    
    // Verificar que no vote por sí mismo
    if (voter.id === targetPlayerId) {
      alert('No puedes votar por ti mismo')
      return
    }
    
    // Verificar que no haya votado ya
    if (voter.votedFor !== null) {
      alert(`${voter.name} ya votó`)
      return
    }
    
    // Registrar el voto
    setPlayers(prev => prev.map(p => {
      if (p.id === voter.id) {
        return { ...p, votedFor: targetPlayerId }
      }
      if (p.id === targetPlayerId) {
        return { ...p, votes: p.votes + 1 }
      }
      return p
    }))
    
    // Buscar el siguiente jugador activo que no haya votado
    // Trabajamos con índices de activePlayers
    let nextActiveIndex = (currentVoterIndex + 1) % activePlayers.length
    let checkedCount = 0
    
    while (checkedCount < activePlayers.length) {
      const nextPlayer = activePlayers[nextActiveIndex]
      // Recargar players desde el estado actual para verificar votedFor actualizado
      const nextPlayerUpdated = players.find(p => p.id === nextPlayer.id)
      if (nextPlayerUpdated && nextPlayerUpdated.votedFor === null) {
        break
      }
      nextActiveIndex = (nextActiveIndex + 1) % activePlayers.length
      checkedCount++
    }
    
    setCurrentVoterIndex(nextActiveIndex)
    
    // Verificar si todos los jugadores activos ya votaron
    const updatedActivePlayers = players.filter(p => !p.eliminated)
    const allVoted = updatedActivePlayers.every(p => p.votedFor !== null)
    
    if (allVoted) {
      setTimeout(() => {
        alert('Todos han votado. Haz clic en "Eliminar sospechoso" para continuar.')
      }, 100)
    } else {
      const nextVoter = activePlayers[nextActiveIndex]
      if (nextVoter) {
        setTimeout(() => {
          alert(`${nextVoter.name}, es tu turno de votar`)
        }, 100)
      }
    }
  }

  const handleEliminate = async () => {
    const activePlayers = players.filter(p => !p.eliminated)
    const maxVotes = Math.max(...activePlayers.map(p => p.votes))
    const candidates = activePlayers.filter(p => p.votes === maxVotes)
    
    if (candidates.length > 1) {
      alert('Empate en votos. Nadie es eliminado.')
      setPlayers(prev => prev.map(p => ({ ...p, votes: 0, votedFor: null })))
      setCurrentVoterIndex(0)
      setRound(prev => prev + 1)
      return
    }

    const eliminated = candidates[0]
    
    const impostorsRemaining = players.filter(p => p.isImpostor && !p.eliminated && p.id !== eliminated.id).length
    const citizensRemaining = players.filter(p => !p.isImpostor && !p.eliminated && p.id !== eliminated.id).length
    
    if (impostorsRemaining === 1 && citizensRemaining === 1) {
      setPlayers(prev => prev.map(p => 
        p.id === eliminated.id ? { ...p, eliminated: true } : p
      ))
      setPhase('result')
      return
    }

    if (eliminated.isImpostor && impostorsRemaining === 0) {
      setPlayers(prev => prev.map(p => 
        p.id === eliminated.id ? { ...p, eliminated: true } : p
      ))
      setPhase('result')
      return
    }

    if (citizensRemaining === 0) {
      setPlayers(prev => prev.map(p => 
        p.id === eliminated.id ? { ...p, eliminated: true } : p
      ))
      setPhase('result')
      return
    }

    setPlayers(prev => prev.map(p => 
      p.id === eliminated.id ? { ...p, eliminated: true } : p
    ))
    setPlayers(prev => prev.map(p => ({ ...p, votes: 0, votedFor: null })))
    setCurrentVoterIndex(0)
    setRound(prev => prev + 1)
  }

  const saveStats = async (gano: boolean, rol: string, publicarEnNostr: boolean = false, notaNostrId?: string) => {
    if (!user?.npub) return
    
    try {
      const impostorCount = players.filter(p => p.isImpostor).length
      
      const statsData = {
        npub: user.npub,
        gano,
        rol,
        palabra: word,
        categoria: category,
        jugadores: players.length,
        impostores: impostorCount,
        publicadaNostr: publicarEnNostr,
        notaNostrId: notaNostrId || null,
        fecha: new Date().toISOString()
      }
      
      const existingStats = JSON.parse(localStorage.getItem('impostor-stats') || '[]')
      existingStats.push(statsData)
      localStorage.setItem('impostor-stats', JSON.stringify(existingStats))
      
      const globalStats = JSON.parse(localStorage.getItem('impostor-global-stats') || '{"totalPartidas":0,"totalImpostores":0,"totalCiudadanos":0}')
      globalStats.totalPartidas++
      globalStats.totalImpostores += impostorCount
      globalStats.totalCiudadanos += players.length - impostorCount
      localStorage.setItem('impostor-global-stats', JSON.stringify(globalStats))
      
    } catch (error) {
      console.error('Error saving stats:', error)
    }
  }

  const copyCode = () => {
    navigator.clipboard.writeText(sessionCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handlePublishResult = async () => {
    if (!privateKey) {
      alert('Necesitas estar logueado para publicar')
      return
    }

    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      const impostorsWon = players.filter(p => p.isImpostor && !p.eliminated).length > 0
      const winner = impostorsWon ? 'Impostor' : 'Ciudadanos'
      const myPlayer = players[0]
      const gano = impostorsWon ? myPlayer.isImpostor : !myPlayer.isImpostor
      const rol = myPlayer.isImpostor ? 'Impostor' : 'Ciudadano'
      
      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['t', 'impostor-game']],
        content: `🎮 Partida de Impostor.Nos\n🏆 Ganador: ${winner}\n👥 Jugadores: ${players.length}\n👤 Impostores: ${players.filter(p => p.isImpostor).length}\n🎯 Mi resultado: ${gano ? 'GANÉ' : 'PERDÍ'} como ${rol}`
      }

      const signed = finalizeEvent(event, Buffer.from(privateKey, 'hex'))
      const activeRelays = useUserStore.getState().relays.filter(r => r.active).map(r => r.url)
      
      if (activeRelays.length === 0) {
        alert('No hay relays activos')
        return
      }
      
      // Filtrar solo los relays que funcionan
      const workingRelays: string[] = []
      for (const url of activeRelays) {
        try {
          await pool.ensureRelay(url)
          workingRelays.push(url)
        } catch (e) {
          console.log('Game: Relay no disponible:', url)
        }
      }
      
      if (workingRelays.length === 0) {
        alert('No se pudo conectar a ningún relay')
        return
      }
      
      console.log('Game: Publicando a relays funcionales:', workingRelays)
      
      // Publicar a todos los relays funcionales
      await pool.publish(workingRelays, signed)
      console.log('Game: Resultado publicado con ID:', signed.id)

      // Guardar en BD con publicación a Nostr
      await saveStats(gano, myPlayer.isImpostor ? 'impostor' : 'ciudadano', true, signed.id)
      setStatsSaved(true)

      alert('¡Resultado publicado en Nostr y guardado en estadísticas!')
    } catch (error) {
      console.error('Error publishing:', error)
      alert('Error al publicar resultado')
    }
  }

  const resetGame = () => {
    setPhase('setup')
    setPlayers([])
    setRound(1)
    setCurrentViewer(0)
    setShowWord(false)
    setAllViewed(false)
    setStatsSaved(false)
  }

  const cancelGame = () => {
    if (phase === 'setup') {
      resetGame()
      return
    }
    
    const confirmar = window.confirm('¿Estás seguro de que quieres anular esta partida? Se perderá todo el progreso.')
    if (confirmar) {
      resetGame()
    }
  }

  if (phase === 'setup') {
    return (
      <div className="min-h-screen">
        <Navbar />
        
        <main className="max-w-2xl mx-auto p-4 pt-20 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Nueva Partida</h1>
            <button
              onClick={() => setShowRules(true)}
              className="flex items-center gap-2 text-theme-primary hover:opacity-80"
            >
              <HelpCircle size={20} />
              Reglas
            </button>
          </div>

          <div className="bg-theme-bg rounded-lg p-6 space-y-6">
            <div>
              <label className="flex items-center gap-2 mb-3 text-lg font-semibold">
                <UsersIcon size={20} />
                Jugadores
              </label>
              <input
                type="number"
                min={3}
                max={20}
                value={playerCount}
                onChange={(e) => {
                  const value = Math.max(3, Math.min(20, Number(e.target.value) || 3))
                  setPlayerCount(value)
                  if (impostorCount >= value) {
                    setImpostorCount(value - 1)
                  }
                }}
                className="w-full px-4 py-2 bg-theme-bg rounded-lg focus:outline-none focus:border-theme-primary"
              />
              <p className="text-sm text-theme-accent mt-1">
                Mínimo 3, máximo 20 jugadores
              </p>
            </div>

            <div>
              <label className="flex items-center gap-2 mb-3 text-lg font-semibold">
                <UserMinus size={20} />
                Impostores
              </label>
              <input
                type="number"
                min={1}
                max={playerCount - 1}
                value={impostorCount}
                onChange={(e) => {
                  const value = Math.max(1, Math.min(playerCount - 1, Number(e.target.value) || 1))
                  setImpostorCount(value)
                }}
                className="w-full px-4 py-2 bg-theme-bg rounded-lg focus:outline-none focus:border-theme-primary"
              />
              <p className="text-sm text-theme-accent mt-1">
                Mínimo 1, máximo {playerCount - 1} (siempre habrá al menos 1 ciudadano)
              </p>
            </div>

            <div>
              <label className="block mb-3 text-lg font-semibold">
                Modo de juego
              </label>
              <div className="flex gap-2">
                <button className="flex-1 py-2 px-4 rounded-lg bg-theme-primary">
                  🎮 Local
                </button>
                <button className="flex-1 py-2 px-4 rounded-lg bg-theme-bg opacity-50 cursor-not-allowed flex items-center justify-center gap-2">
                  <Lock size={16} />
                  Online
                </button>
              </div>
              <p className="text-xs text-theme-accent mt-2">
                Próximamente: Modo Online
              </p>
            </div>

            <div>
              <label className="block mb-3 text-lg font-semibold">
                Nombres de jugadores
              </label>
              {localNames.slice(0, playerCount).map((name, i) => (
                <input
                  key={i}
                  type="text"
                  value={name}
                  onChange={(e) => {
                    const newNames = [...localNames]
                    newNames[i] = e.target.value
                    setLocalNames(newNames)
                  }}
                  placeholder={`Jugador ${i + 1}`}
                  className="w-full mb-2 px-4 py-2 bg-theme-bg rounded-lg focus:outline-none focus:border-theme-primary"
                />
              ))}
            </div>

            <div>
              <label className="block mb-3 text-lg font-semibold">
                Categorías
              </label>
              <div className="flex flex-wrap gap-2">
                {categories.map((cat) => (
                  <button
                    key={cat.id}
                    onClick={() => toggleCategory(cat.id)}
                    className={`px-4 py-2 rounded-lg ${
                      selectedCategories.includes(cat.id)
                        ? 'bg-theme-primary'
                        : 'bg-theme-bg hover:opacity-80'
                    }`}
                  >
                    {cat.nombre}
                  </button>
                ))}
              </div>
              <button
                onClick={() => setSelectedCategories(categories.map(c => c.id))}
                className="text-sm text-theme-primary mt-2 hover:underline"
              >
                Seleccionar todas
              </button>
            </div>

            <button
              onClick={handleStartGame}
              className="w-full py-4 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold flex items-center justify-center gap-2"
            >
              <Play size={24} />
              ¡REPARTIR!
            </button>
          </div>

          {showRules && (
            <div className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50">
              <div className="bg-theme-bg rounded-lg p-6 max-w-lg w-full">
                <h2 className="text-2xl font-bold mb-4">REGLAS</h2>
                <ul className="space-y-3 text-theme-foreground">
                  <li>1. Todos los jugadores ven una palabra EXCEPTO el impostor</li>
                  <li>2. El impostor recibe la categoría como pista</li>
                  <li>3. Discutan y voten quién es el impostor</li>
                  <li>4. Si expulsan al impostor → ganan ciudadanos</li>
                  <li>5. Si el impostor sobrevive → gana el impostor</li>
                  <li>6. Si quedan 1 impostor + 1 ciudadano → impostor gana</li>
                  <li>7. Si quedan más impostores que ciudadanos → impostor gana</li>
                </ul>
                <button
                  onClick={() => setShowRules(false)}
                  className="w-full mt-6 py-3 bg-theme-primary hover:opacity-80 rounded-lg"
                >
                  Entendido
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    )
  }

  // Modo local - pasar dispositivo
  if (phase === 'words' && !allViewed) {
    const currentPlayer = players[currentViewer]
    
    return (
      <div className="min-h-screen">
        <Navbar />
        
        <main className="max-w-2xl mx-auto p-4 pt-20 space-y-6">
          <div className="bg-yellow-600 text-white p-4 rounded-lg flex items-center gap-2">
            <Smartphone size={24} />
            <span className="font-bold">Pasar dispositivo</span>
          </div>

          <div className="bg-theme-bg rounded-lg p-6 text-center">
            <h2 className="text-2xl font-bold mb-4">
              Turno de: {currentPlayer.name}
            </h2>

            <div className="bg-theme-bg rounded-lg p-6 mb-4">
              {showWord ? (
                <div>
                  <p className="text-theme-accent mb-2">
                    {currentPlayer.isImpostor ? 'Tu pista:' : 'Tu palabra:'}
                  </p>
                  <p className={`text-4xl font-bold ${
                    currentPlayer.isImpostor ? 'text-yellow-400' : 'text-theme-primary'
                  }`}>
                    {currentPlayer.isImpostor 
                      ? '❓ IMPOSTOR'
                      : currentPlayer.word}
                  </p>
                </div>
              ) : (
                <p className="text-theme-accent">Toca el botón para ver tu palabra</p>
              )}
            </div>

            {!showWord ? (
              <button
                onClick={() => setShowWord(true)}
                className="w-full py-4 bg-theme-primary hover:opacity-80 rounded-lg text-xl font-bold flex items-center justify-center gap-2"
              >
                <Eye size={24} />
                Ver palabra
              </button>
            ) : (
              <button
                onClick={nextViewer}
                className="w-full py-4 bg-green-600 hover:bg-green-700 rounded-lg text-xl font-bold"
              >
                Siguiente jugador →
              </button>
            )}
          </div>

          <div className="text-center text-theme-accent">
            Jugador {currentViewer + 1} de {players.length}
          </div>

          <button
            onClick={cancelGame}
            className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center gap-2"
          >
            <XCircle size={20} />
            Anular Partida
          </button>
        </main>
      </div>
    )
  }

  // Fase de voting
  if (phase === 'voting') {
    return (
      <div className="min-h-screen">
        <Navbar />
        
        <main className="max-w-2xl mx-auto p-4 pt-20 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-2xl font-bold">Ronda {round}</h1>
            <div className="flex items-center gap-2 bg-theme-bg px-3 py-1 rounded-lg">
              <span className="text-sm text-theme-accent">Código:</span>
              <span className="font-mono font-bold">{sessionCode}</span>
              <button onClick={copyCode} className="text-theme-primary">
                {copied ? <Check size={16} /> : <Copy size={16} />}
              </button>
            </div>
          </div>

          <div className="bg-yellow-600 text-white p-3 rounded-lg text-center">
            <span className="font-bold">Turno de votación: {players.filter(p => !p.eliminated)[currentVoterIndex]?.name}</span>
          </div>

          <div className="bg-theme-bg rounded-lg p-6">
            <h2 className="text-lg font-semibold mb-4">Jugadores</h2>
            <div className="space-y-2">
              {players.filter(p => !p.eliminated).map((player, index) => {
                const activePlayers = players.filter(p => !p.eliminated)
                const currentVoterPlayer = activePlayers[currentVoterIndex]
                const isCurrentVoter = player.id === currentVoterPlayer?.id
                const isSelf = currentVoterPlayer && player.id === currentVoterPlayer.id
                
                return (
                  <div
                    key={player.id}
                    className={`flex items-center justify-between p-3 rounded-lg ${
                      isCurrentVoter ? 'bg-yellow-700' : 'bg-theme-bg'
                    }`}
                  >
                    <span className="font-medium">
                      {player.name}
                      {player.votedFor !== null && <span className="ml-2 text-green-400 text-xs">✓ Votó</span>}
                      {isCurrentVoter && <span className="ml-2 text-yellow-300 text-xs">(Tu turno)</span>}
                    </span>
                    <button
                      onClick={() => handleVote(player.id)}
                      disabled={isSelf}
                      className="px-3 py-1 bg-red-600 hover:bg-red-700 disabled:bg-theme-bg disabled:cursor-not-allowed rounded text-sm"
                    >
                      Votar
                    </button>
                  </div>
                )
              })}
            </div>

            <button
              onClick={handleEliminate}
              className="w-full mt-4 py-3 bg-red-600 hover:bg-red-700 rounded-lg font-semibold"
            >
              Eliminar sospechoso
            </button>
          </div>

          <div className="bg-theme-bg rounded-lg p-4">
            <h3 className="font-semibold mb-2">Votos</h3>
            {players.filter(p => !p.eliminated).map((player) => (
              <div key={player.id} className="flex items-center gap-2 mb-1">
                <span className="w-24 truncate">{player.name}</span>
                <div className="flex-1 bg-theme-bg h-4 rounded overflow-hidden">
                  <div
                    className="h-full bg-theme-primary transition-all"
                    style={{ width: `${(player.votes / playerCount) * 100}%` }}
                  />
                </div>
                <span className="text-sm">{player.votes}</span>
              </div>
            ))}
          </div>

          <button
            onClick={cancelGame}
            className="w-full py-2 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center gap-2"
          >
            <XCircle size={20} />
            Anular Partida
          </button>
        </main>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <main className="max-w-2xl mx-auto p-4 pt-20 space-y-6">
        <div className="bg-theme-bg rounded-lg p-6 text-center">
          <h1 className="text-3xl font-bold mb-4">Resultado</h1>
          
          {impostorsWin ? (
            <div className="text-red-500">
              <p className="text-4xl mb-2">👤</p>
              <p className="text-2xl font-bold">¡GANAN LOS IMPOSTORES!</p>
              <p className="text-gray-400 mt-2">
                Impostores: {impostorsRemaining} | Ciudadanos: {citizensRemaining}
              </p>
            </div>
          ) : (
            <div className="text-green-500">
              <p className="text-4xl mb-2">🛡️</p>
              <p className="text-2xl font-bold">¡GANAN LOS CIUDADANOS!</p>
              <p className="text-gray-400 mt-2">
                Impostores: {impostorsRemaining} | Ciudadanos: {citizensRemaining}
              </p>
            </div>
          )}
        </div>

        <div className="bg-gray-800 rounded-lg p-4">
          <h3 className="font-semibold mb-3">Resumen</h3>
          <div className="space-y-2">
            {players.map((player) => (
              <div key={player.id} className="flex justify-between">
                <span>{player.name}</span>
                <span className={player.isImpostor ? 'text-red-400' : 'text-green-400'}>
                  {player.isImpostor ? '👤 Impostor' : '🛡️ Ciudadano'}
                  {player.eliminated && ' (Eliminado)'}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="flex gap-4">
          <button
            onClick={cancelGame}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 rounded-lg flex items-center justify-center gap-2"
          >
            <XCircle size={20} />
            Anular
          </button>
          
          <button
            onClick={resetGame}
            className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg flex items-center justify-center gap-2"
          >
            <RefreshCw size={20} />
            Nueva Partida
          </button>
          
          <button
            onClick={handlePublishResult}
            className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg flex items-center justify-center gap-2"
          >
            📤
            Publicar
          </button>
        </div>
      </main>
    </div>
  )
}
