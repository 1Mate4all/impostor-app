import { NextResponse } from 'next/server'
import { decodeNpub } from '@/lib/nostr'

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]

export async function POST(request: Request) {
  try {
    const { npub, publicKey, privateKey } = await request.json()

    if (!npub || !publicKey || !privateKey) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      )
    }

    const username = `user_${npub.slice(0, 8)}`

    return NextResponse.json({
      success: true,
      user: {
        npub,
        publicKey,
        username
      }
    })
  } catch (error) {
    console.error('Login error:', error)
    return NextResponse.json(
      { error: 'Error al iniciar sesión' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const npub = searchParams.get('npub')

  if (!npub) {
    return NextResponse.json({ error: 'Falta npub' }, { status: 400 })
  }

  try {
    const publicKey = decodeNpub(npub)
    if (!publicKey) {
      return NextResponse.json({ error: 'Invalid npub' }, { status: 400 })
    }

    const { SimplePool } = await import('nostr-tools')
    const pool = new SimplePool()

    const profileEvents = await pool.querySync(DEFAULT_RELAYS, {
      kinds: [0],
      authors: [publicKey],
      limit: 1
    })

    setTimeout(() => {
      try { pool.close(DEFAULT_RELAYS) } catch (e) {}
    }, 3000)

    if (profileEvents.length === 0) {
      return NextResponse.json({
        username: null,
        npub,
        publicKey
      })
    }

    const profile = JSON.parse(profileEvents[0].content)

    return NextResponse.json({
      username: profile.name || profile.display_name || null,
      npub,
      publicKey,
      profile: profile
    })
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json({ error: 'Error al obtener perfil' }, { status: 500 })
  }
}
