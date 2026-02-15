import { NextResponse } from 'next/server'
import { decodeNpub } from '@/lib/nostr'

export async function POST(request: Request) {
  try {
    const { npub, publicKey, privateKey, username } = await request.json()

    if (!npub || !publicKey || !username) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      )
    }

    return NextResponse.json({ 
      success: true,
      user: {
        npub,
        publicKey,
        username
      }
    })
  } catch (error) {
    console.error('Register error:', error)
    return NextResponse.json(
      { error: 'Error al crear usuario' },
      { status: 500 }
    )
  }
}
