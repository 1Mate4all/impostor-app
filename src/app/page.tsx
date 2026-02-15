'use client'

import { useUserStore } from '@/stores/userStore'
import Navbar from '@/components/Layout/Navbar'
import Auth from '@/components/Auth/Auth'
import Feed from '@/components/Nostr/Feed'

export default function Home() {
  const { isAuthenticated, user } = useUserStore()

  return (
    <div className="min-h-screen">
      <Navbar />
      
      <main className="pt-16">
        {!isAuthenticated ? (
          <Auth />
        ) : (
          <div className="max-w-2xl mx-auto p-4">
            <div className="mb-6">
              <h1 className="text-2xl font-bold">Hola, {user?.username}</h1>
              <p className="text-gray-400">Esto es tu feed</p>
            </div>
            
            <Feed />
          </div>
        )}
      </main>
    </div>
  )
}
