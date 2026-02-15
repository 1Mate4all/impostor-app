import { NextResponse } from 'next/server'
import { decodeNpub } from '@/lib/nostr'

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]

export async function GET(
  request: Request,
  { params }: { params: Promise<{ npub: string }> }
) {
  try {
    const { npub } = await params

    if (!npub) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const publicKey = decodeNpub(npub)
    if (!publicKey) {
      return NextResponse.json({ 
        username: null,
        npub: npub,
        stats: {
          partidasJugadas: 0,
          partidasGanadas: 0,
          partidasPerdidas: 0,
          vecesImpostor: 0,
          vecesCiudadano: 0,
        }
      })
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

    let username = null
    let profile = null

    if (profileEvents.length > 0) {
      try {
        profile = JSON.parse(profileEvents[0].content)
        username = profile.name || profile.display_name
      } catch (e) {
        console.error('Error parsing profile:', e)
      }
    }

    return NextResponse.json({
      username: username || `user_${npub.slice(0, 8)}`,
      npub: npub,
      publicKey,
      profile,
      stats: {
        partidasJugadas: 0,
        partidasGanadas: 0,
        partidasPerdidas: 0,
        vecesImpostor: 0,
        vecesCiudadano: 0,
      }
    })
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json({ error: 'Error al obtener perfil' }, { status: 500 })
  }
}
