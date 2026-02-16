'use client'

import { create } from 'zustand'
import { persist, createJSONStorage } from 'zustand/middleware'

interface User {
  npub: string
  publicKey: string
  username: string
}

interface Relay {
  url: string
  active: boolean
}

interface UserStore {
  user: User | null
  privateKey: string | null
  relays: Relay[]
  isAuthenticated: boolean
  likedPosts: Set<string>
  repostedPosts: Set<string>
  
  setUser: (user: User, privateKey: string) => void
  logout: () => void
  updateUsername: (username: string) => void
  toggleRelay: (url: string) => void
  addRelay: (url: string) => void
  setRelays: (relays: Relay[]) => void
  resetRelays: () => void
  toggleLike: (postId: string) => void
  toggleRepost: (postId: string) => void
}

const storage = {
  getItem: (name: string): string | null => {
    if (typeof window === 'undefined') return null
    return localStorage.getItem(name)
  },
  setItem: (name: string, value: string): void => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(name, value)
    }
  },
  removeItem: (name: string): void => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem(name)
    }
  },
}

export const useUserStore = create<UserStore>()(
  persist(
    (set, get) => ({
      user: null,
      privateKey: null,
      relays: [
        { url: 'wss://impostor-relay-production.up.railway.app', active: true },
        { url: 'wss://relay.damus.io', active: false },
        { url: 'wss://relay.iris.to', active: false },
        { url: 'wss://relay.primal.net', active: false },
        { url: 'wss://nos.lol', active: false },
        { url: 'wss://relay.nostr.band', active: false },
      ],
      isAuthenticated: false,
      likedPosts: new Set(),
      repostedPosts: new Set(),

      setUser: (user, privateKey) => set({ 
        user, 
        privateKey, 
        isAuthenticated: true 
      }),

      logout: () => set({ 
        user: null, 
        privateKey: null, 
        isAuthenticated: false 
      }),

      updateUsername: (username) => set((state) => ({
        user: state.user ? { ...state.user, username } : null
      })),

      toggleRelay: (url) => set((state) => ({
        relays: state.relays.map(r => 
          r.url === url ? { ...r, active: !r.active } : r
        )
      })),

      addRelay: (url) => set((state) => ({
        relays: [...state.relays, { url, active: true }]
      })),

      setRelays: (relays) => set({ relays }),

      resetRelays: () => set({
        relays: [
          { url: 'wss://impostor-relay-production.up.railway.app', active: true },
          { url: 'wss://relay.damus.io', active: false },
          { url: 'wss://relay.iris.to', active: false },
          { url: 'wss://relay.primal.net', active: false },
          { url: 'wss://nos.lol', active: false },
          { url: 'wss://relay.nostr.band', active: false },
        ]
      }),

      toggleLike: (postId) => set((state) => {
        const newLiked = new Set(state.likedPosts)
        if (newLiked.has(postId)) {
          newLiked.delete(postId)
        } else {
          newLiked.add(postId)
        }
        return { likedPosts: newLiked }
      }),

      toggleRepost: (postId) => set((state) => {
        const newReposted = new Set(state.repostedPosts)
        if (newReposted.has(postId)) {
          newReposted.delete(postId)
        } else {
          newReposted.add(postId)
        }
        return { repostedPosts: newReposted }
      }),
    }),
    {
      name: 'impostor-user-storage',
      storage: createJSONStorage(() => storage),
      partialize: (state) => ({
        user: state.user,
        privateKey: state.privateKey,
        relays: state.relays,
        likedPosts: Array.from(state.likedPosts),
        repostedPosts: Array.from(state.repostedPosts),
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.isAuthenticated = !!state.privateKey
          state.likedPosts = new Set(state.likedPosts as unknown as string[])
          state.repostedPosts = new Set(state.repostedPosts as unknown as string[])
          // Siempre usar solo nuestro relay, ignorar lo guardado en localStorage
          state.relays = [
            { url: 'wss://impostor-relay-production.up.railway.app', active: true },
          ]
        }
      },
    }
  )
)
