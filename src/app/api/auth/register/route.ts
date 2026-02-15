import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { npub, publicKey, privateKey, username } = await request.json()

    if (!npub || !publicKey || !username) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      )
    }

    const existingByNpub = await prisma.usuario.findUnique({
      where: { npub }
    })

    if (existingByNpub) {
      return NextResponse.json(
        { error: 'Ya existe un usuario con esta clave pública' },
        { status: 400 }
      )
    }

    const user = await prisma.usuario.create({
      data: {
        npub,
        privateKeyEncrypted: privateKey,
        username
      }
    })

    await prisma.estadistica.create({
      data: {
        usuarioId: user.id
      }
    })

    return NextResponse.json({ 
      success: true,
      user: {
        id: user.id,
        npub: user.npub,
        username: user.username
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
