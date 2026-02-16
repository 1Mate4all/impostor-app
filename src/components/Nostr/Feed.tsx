'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useUserStore } from '@/stores/userStore'
import { encodePubkey } from '@/lib/nostr'
import { Heart, Repeat2, MessageCircle, Zap, Image, Send, Loader2, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

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

// Estructura simple: Post -> Comentarios -> Respuestas (máx 2 niveles)
interface Comment {
  id: string
  pubkey: string
  content: string
  created_at: number
  replies: Comment[]
}

interface Post extends NostrEvent {
  comments: Comment[]
  showComments: boolean
}

const NOTES_PER_PAGE = 30

export default function Feed() {
  const [posts, setPosts] = useState<Post[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { relays, privateKey, likedPosts, repostedPosts, toggleLike, toggleRepost, user } = useUserStore()
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const loadedIds = useRef<Set<string>>(new Set())
  const [profiles, setProfiles] = useState<Record<string, NostrProfile>>({})
  const [localUsernames, setLocalUsernames] = useState<Record<string, string>>({})
  const [replyingToPost, setReplyingToPost] = useState<string | null>(null)
  const [replyingToComment, setReplyingToComment] = useState<string | null>(null)
  const [replyContent, setReplyContent] = useState('')
  const [publishingReply, setPublishingReply] = useState(false)

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('La imagen debe ser menor a 5MB')
        return
      }
      const reader = new FileReader()
      reader.onloadend = () => setSelectedImage(reader.result as string)
      reader.readAsDataURL(file)
    }
  }

  const removeSelectedImage = () => {
    setSelectedImage(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const getWorkingRelays = async (pool: any, relayUrls: string[]): Promise<string[]> => {
    const working: string[] = []
    for (const url of relayUrls) {
      try {
        await pool.ensureRelay(url)
        working.push(url)
      } catch (e) {
        console.log('Relay no disponible:', url)
      }
    }
    return working
  }

  const fetchFromRelays = useCallback(async (reset: boolean = false) => {
    const activeRelays = relays.filter(r => r.active)
    if (activeRelays.length === 0) {
      setLoading(false)
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

      const workingRelays: string[] = []
      for (const url of relayUrls) {
        try {
          await pool.ensureRelay(url)
          workingRelays.push(url)
        } catch (e) {
          console.error('Failed to connect to relay:', url)
        }
      }

      if (workingRelays.length === 0) {
        setLoading(false)
        setLoadingMore(false)
        return
      }

      // Cargar todos los eventos kind 1
      const filter: any = { kinds: [1], limit: NOTES_PER_PAGE }
      if (!reset && posts.length > 0) {
        const oldestTimestamp = Math.min(...posts.map(p => p.created_at))
        filter.until = oldestTimestamp - 1
      }

      let events = await pool.querySync(workingRelays, filter)

      // También cargar comentarios de posts existentes (no solo los nuevos)
      if (!reset && posts.length > 0) {
        const postIds = posts.map(p => p.id)
        const commentsFilter = { kinds: [1], '#e': postIds, limit: NOTES_PER_PAGE }
        const comments = await pool.querySync(workingRelays, commentsFilter)
        if (comments && comments.length > 0) {
          // Combinar eventos, evitando duplicados
          const existingIds = new Set(events.map(e => e.id))
          const newComments = comments.filter(c => !existingIds.has(c.id))
          events = [...events, ...newComments]
        }
      }
      
      setTimeout(() => { try { pool.close(workingRelays) } catch (e) {} }, 2000)

      if (!events || events.length === 0) {
        setLoading(false)
        setLoadingMore(false)
        setHasMore(false)
        return
      }

      // Identificar posts principales vs comentarios
      // Un evento es comentario si su tag 'e' referencia a otro evento en el conjunto
      const newEvents = events.filter((e: NostrEvent) => !loadedIds.current.has(e.id))
      const eventIds = new Set(newEvents.map((e: NostrEvent) => e.id))
      
      const mainPosts: NostrEvent[] = []
      const allComments: NostrEvent[] = []
      
      newEvents.forEach(e => {
        const eTags = e.tags.filter(t => t[0] === 'e' && t[1])
        const parentExists = eTags.some(et => eventIds.has(et[1]))
        if (eTags.length === 0 || parentExists) {
          mainPosts.push(e)
        } else {
          allComments.push(e)
        }
      })

      // Construir estructura de comentarios con soporte para threads profundos
      const buildComments = (parentId: string, depth: number = 0): Comment[] => {
        const directReplies = allComments.filter(c => {
          const eTags = c.tags.filter(t => t[0] === 'e')
          return eTags.some(et => et[1] === parentId)
        })

        return directReplies.map(reply => ({
          id: reply.id,
          pubkey: reply.pubkey,
          content: reply.content,
          created_at: reply.created_at,
          replies: buildComments(reply.id, depth + 1)
        })).sort((a, b) => a.created_at - b.created_at)
      }

      const newPosts: Post[] = mainPosts.map(post => ({
        ...post,
        comments: buildComments(post.id),
        showComments: false
      })).sort((a, b) => b.created_at - a.created_at)

      newPosts.forEach(p => {
        loadedIds.current.add(p.id)
        p.comments.forEach(c => {
          loadedIds.current.add(c.id)
          c.replies.forEach(r => loadedIds.current.add(r.id))
        })
      })

      if (reset) {
        setPosts(newPosts)
      } else {
        setPosts(prev => {
          const existingIds = new Set(prev.map(p => p.id))
          const uniqueNew = newPosts.filter(p => !existingIds.has(p.id))
          return [...prev, ...uniqueNew]
        })
      }

      setLoading(false)
      setLoadingMore(false)
      setHasMore(events.length >= NOTES_PER_PAGE)

      // Cargar perfiles
      const pubkeys = [...new Set(events.map((e: NostrEvent) => e.pubkey))]
      fetchProfiles(pubkeys, workingRelays)
      
    } catch (err) {
      console.error('Error fetching:', err)
      setLoading(false)
      setLoadingMore(false)
    }
  }, [relays, posts])

  const fetchProfiles = async (pubkeys: string[], relayUrls: string[]) => {
    if (pubkeys.length === 0) return
    try {
      const { SimplePool } = await import('nostr-tools')
      const pool = new SimplePool()
      
      const profileEvents = await pool.querySync(relayUrls, {
        kinds: [0],
        authors: pubkeys
      })

      setTimeout(() => { try { pool.close(relayUrls) } catch (e) {} }, 2000)

      const newProfiles: Record<string, NostrProfile> = {}
      profileEvents.forEach(e => {
        try {
          newProfiles[e.pubkey] = JSON.parse(e.content)
        } catch {}
      })

      setProfiles(prev => ({ ...prev, ...newProfiles }))
    } catch (err) {
      console.error('Error fetching profiles:', err)
    }
  }

  useEffect(() => {
    const activeRelays = relays.filter(r => r.active)
    if (activeRelays.length > 0) {
      fetchFromRelays(true)
    }

    const interval = setInterval(() => {
      const activeRelays = relays.filter(r => r.active)
      if (activeRelays.length > 0) {
        fetchFromRelays(false)
      }
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  const handlePublish = async () => {
    if ((!newNote.trim() && !selectedImage) || !privateKey) return

    setPublishing(true)
    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      
      let content = newNote
      if (selectedImage) {
        content = content ? `${content}\n\n${selectedImage}` : selectedImage
      }

      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [],
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
        loadedIds.current.add(signed.id)
        
        setNewNote('')
        setSelectedImage(null)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('Error publishing:', error)
      alert('Error al publicar')
    } finally {
      setPublishing(false)
    }
  }

  const handleReplyToPost = async (postId: string) => {
    if (!replyContent.trim() || !privateKey) return

    setPublishingReply(true)
    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      
      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['e', postId]],
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
        await pool.publish(workingRelays, signed)
        loadedIds.current.add(signed.id)
        
        setReplyContent('')
        setReplyingToPost(null)
      }
    } catch (error) {
      console.error('Error replying:', error)
      alert('Error al responder')
    } finally {
      setPublishingReply(false)
    }
  }

  const handleReplyToComment = async (postId: string, commentId: string) => {
    if (!replyContent.trim() || !privateKey) return

    setPublishingReply(true)
    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      
      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags: [
          ['e', commentId]
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
        await pool.publish(workingRelays, signed)
        loadedIds.current.add(signed.id)
        
        setReplyContent('')
        setReplyingToComment(null)
      }
    } catch (error) {
      console.error('Error replying to comment:', error)
      alert('Error al responder')
    } finally {
      setPublishingReply(false)
    }
  }

  const toggleComments = (postId: string) => {
    setPosts(prev => prev.map(p => 
      p.id === postId ? { ...p, showComments: !p.showComments } : p
    ))
  }

  const getProfileName = (pk: string) => {
    if (user?.publicKey === pk && user?.username) return user.username
    
    try {
      const npub = encodePubkey(pk)
      if (localUsernames[npub]) return localUsernames[npub]
    } catch {}
    
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
    const now = Math.floor(Date.now() / 1000)
    const diff = now - timestamp
    
    if (diff < 60) return 'ahora'
    if (diff < 3600) return `hace ${Math.floor(diff / 60)} min`
    if (diff < 86400) return `hace ${Math.floor(diff / 3600)}h`
    if (diff < 604800) return `hace ${Math.floor(diff / 86400)}d`
    
    return new Date(timestamp * 1000).toLocaleDateString('es', { 
      day: 'numeric', 
      month: 'short' 
    })
  }

  const handleLike = async (eventId: string, pubkey: string) => {
    if (!privateKey || !user) return
    if (likedPosts.has(eventId)) {
      alert('Ya diste like a esto')
      return
    }
    
    toggleLike(eventId)
    
    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      const event = {
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['e', eventId]],
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
      toggleLike(eventId)
    }
  }

  return (
    <div className="space-y-4">
      {/* Input para nuevo post */}
      <div className="bg-gray-800 rounded-lg p-4">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="¿Qué estás pensando?"
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

      {/* Lista de posts */}
      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 size={40} className="animate-spin text-purple-500" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      )}

      {!loading && posts.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 space-y-3">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center">
            <MessageCircle size={32} className="text-gray-500" />
          </div>
          <p className="text-lg">No hay posts aún</p>
        </div>
      )}

      {posts.map((post) => {
        const isLiked = likedPosts.has(post.id)
        
        return (
          <div key={post.id} className="bg-gray-800/80 backdrop-blur-sm rounded-xl p-5 shadow-lg border border-gray-700/50">
            {/* Header del post */}
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center shadow-md">
                <span className="text-base font-bold">
                  {post.pubkey?.slice(0, 2).toUpperCase() || '??'}
                </span>
              </div>
              <div>
                <p className="font-semibold text-white">{formatPubkey(post.pubkey)}</p>
                <p className="text-xs text-gray-400">{formatDate(post.created_at)}</p>
              </div>
            </div>
            
            {/* Contenido del post */}
            <p className="text-gray-100 whitespace-pre-wrap mb-4 leading-relaxed">{post.content}</p>
            
            {/* Acciones */}
            <div className="flex gap-6 pt-3 border-t border-gray-700/50">
              <button 
                onClick={() => handleLike(post.id, post.pubkey)}
                className={`flex items-center gap-2 ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
              >
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
              </button>
              <button 
                onClick={() => toggleComments(post.id)}
                className="flex items-center gap-2 text-gray-400 hover:text-blue-500"
              >
                <MessageCircle size={18} />
                {post.comments.length > 0 && (
                  <span className="text-sm">{post.comments.length}</span>
                )}
              </button>
            </div>

            {/* Sección de comentarios */}
            {post.showComments && (
              <div className="mt-5 pt-5 border-t border-gray-700/50">
                {/* Input para comentar */}
                {replyingToPost === post.id ? (
                  <div className="mb-5">
                    <textarea
                      value={replyContent}
                      onChange={(e) => setReplyContent(e.target.value)}
                      placeholder="Escribe tu comentario..."
                      className="w-full bg-gray-700/50 rounded-lg p-3 resize-none focus:outline-none text-white placeholder-gray-500"
                      rows={2}
                    />
                    <div className="flex justify-end gap-2 mt-2">
                      <button
                        onClick={() => {
                          setReplyingToPost(null)
                          setReplyContent('')
                        }}
                        className="px-3 py-1.5 text-gray-400 hover:text-white"
                      >
                        Cancelar
                      </button>
                      <button
                        onClick={() => handleReplyToPost(post.id)}
                        disabled={!replyContent.trim() || publishingReply}
                        className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 text-sm"
                      >
                        {publishingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                        Responder
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setReplyingToPost(post.id)}
                    className="mb-5 text-blue-400 hover:text-blue-300 text-sm font-medium"
                  >
                    + Añadir comentario
                  </button>
                )}

                {/* Lista de comentarios */}
                <div className="space-y-4">
                  {post.comments.map((comment) => (
                    <div key={comment.id} className="relative">
                      {/* Línea vertical de threading */}
                      <div className="absolute left-5 top-14 bottom-0 w-0.5 bg-blue-500/20" />
                      
                      <div className="bg-gray-700/40 rounded-xl p-4 border-l-2 border-blue-500">
                        {/* Header del comentario */}
                        <div className="flex items-center gap-3 mb-3">
                          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center shadow-md">
                            <span className="text-sm font-bold">
                              {comment.pubkey?.slice(0, 2).toUpperCase() || '??'}
                            </span>
                          </div>
                          <div>
                            <p className="font-semibold text-sm text-white">{formatPubkey(comment.pubkey)}</p>
                            <p className="text-xs text-gray-400">{formatDate(comment.created_at)}</p>
                          </div>
                        </div>
                        
                        {/* Contenido del comentario */}
                        <p className="text-gray-200 text-sm whitespace-pre-wrap mb-3 leading-relaxed">{comment.content}</p>
                        
                        {/* Acciones del comentario */}
                        <div className="flex gap-4">
                          <button 
                            onClick={() => handleLike(comment.id, comment.pubkey)}
                            className={`flex items-center gap-1 text-xs ${likedPosts.has(comment.id) ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
                          >
                            <Heart size={14} fill={likedPosts.has(comment.id) ? 'currentColor' : 'none'} />
                          </button>
                          <button 
                            onClick={() => setReplyingToComment(comment.id)}
                            className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500"
                          >
                            <MessageCircle size={14} />
                            Responder
                          </button>
                        </div>
                        </div>

                      {/* Input para responder al comentario */}
                      {replyingToComment === comment.id && (
                        <div className="mt-3 bg-gray-600 rounded-lg p-3">
                          <p className="text-xs text-blue-400 mb-2">↳ Respondiendo a @{formatPubkey(comment.pubkey)}</p>
                          <textarea
                            value={replyContent}
                            onChange={(e) => setReplyContent(e.target.value)}
                            placeholder="Escribe tu respuesta..."
                            className="w-full bg-gray-500 rounded-lg p-2 resize-none focus:outline-none text-white placeholder-gray-500 text-sm"
                            rows={2}
                          />
                          <div className="flex justify-end gap-2 mt-2">
                            <button
                              onClick={() => {
                                setReplyingToComment(null)
                                setReplyContent('')
                              }}
                              className="px-2 py-1 text-xs text-gray-400 hover:text-white"
                            >
                              Cancelar
                            </button>
                            <button
                              onClick={() => handleReplyToComment(post.id, comment.id)}
                              disabled={!replyContent.trim() || publishingReply}
                              className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 text-xs"
                            >
                              {publishingReply ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                              Responder
                            </button>
                          </div>
                        </div>
                      )}

                      {/* Respuestas al comentario */}
                      {comment.replies.length > 0 && (
                        <div className="mt-4 ml-6 space-y-3 border-l-2 border-blue-500/30 pl-4">
                          {comment.replies.map((reply) => (
                            <div key={reply.id} className="bg-gray-600/50 rounded-lg p-3 border border-gray-500/30">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-6 h-6 bg-green-600 rounded-full flex items-center justify-center">
                                  <span className="text-xs font-bold">
                                    {reply.pubkey?.slice(0, 2).toUpperCase() || '??'}
                                  </span>
                                </div>
                                <span className="text-xs font-semibold">{formatPubkey(reply.pubkey)}</span>
                                <span className="text-xs text-gray-400">{formatDate(reply.created_at)}</span>
                              </div>
                              <p className="text-gray-200 text-sm whitespace-pre-wrap">{reply.content}</p>
                              <p className="text-xs text-gray-500 mt-1">↳ respondiendo a @{formatPubkey(comment.pubkey)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}

      {/* Botón cargar más */}
      <div className="py-4 flex justify-center">
        {loadingMore && (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={24} className="animate-spin text-purple-500" />
          </div>
        )}
        {hasMore && !loading && (
          <button
            onClick={() => fetchFromRelays(false)}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
          >
            Ver más posts
          </button>
        )}
        {!hasMore && posts.length > 0 && (
          <p className="text-center text-gray-500 py-4">No hay más posts</p>
        )}
      </div>
    </div>
  )
}