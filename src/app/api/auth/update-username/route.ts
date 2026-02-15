import { NextResponse } from 'next/server'
import { decodeNpub } from '@/lib/nostr'

const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.nostr.band',
]

export async function POST(request: Request) {
  try {
    const { npub, username, privateKey } = await request.json()

    if (!npub || !username) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      )
    }

    if (!privateKey) {
      return NextResponse.json(
        { error: 'Se requiere privateKey para actualizar el perfil' },
        { status: 400 }
      )
    }

    const publicKey = decodeNpub(npub)
    if (!publicKey) {
      return NextResponse.json({ error: 'Invalid npub' }, { status: 400 })
    }

    const { SimplePool, finalizeEvent } = await import('nostr-tools')
    const pool = new SimplePool()

    const profileEvent = {
      kind: 0,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: JSON.stringify({
        name: username,
        display_name: username
      })
    }

    const signed = finalizeEvent(profileEvent, Buffer.from(privateKey, 'hex'))

    await pool.publish(DEFAULT_RELAYS, signed)

    setTimeout(() => {
      try { pool.close(DEFAULT_RELAYS) } catch (e) {}
    }, 3000)

    return NextResponse.json({ success: true, username })
  } catch (error) {
    console.error('Error updating username:', error)
    return NextResponse.json(
      { error: 'Error al actualizar nombre de usuario' },
      { status: 500 }
    )
  }
}
