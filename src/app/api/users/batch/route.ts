import { NextResponse } from 'next/server'
import { decodeNpub } from '@/lib/nostr'

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]

export async function POST(request: Request) {
  try {
    const { npubs } = await request.json()

    if (!npubs || !Array.isArray(npubs) || npubs.length === 0) {
      return NextResponse.json({ users: {} })
    }

    const publicKeys: string[] = []
    const npubToKey: Record<string, string> = {}

    for (const npub of npubs) {
      const publicKey = decodeNpub(npub)
      if (publicKey) {
        publicKeys.push(publicKey)
        npubToKey[npub] = publicKey
      }
    }

    if (publicKeys.length === 0) {
      return NextResponse.json({ users: {} })
    }

    const { SimplePool } = await import('nostr-tools')
    const pool = new SimplePool()

    const profileEvents = await pool.querySync(DEFAULT_RELAYS, {
      kinds: [0],
      authors: publicKeys
    })

    setTimeout(() => {
      try { pool.close(DEFAULT_RELAYS) } catch (e) {}
    }, 3000)

    const userMap: Record<string, string> = {}

    for (const npub of npubs) {
      const publicKey = npubToKey[npub]
      if (!publicKey) continue

      const profileEvent = profileEvents.find(e => e.pubkey === publicKey)
      if (profileEvent) {
        try {
          const profile = JSON.parse(profileEvent.content)
          userMap[npub] = profile.name || profile.display_name || `user_${npub.slice(0, 8)}`
        } catch {
          userMap[npub] = `user_${npub.slice(0, 8)}`
        }
      } else {
        userMap[npub] = `user_${npub.slice(0, 8)}`
      }
    }

    return NextResponse.json({ users: userMap })
  } catch (error) {
    console.error('Error fetching batch users:', error)
    return NextResponse.json({ users: {} })
  }
}
