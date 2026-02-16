'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useUserStore } from '@/stores/userStore'
import { encodePubkey } from '@/lib/nostr'
import { Heart, MessageCircle, Image, Send, Loader2 } from 'lucide-react'

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
  picture?: string
}

interface Reply {
  id: string
  pubkey: string
  content: string
  created_at: number
  replies: Reply[]
}

interface Note extends NostrEvent {
  replies: Reply[]
  showReplies: boolean
  likeCount: number
  likedByCurrentUser: boolean
}

const NOTES_PER_PAGE = 10

export default function Feed() {
  const [notes, setNotes] = useState<Note[]>([])
  const [loading, setLoading] = useState(true)
  const [hasMore, setHasMore] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [selectedImage, setSelectedImage] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { relays, privateKey, likedPosts, toggleLike, user } = useUserStore()
  const loadedIds = useRef<Set<string>>(new Set())
  const [profiles, setProfiles] = useState<Record<string, NostrProfile>>({})
  const [replyingTo, setReplyingTo] = useState<{ type: 'note' | 'reply', id: string } | null>(null)
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

  const getRootEventId = (event: NostrEvent): string | null => {
    for (const tag of event.tags) {
      if (tag[0] === 'e' && (tag[3] === 'root' || tag.length === 2)) {
        return tag[1]
      }
    }
    return null
  }

  const getReplyToEventId = (event: NostrEvent): string | null => {
    for (const tag of event.tags) {
      if (tag[0] === 'e' && tag[3] === 'reply') {
        return tag[1]
      }
    }
    for (const tag of event.tags) {
      if (tag[0] === 'e' && tag[1]) {
        return tag[1]
      }
    }
    return null
  }

  const buildReplyTree = (events: NostrEvent[], parentId: string): Reply[] => {
    const directReplies = events.filter(e => {
      const replyToId = getReplyToEventId(e)
      return replyToId === parentId
    })

    return directReplies.map(reply => ({
      id: reply.id,
      pubkey: reply.pubkey,
      content: reply.content,
      created_at: reply.created_at,
      replies: buildReplyTree(events, reply.id)
    })).sort((a, b) => a.created_at - b.created_at)
  }

  const fetchNotes = useCallback(async () => {
    const activeRelays = relays.filter(r => r.active)
    if (activeRelays.length === 0) {
      setLoading(false)
      return
    }

    setLoading(true)

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
          console.log('Relay no disponible:', url)
        }
      }

      if (workingRelays.length === 0) {
        setLoading(false)
        return
      }

      const filter: any = { kinds: [1], limit: NOTES_PER_PAGE }
      if (notes.length > 0) {
        const oldestTimestamp = Math.min(...notes.map(n => n.created_at))
        filter.until = oldestTimestamp - 1
      }

      let allEvents = await pool.querySync(workingRelays, filter)

      if (!allEvents || allEvents.length === 0) {
        setLoading(false)
        setHasMore(false)
        return
      }

      allEvents = allEvents.filter((e: NostrEvent) => !loadedIds.current.has(e.id))

      const rootNotes = allEvents.filter(e => {
        const replyTo = getReplyToEventId(e)
        return !replyTo || !allEvents.some(a => a.id === replyTo)
      })

      const rootIds = rootNotes.map(n => n.id)

      const commentsFilter = { kinds: [1], '#e': rootIds, limit: 500 }
      let comments: NostrEvent[] = []
      
      try {
        comments = await pool.querySync(workingRelays, commentsFilter) || []
      } catch (e) {
        console.log('Error fetching comments:', e)
      }

      const reactionsFilter = { kinds: [7], '#e': rootIds, limit: 1000 }
      let reactions: NostrEvent[] = []
      
      try {
        reactions = await pool.querySync(workingRelays, reactionsFilter) || []
      } catch (e) {
        console.log('Error fetching reactions:', e)
      }

      const reactionsByEventId: Record<string, string[]> = {}
      reactions.forEach(r => {
        const eventIdTag = r.tags.find(t => t[0] === 'e')
        if (eventIdTag && eventIdTag[1]) {
          if (!reactionsByEventId[eventIdTag[1]]) {
            reactionsByEventId[eventIdTag[1]] = []
          }
          reactionsByEventId[eventIdTag[1]].push(r.pubkey)
        }
      })

      const userPubkey = user?.publicKey

      const allNotesForTree = [...allEvents, ...comments.filter(c => !allEvents.some(a => a.id === c.id))]
      
      const notesWithReplies: Note[] = rootNotes.map(note => ({
        ...note,
        replies: buildReplyTree(allNotesForTree, note.id),
        showReplies: false,
        likeCount: reactionsByEventId[note.id]?.length || 0,
        likedByCurrentUser: userPubkey ? reactionsByEventId[note.id]?.includes(userPubkey) || false : false
      })).sort((a, b) => b.created_at - a.created_at)

      notesWithReplies.forEach(n => loadedIds.current.add(n.id))
      comments.forEach(c => loadedIds.current.add(c.id))

      if (notes.length === 0) {
        setNotes(notesWithReplies)
      } else {
        setNotes(prev => {
          const existingIds = new Set(prev.map(p => p.id))
          const uniqueNew = notesWithReplies.filter(n => !existingIds.has(n.id))
          return [...prev, ...uniqueNew]
        })
      }

      setLoading(false)
      setHasMore(allEvents.length >= NOTES_PER_PAGE)

      const pubkeys = [...new Set(allNotesForTree.map((e: NostrEvent) => e.pubkey))]
      fetchProfiles(pubkeys, workingRelays)

      setTimeout(() => { try { pool.close(workingRelays) } catch (e) {} }, 2000)

    } catch (err) {
      console.error('Error fetching:', err)
      setLoading(false)
    }
  }, [relays, notes])

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
      profileEvents.forEach((e: NostrEvent) => {
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
    fetchNotes()
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
      
      const workingRelays: string[] = []
      for (const url of activeRelays) {
        try {
          await pool.ensureRelay(url)
          workingRelays.push(url)
        } catch (e) {}
      }

      if (workingRelays.length > 0) {
        await pool.publish(workingRelays, signed)
        
        const newNoteObj: Note = {
          ...signed,
          replies: [],
          showReplies: false,
          likeCount: 0,
          likedByCurrentUser: false
        }
        
        setNotes(prev => [newNoteObj, ...prev])
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

  const handleReply = async () => {
    if (!replyContent.trim() || !privateKey || !replyingTo) return

    setPublishingReply(true)
    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      
      let tags: string[][] = []
      let parentId: string

      if (replyingTo.type === 'note') {
        parentId = replyingTo.id
        tags = [['e', parentId, '', 'root']]
      } else {
        const parentNote = findNoteById(replyingTo.id)
        if (parentNote) {
          tags = [
            ['e', parentNote.id, '', 'root'],
            ['e', replyingTo.id, '', 'reply']
          ]
          parentId = parentNote.id
        } else {
          parentId = replyingTo.id
          tags = [['e', parentId]]
        }
      }

      const event = {
        kind: 1,
        created_at: Math.floor(Date.now() / 1000),
        tags,
        content: replyContent
      }

      const signed = finalizeEvent(event, Buffer.from(privateKey, 'hex'))
      const activeRelays = relays.filter(r => r.active).map(r => r.url)
      
      if (activeRelays.length === 0) {
        alert('No hay relays activos')
        setPublishingReply(false)
        return
      }
      
      const workingRelays: string[] = []
      for (const url of activeRelays) {
        try {
          await pool.ensureRelay(url)
          workingRelays.push(url)
        } catch (e) {}
      }

      if (workingRelays.length > 0) {
        await pool.publish(workingRelays, signed)
        
        const newReply: Reply = {
          id: signed.id,
          pubkey: signed.pubkey,
          content: signed.content,
          created_at: signed.created_at,
          replies: []
        }

        if (replyingTo.type === 'note') {
          setNotes(prev => prev.map(note => {
            if (note.id === replyingTo.id) {
              return { ...note, replies: [...note.replies, newReply].sort((a, b) => a.created_at - b.created_at) }
            }
            return note
          }))
        } else {
          setNotes(prev => prev.map(note => ({
            ...note,
            replies: addReplyToTree(note.replies, replyingTo.id, newReply)
          })))
        }
        
        setReplyContent('')
        setReplyingTo(null)
      }
    } catch (error) {
      console.error('Error replying:', error)
      alert('Error al responder')
    } finally {
      setPublishingReply(false)
    }
  }

  const findNoteById = (id: string): Note | undefined => {
    return notes.find(n => n.id === id)
  }

  const addReplyToTree = (replies: Reply[], parentId: string, newReply: Reply): Reply[] => {
    return replies.map(r => {
      if (r.id === parentId) {
        return { ...r, replies: [...r.replies, newReply].sort((a, b) => a.created_at - b.created_at) }
      }
      if (r.replies.length > 0) {
        return { ...r, replies: addReplyToTree(r.replies, parentId, newReply) }
      }
      return r
    })
  }

  const toggleReplies = (noteId: string) => {
    setNotes(prev => prev.map(n => 
      n.id === noteId ? { ...n, showReplies: !n.showReplies } : n
    ))
  }

  const getProfileName = (pk: string) => {
    if (user?.publicKey === pk && user?.username) return user.username
    
    const profile = profiles[pk]
    if (profile?.display_name) return profile.display_name
    if (profile?.name) return profile.name
    
    try {
      return encodePubkey(pk).slice(0, 16) + '...'
    } catch {
      return pk?.slice(0, 16) + '...' || 'Unknown'
    }
  }

  const renderContent = (content: string) => {
    const imageRegex = /(data:image\/[^;]+;base64,[A-Za-z0-9+/=]+)/g
    const parts = content.split(imageRegex)
    
    return parts.map((part, index) => {
      if (part && part.startsWith('data:image/')) {
        return (
          <img 
            key={index} 
            src={part} 
            alt="Imagen adjunta" 
            className="max-w-full h-auto rounded-lg mt-3 mb-2 max-h-80 object-contain"
          />
        )
      }
      return part ? <span key={index} className="whitespace-pre-wrap">{part}</span> : null
    })
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
      return
    }
    
    toggleLike(eventId)
    
    try {
      const { SimplePool, finalizeEvent } = await import('nostr-tools')
      const pool = new SimplePool()
      const event = {
        kind: 7,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['e', eventId], ['p', pubkey]],
        content: '+'
      }

      const signed = finalizeEvent(event, Buffer.from(privateKey, 'hex'))
      const activeRelays = relays.filter(r => r.active).map(r => r.url)
      
      const workingRelays: string[] = []
      for (const url of activeRelays) {
        try {
          await pool.ensureRelay(url)
          workingRelays.push(url)
        } catch (e) {}
      }
      
      if (workingRelays.length > 0) {
        await pool.publish(workingRelays, signed)
      }
    } catch (error) {
      console.error('Error liking:', error)
    }
  }

  const renderReply = (reply: Reply, noteId: string, depth: number = 0) => {
    const isLiked = likedPosts.has(reply.id)
    
    return (
      <div key={reply.id} className={`${depth > 0 ? 'ml-6 mt-3 pl-4 border-l-2 border-blue-500/30' : ''}`}>
        <div className="bg-gray-700/30 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full flex items-center justify-center">
              <span className="text-xs font-bold">
                {reply.pubkey?.slice(0, 2).toUpperCase() || '??'}
              </span>
            </div>
            <span className="text-sm font-medium text-white">{getProfileName(reply.pubkey)}</span>
            <span className="text-xs text-gray-400">{formatDate(reply.created_at)}</span>
          </div>
          
          <p className="text-gray-200 text-sm whitespace-pre-wrap mb-2">{reply.content}</p>
          
          <div className="flex gap-4">
            <button 
              onClick={() => handleLike(reply.id, reply.pubkey)}
              className={`flex items-center gap-1 text-xs ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
            >
              <Heart size={14} fill={isLiked ? 'currentColor' : 'none'} />
            </button>
            <button 
              onClick={() => setReplyingTo({ type: 'reply', id: reply.id })}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-blue-500"
            >
              <MessageCircle size={14} />
              Responder
            </button>
          </div>

          {replyingTo?.type === 'reply' && replyingTo.id === reply.id && (
            <div className="mt-3 bg-gray-600 rounded-lg p-3">
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
                    setReplyingTo(null)
                    setReplyContent('')
                  }}
                  className="px-2 py-1 text-xs text-gray-400 hover:text-white"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleReply}
                  disabled={!replyContent.trim() || publishingReply}
                  className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 text-xs"
                >
                  {publishingReply ? <Loader2 size={10} className="animate-spin" /> : <Send size={10} />}
                  Responder
                </button>
              </div>
            </div>
          )}

          {reply.replies.length > 0 && (
            <div className="mt-3">
              {reply.replies.map(r => renderReply(r, noteId, depth + 1))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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

      {loading && (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 size={40} className="animate-spin text-purple-500" />
          <p className="text-gray-400 text-sm">Cargando...</p>
        </div>
      )}

      {!loading && notes.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400 space-y-3">
          <div className="w-16 h-16 bg-gray-700 rounded-full flex items-center justify-center">
            <MessageCircle size={32} className="text-gray-500" />
          </div>
          <p className="text-lg">No hay posts aún</p>
        </div>
      )}

      {notes.map((note) => {
        const isLiked = likedPosts.has(note.id) || note.likedByCurrentUser
        
        return (
          <div key={note.id} className="bg-gray-800 rounded-xl p-5 shadow-lg border border-gray-700">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-700 rounded-full flex items-center justify-center shadow-md">
                <span className="text-base font-bold">
                  {note.pubkey?.slice(0, 2).toUpperCase() || '??'}
                </span>
              </div>
              <div>
                <p className="font-semibold text-white">{getProfileName(note.pubkey)}</p>
                <p className="text-xs text-gray-400">{formatDate(note.created_at)}</p>
              </div>
            </div>
            
            <div className="text-gray-100 mb-4 leading-relaxed">
              {renderContent(note.content)}
            </div>
            
            <div className="flex gap-6 pt-3 border-t border-gray-700/50">
              <button 
                onClick={() => handleLike(note.id, note.pubkey)}
                className={`flex items-center gap-2 ${isLiked ? 'text-red-500' : 'text-gray-400 hover:text-red-500'}`}
              >
                <Heart size={18} fill={isLiked ? 'currentColor' : 'none'} />
                {note.likeCount > 0 && <span className="text-sm">{note.likeCount}</span>}
              </button>
              <button 
                onClick={() => setReplyingTo({ type: 'note', id: note.id })}
                className="flex items-center gap-2 text-gray-400 hover:text-blue-500"
              >
                <MessageCircle size={18} />
              </button>
            </div>

            {replyingTo?.type === 'note' && replyingTo.id === note.id && (
              <div className="mt-4 bg-gray-700/50 rounded-lg p-4">
                <textarea
                  value={replyContent}
                  onChange={(e) => setReplyContent(e.target.value)}
                  placeholder="Escribe tu comentario..."
                  className="w-full bg-gray-600 rounded-lg p-3 resize-none focus:outline-none text-white placeholder-gray-500"
                  rows={2}
                />
                <div className="flex justify-end gap-2 mt-2">
                  <button
                    onClick={() => {
                      setReplyingTo(null)
                      setReplyContent('')
                    }}
                    className="px-3 py-1.5 text-gray-400 hover:text-white"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleReply}
                    disabled={!replyContent.trim() || publishingReply}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 text-sm"
                  >
                    {publishingReply ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Comentar
                  </button>
                </div>
              </div>
            )}

            {note.replies.length > 0 && (
              <div className="mt-4 pt-4 border-t border-gray-700/50">
                {!note.showReplies ? (
                  <button
                    onClick={() => toggleReplies(note.id)}
                    className="text-blue-400 hover:text-blue-300 text-sm"
                  >
                    Ver {note.replies.length} {note.replies.length === 1 ? 'comentario' : 'comentarios'}
                  </button>
                ) : (
                  <div className="space-y-3">
                    <button
                      onClick={() => toggleReplies(note.id)}
                      className="text-gray-400 hover:text-gray-300 text-sm mb-3"
                    >
                      Ocultar comentarios
                    </button>
                    {note.replies.map(reply => renderReply(reply, note.id))}
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}

      <div className="py-4 flex justify-center">
        {loading && (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={24} className="animate-spin text-purple-500" />
          </div>
        )}
        {hasMore && !loading && (
          <button
            onClick={fetchNotes}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg font-semibold"
          >
            Ver más posts
          </button>
        )}
        {!hasMore && notes.length > 0 && (
          <p className="text-center text-gray-500 py-4">No hay más posts</p>
        )}
      </div>
    </div>
  )
}
