'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useUserStore } from '@/stores/userStore'
import { encodePubkey } from '@/lib/nostr'
import { Heart, Repeat2, MessageCircle, Zap, Image, Send, Loader2, Reply, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

interface NostrEvent {
  id: string
  pubkey: string
  created_at: number
  content: string
  kind: number
  tags: string[][]
}

interface NostrProfile {
  name?: string
  display_name?: string
}

interface NoteWithReplies extends NostrEvent {
  replies: NoteWithReplies[]
  showReplies: boolean
}

interface ReplyThread {
  rootId: string
  comments: NoteWithReplies[]
}

const NOTES_PER_PAGE = 30

export default function Feed() {
  const [notes, setNotes] = useState<NoteWithReplies[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [replyTo, setReplyTo] = useState<NostrEvent | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [replyingToNoteId, setReplyingToNoteId] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [publishingReply, setPublishingReply] = useState(false)
  const [replyingToReplyId, setReplyingToReplyId] = useState<string | null>(null)
  const [replyToReplyContent, setReplyToReplyContent] = useState('')
  const [publishingReplyToReply, setPublishingReplyToReply] = useState(false)
  const [expandedReplies, setExpandedReplies] = useState<Set<string>>(new Set())
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { relays, privateKey, likedPosts, repostedPosts, toggleLike, toggleRepost, user } = useUserStore()
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const loadedIds = useRef<Set<string>>(new Set())
  const [profiles, setProfiles] = useState<Record<string, NostrProfile>>({})
  const [localUsernames, setLocalUsernames] = useState<Record<string, string>>({})
  const initialized = useRef(false)
  const prevNotesLength = useRef(0)

  const toggleExpandedReplies = (replyId: string) => {
    setExpandedReplies(prev => {
      const newSet = new Set(prev)
      if (newSet.has(replyId)) {
        newSet.delete(replyId)
      } else {
        newSet.add(replyId)
      }
      return newSet
    })
  }

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen debe ser menor a 5MB')
        return
      }
      
      const reader = new FileReader()
      reader.onloadend = () => {
        setSelectedImage(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const removeSelectedImage = () => {
    setSelectedImage(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // Función auxiliar para obtener relays funcionales
  const getWorkingRelays = async (pool: any, relayUrls: string[]): Promise<string[]> => {
    const working: string[] = []
    for (const url of relayUrls) {
      try {
        await pool.ensureRelay(url)
        working.push(url)
      } catch (e) {
        console.log('Feed: Relay no disponible:', url)
      }
    }
    return working
  }

  const fetchFromRelays = useCallback(async (reset: boolean = false, loadNewer: boolean = false) => {
    const activeRelays = relays.filter(r => r.active)
    
    if (activeRelays.length === 0) {
      setLoading(false)
      setLoadingMore(false)
      setHasMore(false)
      return
    }

    if (reset) {
      setLoading(true)
      loadedIds.current.clear()
    } else {
      setLoadingMore(true)
    }

    try {
      const { SimplePool } = await import('nostr-tools')
      const pool = new SimplePool()
      const relayUrls = activeRelays.map(r => r.url)

      console.log('Feed: Fetching from relays:', relayUrls, 'reset:', reset, 'newer:', loadNewer)

      // Intentar conectar a cada relay individualmente y filtrar los que funcionan
      const workingRelays: string[] = []
      for (const url of relayUrls) {
        try {
          await pool.ensureRelay(url)
          console.log('Feed: Connected to relay:', url)
          workingRelays.push(url)
        } catch (e) {
          console.error('Feed: Failed to connect to relay:', url)
        }
      }

      if (workingRelays.length === 0) {
        console.error('Feed: No working relays found')
        setLoading(false)
        setLoadingMore(false)
        setHasMore(false)
        return
      }

      // Construir filtro basado en si queremos más recientes o más antiguos
      const filter: any = { kinds: [1] }
      
      if (loadNewer && notes.length > 0) {
        // Cargar eventos más recientes que el último
        const newestTimestamp = Math.max(...notes.map(n => n.created_at))
        filter.since = newestTimestamp + 1
      } else if (!reset && notes.length > 0) {
        // Cargar eventos más antiguos
        const oldestTimestamp = Math.min(...notes.map(n => n.created_at))
        filter.until = oldestTimestamp - 1
      } else {
        filter.limit = NOTES_PER_PAGE
      }

      console.log('Feed: Querying from working relays:', workingRelays, 'filter:', JSON.stringify(filter))
      
      // Usar suscripción manual en lugar de querySync para mayor compatibilidad
      const events = await new Promise<NostrEvent[]>((resolve) => {
        const collectedEvents: NostrEvent[] = []
        const sub = pool.subscribe(workingRelays, filter, {
          onevent: (event: NostrEvent) => {
            collectedEvents.push(event)
          },
          oneose: () => {
            sub.close()
            resolve(collectedEvents)
          }
        })
        
        // Timeout
        setTimeout(() => {
          sub.close()
          resolve(collectedEvents)
        }, 10000)
      })

      console.log('Feed: Got events:', events?.length || 0)

      // Determine if there might be more posts BEFORE filtering duplicates
      const isLoadingOlder = !reset && !loadNewer && notes.length > 0
      const hasMoreEvents = events && events.length >= NOTES_PER_PAGE
      
      if (!events || events.length === 0) {
        setLoading(false)
        setLoadingMore(false)
        setHasMore(false)
        return
      }

      // Only set hasMore to false if we're loading older posts and got fewer than requested
      setLoading(false)
      setLoadingMore(false)
      
      // Set hasMore based on events received from relays (before filtering duplicates)
      if (isLoadingOlder || reset) {
        setHasMore(hasMoreEvents)
      }

      console.log('Feed: Setting notes:', events.length)

      // Separar posts principales de comentarios
      // Un post principal es kind:1 sin tag 'e' apuntando a otro post kind:1
      const allEvents = events.filter(e => !loadedIds.current.has(e.id))
      
      // Encontrar IDs de posts principales (los que NO son respuestas a otros)
      const rootEventIds = new Set<string>()
      const replyEventIds = new Set<string>()
      
      allEvents.forEach(e => {
        const eTag = e.tags.find(t => t[0] === 'e' && t[1])
        if (eTag) {
          // Es una respuesta - buscar si el evento referenciado existe en nuestra lista
          const parentExists = allEvents.some(ev => ev.id === eTag[1])
          if (parentExists) {
            // Es respuesta a otro evento en la lista - es comentario anidado
            replyEventIds.add(e.id)
          } else {
            // Es respuesta a un evento que NO está en la lista - es comentario de post externo
            rootEventIds.add(e.id)
          }
        } else {
          // No tiene tag 'e' - es post principal
          rootEventIds.add(e.id)
        }
      })

      // Los posts principales son los que NO están en replyEventIds
      const mainPosts = allEvents.filter(e => !replyEventIds.has(e.id))
      console.log('Feed: Main posts:', mainPosts.length, 'Replies:', allEvents.length - mainPosts.length)

      // Función para construir árbol de comentarios
      const buildReplyTree = (parentId: string, allEvents: NostrEvent[]): NoteWithReplies[] => {
        const children = allEvents.filter(e => {
          const eTag = e.tags.find(t => t[0] === 'e' && t[1] === parentId)
          return !!eTag
        })
        return children.map(child => ({
          ...child,
          replies: buildReplyTree(child.id, allEvents),
          showReplies: false
        })).sort((a, b) => a.created_at - b.created_at)
      }

      // Construir posts con sus comentarios
      const newEvents: NoteWithReplies[] = mainPosts
        .sort((a, b) => b.created_at - a.created_at)
        .map(post => ({
          ...post,
          replies: buildReplyTree(post.id, allEvents),
          showReplies: false
        }))

      newEvents.forEach(e => {
        loadedIds.current.add(e.id)
        // También marcar los comentarios como cargados
        e.replies.forEach(r => loadedIds.current.add(r.id))
      })

      if (reset) {
        console.log('Feed: setNotes with reset, count:', newEvents.length)
        setNotes(newEvents)
      } else if (loadNewer) {
        // Agregar nuevos eventos al inicio
        setNotes(prev => {
          const existingIds = new Set(prev.map(n => n.id))
          const uniqueNew = newEvents.filter(e => !existingIds.has(e.id))
          return [...uniqueNew, ...prev]
        })
      } else {
        // Agregar eventos más antiguos al final
        setNotes(prev => {
          const existingIds = new Set(prev.map(n => n.id))
          const uniqueNew = newEvents.filter(e => !existingIds.has(e.id))
          return [...prev, ...uniqueNew]
        })
      }

      setLoading(false)
      setLoadingMore(false)
      
      const pubkeys = [...new Set(events.map(e => e.pubkey))]
      fetchProfiles(pubkeys)
      
      // Obtener npubs para buscar usernames locales
      const { encodePubkey } = await import('@/lib/nostr')
      const npubs = pubkeys.map(pk => {
        try {
          return encodePubkey(pk)
        } catch {
          return null
        }
      }).filter(Boolean) as string[]
      fetchLocalUsernames(npubs)
      
    } catch (err) {
      console.error('Error fetching notes:', err)
      setLoading(false)
      setLoadingMore(false)
      setHasMore(false)
    }
  }, [relays, notes])

  const fetchLocalUsernames = async (npubs: string[]) => {
    const npubsToFetch = npubs.filter(npub => !localUsernames[npub])
    if (npubsToFetch.length === 0) return

    try {
      const response = await fetch('/api/users/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ npubs: npubsToFetch })
      })
      
      if (response.ok) {
        const data = await response.json()
        setLocalUsernames(prev => ({ ...prev, ...data.users }))
      }
    } catch (err) {
      console.error('Error fetching local usernames:', err)
    }
  }

  const fetchProfiles = async (pubkeys: string[]) => {
    const activeRelays = relays.filter(r => r.active)
    if (activeRelays.length === 0) return

    const pubkeysToFetch = pubkeys.filter(pk => !profiles[pk])
    if (pubkeysToFetch.length === 0) return

    try {
      const { SimplePool } = await import('nostr-tools')
      const pool = new SimplePool()
      const relayUrls = activeRelays.map(r => r.url)

      const workingRelays: string[] = []
      for (const url of relayUrls) {
        try {
          await pool.ensureRelay(url)
          workingRelays.push(url)
        } catch (e) {
          console.log('Feed: Relay no disponible para perfiles:', url)
        }
      }

      if (workingRelays.length === 0) {
        console.log('Feed: No hay relays disponibles para perfiles')
        return
      }

      const profileEvents = await pool.querySync(workingRelays, {
        kinds: [0],
        authors: pubkeysToFetch
      })

      const newProfiles: Record<string, NostrProfile> = {}
      profileEvents.forEach(e => {
        try {
          newProfiles[e.pubkey] = JSON.parse(e.content)
        } catch {}
      })

      setProfiles(prev => ({ ...prev, ...newProfiles }))
      
      setTimeout(() => {
        try { pool.close(workingRelays) } catch (e) {}
      }, 2000)
    } catch (err) {
      console.error('Error fetching profiles:', err)
    }
  }

  useEffect(() => {
    if (initialized.current) {
      console.log('Feed: Already initialized, skipping')
      return
    }
    initialized.current = true
    
    console.log('Feed: First mount, fetching notes...')
    const activeRelays = relays.filter(r => r.active)
    if (activeRelays.length > 0) {
      fetchFromRelays(true)
    }

    // Intervalo para buscar nuevos eventos cada 10 segundos
    const interval = setInterval(() => {
      const activeRelays = relays.filter(r => r.active)
      if (activeRelays.length > 0) {
        console.log('Feed: Checking for new notes...')
        fetchFromRelays(false, true) // false = no reset, true = load newer
      }
    }, 10000)

    return () => {
      console.log('Feed: Unmounting, clearing interval')
      clearInterval(interval)
    }
  }, [])

  const handleRefresh = () => {
    fetchFromRelays(true, false)
  }

  const loadMore = () => {
    if (loadingMore || !hasMore || loading) return
    setLoadingMore(true)
    fetchFromRelays(false, false)
  }

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore()
        }
      },
      { threshold: 0.1 }
    )

    if (loadMoreRef.current) {
      observer.observe(loadMoreRef.current)
    }

    return () => observer.disconnect()
  }, [hasMore, loadingMore, loading, notes.length])

  const checkUserVoted = async (noteId: string, kind: number): Promise<boolean> => {
    if (!user?.publicKey) return false
    
    try {
      const { SimplePool } = await import('nostr-tools')
      const pool = new SimplePool()
      const activeRelays = relays.filter(r => r.active)
      if (activeRelays.length === 0) return false
      
      const relayUrls = activeRelays.map(r => r.url)
      
      // Buscar si el usuario ya votó este post
      const events = await pool.querySync(relayUrls, {
        kinds: [kind],
        '#e': [noteId],
        authors: [user.publicKey],
        limit: 1
      })

      setTimeout(() => { try { pool.close(relayUrls) } catch (e) {} }, 2000)
      
      return events.length > 0
    } catch (e) {
      console.error('Error checking vote:', e)
      return false
    }
  }

  // Verifica si el usuario ya dio like a CUALQUIER post (solo para kind 7)
  const checkUserVotedAny = async (excludeNoteId: string, kind: number): Promise<boolean> => {
    if (!user?.publicKey) return false
    
    try {
      const { SimplePool } = await import('nostr-tools')
      const pool = new SimplePool()
      const activeRelays = relays.filter(r => r.active)
      if (activeRelays.length === 0) return false
      
      const relayUrls = activeRelays.map(r => r.url)
      
      // Buscar cualquier like del usuario
      const events = await pool.querySync(relayUrls, {
        kinds: [kind],
        authors: [user.publicKey],
        limit: 1
      })

      setTimeout(() => { try { pool.close(relayUrls) } catch (e) {} }, 2000)
      
      return events.length > 0
    } catch (e) {
      console.error('Error checking any vote:', e)
      return false
    }
  }

  const handleLike = async (noteId: string, notePubkey: string) => {
    if (!privateKey || !user) return

    // Verificar si ya dio like
    if (likedPosts.has(noteId)) {
      alert('Ya diste like a este post')
      return
    }
    
    // Verificar en el relay si ya votó (a cualquier post)
    const alreadyVoted = await checkUserVotedAny(noteId, 7)
    if (alreadyVoted) {
      alert('Ya diste like a este post')
      return
    }
    
    toggleLike(noteId)
    
    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      const event = {
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['e', noteId]],
        content: '+'
      }

      const signed = finalizeEvent(event, Buffer.from(privateKey, 'hex'))
      const activeRelays = relays.filter(r => r.active).map(r => r.url)
      
      if (activeRelays.length === 0) return
      
      const workingRelays = await getWorkingRelays(pool, activeRelays)
      if (workingRelays.length > 0) {
        await pool.publish(workingRelays, signed)
      }
    } catch (error) {
      console.error('Error liking:', error)
      toggleLike(noteId)
    }
  }

  const handleRepost = async (note: NostrEvent) => {
    if (!privateKey || !user) return

    // Verificar que no se haya repostado ya
    if (repostedPosts.has(note.id)) {
      alert('Ya reposteaste esta nota')
      return
    }

    // Verificar en el relay si ya reposteó (a cualquier post)
    const alreadyReposted = await checkUserVotedAny(note.id, 1)
    if (alreadyReposted) {
      alert('Ya reposteaste esta nota')
      return
    }

    toggleRepost(note.id)
    
    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      
      // Crear un quote repost (kind 1 con referencia al original)
      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', note.id, '', 'mention'],
          ['p', note.pubkey]
        ],
        content: `🔄 Reposteo de ${formatPubkey(note.pubkey)}:\n\n${note.content}`
      }

      const signed = finalizeEvent(event, Buffer.from(privateKey, 'hex'))
      const activeRelays = relays.filter(r => r.active).map(r => r.url)
      
      if (activeRelays.length === 0) {
        alert('No hay relays activos')
        toggleRepost(note.id)
        return
      }
      
      const workingRelays = await getWorkingRelays(pool, activeRelays)
      if (workingRelays.length > 0) {
        await pool.publish(workingRelays, signed)

        // Agregar el repost al feed inmediatamente
        const newRepost: NoteWithReplies = { ...signed, replies: [], showReplies: false }
        setNotes(prev => [newRepost, ...prev])
        loadedIds.current.add(signed.id)
        
        if (user?.username) {
          setProfiles(prev => ({
            ...prev,
            [user.publicKey]: { name: user.username }
          }))
        }
        
        console.log('Repost publicado:', signed.id)
      } else {
        alert('No se pudo conectar a ningún relay')
        toggleRepost(note.id)
      }
    } catch (error) {
      console.error('Error reposting:', error)
      toggleRepost(note.id)
      alert('Error al repostear')
    }
  }

  const handleReply = (note: NostrEvent) => {
    setReplyTo(note)
    setNewNote(`Replying to ${note.id.slice(0, 8)}... `)
  }

  const handlePublish = async () => {
    if ((!newNote.trim() && !selectedImage) || !privateKey) return

    setPublishing(true)

    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      
      const tags: string[][] = []
      if (replyTo) {
        tags.push(['e', replyTo.id])
        tags.push(['p', replyTo.pubkey])
      }

      // Construir contenido con imagen si existe
      let content = newNote
      if (selectedImage) {
        content = content ? `${content}\n\n${selectedImage}` : selectedImage
      }

      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: content
      }

      const signed = finalizeEvent(event, Buffer.from(privateKey, 'hex'))
      const activeRelays = relays.filter(r => r.active).map(r => r.url)
      
      if (activeRelays.length === 0) {
        alert('No hay relays activos')
        setPublishing(false)
        return
      }
      
      const workingRelays = await getWorkingRelays(pool, activeRelays)
      if (workingRelays.length > 0) {
        await pool.publish(workingRelays, signed)

        setNewNote('')
        setReplyTo(null)
        setSelectedImage(null)
        if (fileInputRef.current) {
          fileInputRef.current.value = ''
        }
        loadedIds.current.add(signed.id)
        const newNoteWithReplies: NoteWithReplies = { ...signed, replies: [], showReplies: false }
        setNotes(prev => [newNoteWithReplies, ...prev])
        
        if (user?.username) {
          setProfiles(prev => ({
            ...prev,
            [user.publicKey]: { name: user.username }
          }))
        }
        
        console.log('Nota publicada:', signed.id)
      } else {
        alert('No se pudo conectar a ningún relay')
      }
    } catch (error) {
      console.error('Error publishing:', error)
      alert('Error al publicar')
    } finally {
      setPublishing(false)
    }
  }

  const cancelReply = () => {
    setReplyTo(null)
    setNewNote('')
  }

  const getProfileName = (pk: string) => {
    // Primero verificar si es el usuario actual
    if (user?.publicKey === pk && user?.username) {
      return user.username
    }
    
    // Luego verificar en la base de datos local (username registrado en la app)
    try {
      const npub = encodePubkey(pk)
      if (localUsernames[npub]) {
        return localUsernames[npub]
      }
    } catch {
      // Si no se puede encodear, continuar con otros métodos
    }
    
    // Luego verificar en los perfiles de Nostr
    const profile = profiles[pk]
    if (profile?.display_name) return profile.display_name
    if (profile?.name) return profile.name
    
    return null
  }

  const formatPubkey = (pk: string) => {
    const profileName = getProfileName(pk)
    if (profileName) return profileName
    
    try {
      return encodePubkey(pk).slice(0, 16) + '...'
    } catch {
      return pk?.slice(0, 16) + '...' || 'Unknown'
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleString()
  }

  const fetchReplies = useCallback(async (noteId: string): Promise<NoteWithReplies[]> => {
    const activeRelays = relays.filter(r => r.active)
    if (activeRelays.length === 0) return []

    try {
      const { SimplePool } = await import('nostr-tools')
      const pool = new SimplePool()
      const relayUrls = activeRelays.map(r => r.url)

      // Buscar TODOS los eventos kind 1 que referencian a esta nota
      const events = await pool.querySync(relayUrls, {
        kinds: [1],
        '#e': [noteId],
        limit: 100
      })

      setTimeout(() => {
        try { pool.close(relayUrls) } catch (e) {}
      }, 2000)

      console.log('Feed: Fetched replies for', noteId, ':', events.length)

      const eventsWithReplies: NoteWithReplies[] = events.map(e => ({
        ...e,
        replies: [],
        showReplies: false
      }))

      // Construir árbol de respuestas - cada evento puede tener respuestas
      const buildTree = (parentId: string): NoteWithReplies[] => {
        const children = eventsWithReplies.filter(e => {
          // Buscar el primer tag 'e' que no sea la referencia al post original
          const eTag = e.tags.find(t => t[0] === 'e' && t[1] === parentId)
          return !!eTag
        })
        
        return children.map(child => ({
          ...child,
          replies: buildTree(child.id),
          showReplies: false
        })).sort((a, b) => a.created_at - b.created_at)
      }

      // Las respuestas directas son las que tienen tag e pointing directly a noteId
      const directReplies = eventsWithReplies.filter(e => {
        const eTag = e.tags.find(t => t[0] === 'e' && t[1] === noteId)
        return !!eTag
      })

      // Construir árbol para cada respuesta directa
      const directWithTree = directReplies.map(reply => ({
        ...reply,
        replies: buildTree(reply.id),
        showReplies: false
      }))

      console.log('Feed: Direct replies with tree:', directWithTree.length)
      return directWithTree.sort((a, b) => a.created_at - b.created_at)
    } catch (err) {
      console.error('Error fetching replies:', err)
      return []
    }
  }, [relays])

  const toggleReplies = async (noteId: string) => {
    const noteIndex = notes.findIndex(n => n.id === noteId)
    if (noteIndex === -1) return

    const note = notes[noteIndex]
    
    if (!note.showReplies && note.replies.length === 0) {
      const replies = await fetchReplies(noteId)
      setNotes(prev => prev.map(n => 
        n.id === noteId ? { ...n, replies, showReplies: true } : n
      ))
    } else {
      setNotes(prev => prev.map(n => 
        n.id === noteId ? { ...n, showReplies: !n.showReplies } : n
      ))
    }
  }

  const handleOpenReplyInput = (note: NostrEvent) => {
    setReplyingToNoteId(note.id)
    setReplyContent('')
  }

  const handleOpenReplyToReplyInput = (reply: NostrEvent, parentNoteId: string) => {
    setReplyingToReplyId(reply.id)
    setReplyToReplyContent('')
  }

  const handleCloseReplyInput = () => {
    setReplyingToNoteId(null)
    setReplyContent('')
  }

  const handleCloseReplyToReplyInput = () => {
    setReplyingToReplyId(null)
    setReplyToReplyContent('')
  }

  const handlePublishReply = async (parentNote: NostrEvent) => {
    if (!replyContent.trim() || !privateKey) return

    setPublishingReply(true)

    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      
      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', parentNote.id],
          ['p', parentNote.pubkey]
        ],
        content: replyContent
      }

      const signed = finalizeEvent(event, Buffer.from(privateKey, 'hex'))
      const activeRelays = relays.filter(r => r.active).map(r => r.url)
      
      if (activeRelays.length === 0) {
        alert('No hay relays activos')
        setPublishingReply(false)
        return
      }
      
      const workingRelays = await getWorkingRelays(pool, activeRelays)
      if (workingRelays.length > 0) {
        console.log('Feed: Publishing reply to relays:', workingRelays)
        await pool.publish(workingRelays, signed)
        console.log('Feed: Reply published:', signed.id)

        const newReply: NoteWithReplies = { ...signed, replies: [], showReplies: false } as NoteWithReplies
        
        setNotes(prev => prev.map(n => 
          n.id === parentNote.id 
            ? { ...n, replies: [...n.replies, newReply], showReplies: true } 
            : n
        ))

        if (user?.username) {
          setProfiles(prev => ({
            ...prev,
            [user.publicKey]: { name: user.username }
          }))
        }

        handleCloseReplyInput()
      } else {
        alert('No se pudo conectar a ningún relay')
      }
    } catch (error) {
      console.error('Error publishing reply:', error)
      alert('Error al publicar respuesta')
    } finally {
      setPublishingReply(false)
    }
  }

  const addReplyToTree = (replies: NoteWithReplies[], parentId: string, newReply: NoteWithReplies): NoteWithReplies[] => {
    return replies.map(r => {
      if (r.id === parentId) {
        return { ...r, replies: [...r.replies, newReply], showReplies: true }
      }
      if (r.replies.length > 0) {
        return { ...r, replies: addReplyToTree(r.replies, parentId, newReply) }
      }
      return r
    })
  }

  const handlePublishReplyToReply = async (parentNote: NostrEvent, originalNoteId: string) => {
    if (!replyToReplyContent.trim() || !privateKey) return

    setPublishingReplyToReply(true)

    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      
      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', originalNoteId],
          ['e', parentNote.id],
          ['p', parentNote.pubkey]
        ],
        content: replyToReplyContent
      }

      const signed = finalizeEvent(event, Buffer.from(privateKey, 'hex'))
      const activeRelays = relays.filter(r => r.active).map(r => r.url)
      
      if (activeRelays.length === 0) {
        alert('No hay relays activos')
        setPublishingReplyToReply(false)
        return
      }
      
      const workingRelays = await getWorkingRelays(pool, activeRelays)
      if (workingRelays.length > 0) {
        await pool.publish(workingRelays, signed)

        const newReply: NoteWithReplies = { ...signed, replies: [], showReplies: false } as NoteWithReplies
        
        setNotes(prev => prev.map(n => {
          if (n.id === originalNoteId) {
            return { ...n, replies: addReplyToTree(n.replies, parentNote.id, newReply), showReplies: true }
          }
          return n
        }))

        if (user?.username) {
          setProfiles(prev => ({
            ...prev,
            [user.publicKey]: { name: user.username }
          }))
        }

        handleCloseReplyToReplyInput()
      } else {
        alert('No se pudo conectar a ningún relay')
      }
    } catch (error) {
      console.error('Error publishing reply to reply:', error)
      alert('Error al publicar respuesta')
    } finally {
      setPublishingReplyToReply(false)
    }
  }

  // Componente para mostrar respuestas de una nota con compresión
  const NoteReplies = ({ note, renderReply }: { note: NoteWithReplies, renderReply: (r: NoteWithReplies, pid: string, d: number) => React.ReactNode }) => {
    const [showAll, setShowAll] = useState(false)
    const visibleReplies = showAll ? note.replies : note.replies.slice(0, 2)
    const hiddenCount = note.replies.length - 2

    return (
      <div className="mt-4 pt-3 border-t border-gray-700 space-y-3">
        {visibleReplies.map((reply) => renderReply(reply, note.id, 0))}
        
        {!showAll && hiddenCount > 0 && (
          <button
            onClick={() => setShowAll(true)}
            className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300 py-2"
          >
            <ChevronDown size={16} />
            Ver {hiddenCount} {hiddenCount === 1 ? 'comentario' : 'comentarios'} más
          </button>
        )}
        
        {showAll && note.replies.length > 2 && (
          <button
            onClick={() => setShowAll(false)}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-300 py-2"
          >
            <ChevronUp size={16} />
            Mostrar menos
          </button>
        )}
      </div>
    )
  }

  const renderReply = (reply: NoteWithReplies, parentNoteId: string, depth: number = 0) => {
    const maxDepth = 3
    const canReply = depth < maxDepth
    const isLiked = likedPosts.has(reply.id)
    const isReposted = repostedPosts.has(reply.id)
    const isExpanded = expandedReplies.has(reply.id)
    
    // Para threads comprimidos - mostrar solo 2 respuestas inicialmente
    const repliesToShow = isExpanded ? reply.replies : reply.replies.slice(0, 2)
    const hiddenRepliesCount = reply.replies.length - 2

    return (
      <div key={reply.id} className="bg-gray-700 rounded-lg p-3 ml-4">
        <div className="flex items-center gap-2 mb-2">
          <div className="w-8 h-8 bg-purple-500 rounded-full flex items-center justify-center">
            <span className="text-xs font-bold">
              {reply.pubkey?.slice(0, 2).toUpperCase() || '??'}
            </span>
          </div>
          <div>
            <p className="font-semibold text-sm">{formatPubkey(reply.pubkey)}</p>
            <p className="text-xs text-gray-400">{formatDate(reply.created_at)}</p>
          </div>
        </div>
        <p className="text-white text-sm whitespace-pre-wrap">{reply.content}</p>
        
        <div className="flex gap-4 mt-2">
          <button 
            onClick={() => handleLike(reply.id, reply.pubkey)}
            className={`flex items-center gap-1 text-xs ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
          >
            <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
          </button>
          <button 
            onClick={() => handleRepost(reply)}
            className={`flex items-center gap-1 text-xs ${isReposted ? 'text-green-500' : 'text-gray-400 hover:text-green-500'}`}
          >
            <Repeat2 size={14} />
          </button>
          {canReply && (
            <button 
              onClick={() => handleOpenReplyToReplyInput(reply, parentNoteId)}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500"
            >
              <MessageCircle size={14} />
              Responder
            </button>
          )}
        </div>

        {replyingToReplyId === reply.id && (
          <div className="mt-2">
            <textarea
              value={replyToReplyContent}
              onChange={(e) => setReplyToReplyContent(e.target.value)}
              placeholder="Escribe tu respuesta..."
              className="w-full bg-gray-600 rounded-lg p-2 resize-none focus:outline-none text-white placeholder-gray-500 text-sm"
              rows={2}
            />
            <div className="flex justify-end gap-2 mt-2">
              <button
                onClick={handleCloseReplyToReplyInput}
                className="px-2 py-1 text-xs text-gray-400 hover:text-white"
              >
                Cancelar
              </button>
              <button
                onClick={() => handlePublishReplyToReply(reply, parentNoteId)}
                disabled={!replyToReplyContent.trim() || publishingReplyToReply}
                className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 text-xs"
              >
                {publishingReplyToReply ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                Responder
              </button>
            </div>
          </div>
        )}

        {reply.replies && reply.replies.length > 0 && (
          <div className="mt-3 pt-2 border-t border-gray-600 space-y-2">
            {repliesToShow.map(r => renderReply(r, parentNoteId, depth + 1))}
            
            {/* Botón "Ver más respuestas" cuando hay más de 2 */}
            {!isExpanded && hiddenRepliesCount > 0 && (
              <button
                onClick={() => toggleExpandedReplies(reply.id)}
                className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 py-1"
              >
                <ChevronDown size={14} />
                Ver {hiddenRepliesCount} {hiddenRepliesCount === 1 ? 'respuesta' : 'respuestas'} más
              </button>
            )}
            
            {/* Botón "Ver menos" cuando está expandido */}
            {isExpanded && reply.replies.length > 2 && (
              <button
                onClick={() => toggleExpandedReplies(reply.id)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-300 py-1"
              >
                <ChevronUp size={14} />
                Mostrar menos
              </button>
            )}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-gray-800 rounded-lg p-4">
        {replyTo && (
          <div className="flex items-center justify-between bg-gray-700 p-2 rounded mb-2">
            <span className="text-sm text-gray-400">Replying to {formatPubkey(replyTo.pubkey)}</span>
            <button onClick={cancelReply} className="text-gray-400 hover:text-white">✕</button>
          </div>
        )}
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder={replyTo ? "Escribe tu respuesta..." : "¿Qué estás pensando?"}
          className="w-full bg-transparent resize-none focus:outline-none text-white placeholder-gray-500"
          rows={3}
        />
        {selectedImage && (
          <div className="mt-3 relative inline-block">
            <img src={selectedImage} alt="Selected" className="max-h-32 rounded-lg" />
            <button
              onClick={removeSelectedImage}
              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs hover:bg-red-600"
            >
              ✕
            </button>
          </div>
        )}
        <div className="flex justify-between items-center mt-3 pt-3 border-t border-gray-700">
          <div className="flex gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageSelect}
              accept="image/*"
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2 hover:bg-gray-700 rounded-lg text-gray-400"
              title="Adjuntar imagen"
            >
              <Image size={20} />
            </button>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={handleRefresh}
              disabled={loading}
              className="flex items-center gap-2 px-3 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg disabled:opacity-50 text-sm"
              title="Recargar notas"
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              Recargar
            </button>
            <button
              onClick={handlePublish}
              disabled={(!newNote.trim() && !selectedImage) || publishing}
              className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50"
            >
              {publishing ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              {publishing ? 'Publicando...' : 'Publicar'}
            </button>
          </div>
        </div>
      </div>

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 size={40} className="animate-spin text-purple-500" />
          <p className="text-gray-400 text-sm">Cargando notas...</p>
        </div>
      )}

      {!loading && notes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 space-y-3">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center">
            <MessageCircle size={32} className="text-gray-500" />
          </div>
          <p className="text-lg">No hay notas aún</p>
          <p className="text-sm text-gray-500">Sé el primero en publicar algo</p>
        </div>
      )}

      {notes.map((note) => {
        const isLiked = likedPosts.has(note.id)
        const isReposted = repostedPosts.has(note.id)
        
        return (
          <div key={note.id} className="bg-gray-800 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-purple-600 rounded-full flex items-center justify-center">
                <span className="text-sm font-bold">
                  {note.pubkey?.slice(0, 2).toUpperCase() || '??'}
                </span>
              </div>
              <div>
                <p className="font-semibold">{formatPubkey(note.pubkey)}</p>
                <p className="text-xs text-gray-400">{formatDate(note.created_at)}</p>
              </div>
            </div>
            
            <p className="text-white whitespace-pre-wrap">{note.content}</p>
            
            <div className="flex gap-6 mt-4 pt-3 border-t border-gray-700">
              <button 
                onClick={() => handleLike(note.id, note.pubkey)}
                className={`flex items-center gap-2 ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
              >
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
              <button 
                onClick={() => handleRepost(note)}
                className={`flex items-center gap-2 ${isReposted ? 'text-green-500' : 'text-gray-400 hover:text-green-500'}`}
              >
                <Repeat2 size={18} />
              </button>
              <button 
                onClick={() => handleOpenReplyInput(note)}
                className="flex items-center gap-2 text-gray-400 hover:text-blue-500"
              >
                <MessageCircle size={18} />
              </button>
              {note.replies.length > 0 && (
                <button 
                  onClick={() => toggleReplies(note.id)}
                  className="flex items-center gap-2 text-gray-400 hover:text-blue-500 text-sm"
                >
                  {note.showReplies ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {note.replies.length} {note.replies.length === 1 ? 'respuesta' : 'respuestas'}
                </button>
              )}
              <button className="flex items-center gap-2 text-gray-400 hover:text-yellow-500">
                <Zap size={18} />
              </button>
            </div>

            {replyingToNoteId === note.id && (
              <div className="mt-3 pt-3 border-t border-gray-700">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Escribe tu respuesta..."
                  className="w-full bg-gray-700 rounded-lg p-3 resize-none focus:outline-none text-white placeholder-gray-500"
                  rows={2}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={handleCloseReplyInput}
                    className="px-3 py-1.5 text-gray-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => handlePublishReply(note)}
                    disabled={!replyContent.trim() || publishingReply}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 text-sm"
                  >
                    {publishingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Responder
                  </button>
                </div>
              </div>
            )}

            {note.showReplies && note.replies.length > 0 && (
              <NoteReplies 
                note={note} 
                renderReply={renderReply}
              />
            )}
          </div>
        )
      })}

      <div className="py-4 flex justify-center">
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={24} className="animate-spin text-purple-500" />
          </div>
        )}
        {hasMore && !loading && (
          <button
            onClick={loadMore}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
          >
            Ver más posts
          </button>
        )}
        {!hasMore && notes.length > 0 && (
          <p className="text-center text-gray-500 py-4">No hay más notas</p>
        )}
      </div>
    </div>
  )
}
