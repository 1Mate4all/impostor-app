import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ npub: string }> }
) {
  try {
    const { npub } = await params

    if (!npub) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const usuario = await prisma.usuario.findUnique({
      where: { npub },
      include: {
        estadisticas: true,
        posts: {
          orderBy: { createdAt: 'desc' },
          take: 20
        }
      }
    })

    if (!usuario) {
      return NextResponse.json({ 
        username: 'Usuario',
        npub: npub,
        stats: {
          partidasJugadas: 0,
          partidasGanadas: 0,
          partidasPerdidas: 0,
          vecesImpostor: 0,
          vecesCiudadano: 0,
        },
        posts: []
      })
    }

    const stats = usuario.estadisticas

    return NextResponse.json({
      username: usuario.username,
      npub: usuario.npub,
      stats: {
        partidasJugadas: stats?.partidasJugadas || 0,
        partidasGanadas: stats?.partidasGanadas || 0,
        partidasPerdidas: stats?.partidasPerdidas || 0,
        vecesImpostor: stats?.vecesImpostor || 0,
        vecesCiudadano: stats?.vecesCiudadano || 0,
      },
      posts: usuario.posts
    })
  } catch (error) {
    console.error('Error fetching profile:', error)
    return NextResponse.json({ error: 'Error al obtener perfil' }, { status: 500 })
  }
}
