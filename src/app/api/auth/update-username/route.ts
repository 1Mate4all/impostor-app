import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { npub, username } = await request.json()

    if (!npub || !username) {
      return NextResponse.json(
        { error: 'Faltan datos requeridos' },
        { status: 400 }
      )
    }

    const existing = await prisma.usuario.findFirst({
      where: { username, NOT: { npub } }
    })

    if (existing) {
      return NextResponse.json(
        { error: 'El nombre de usuario ya está en uso' },
        { status: 400 }
      )
    }

    await prisma.usuario.update({
      where: { npub },
      data: { username }
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error updating username:', error)
    return NextResponse.json(
      { error: 'Error al actualizar nombre de usuario' },
      { status: 500 }
    )
  }
}
