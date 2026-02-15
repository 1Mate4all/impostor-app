import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { npub, publicKey, privateKey } = await request.json()

    if (!npub || !publicKey || !privateKey) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      )
    }

    let user = await prisma.usuario.findUnique({
      where: { npub }
    })

    if (!user) {
      user = await prisma.usuario.create({
        data: {
          npub,
          privateKeyEncrypted: privateKey,
          username: `user_${npub.slice(0, 8)}`
        }
      })

      await prisma.estadistica.create({
        data: {
          usuarioId: user.id
        }
      })
    }

    if (user.privateKeyEncrypted !== privateKey) {
      await prisma.usuario.update({
        where: { id: user.id },
        data: { privateKeyEncrypted: privateKey }
      })
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        npub: user.npub,
        username: user.username
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
