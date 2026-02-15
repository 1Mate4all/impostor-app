import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { npub, gano, rol, palabra, categoria, jugadores, impostores, publicadaNostr, notaNostrId } = await request.json()

    if (!npub) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const usuario = await prisma.usuario.findUnique({
      where: { npub }
    })

    if (!usuario) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    // Guardar partida
    const partida = await prisma.partida.create({
      data: {
        idSesion: 0, // Para partidas locales no hay sesión
        palabraUsada: palabra || '',
        categoria: categoria || '',
        duracion: 0, // Por ahora 0, podría calcularse
        ganador: gano ? 'impostor' : 'ciudadano',
        jugadorId: usuario.id,
        gano,
        rol,
        notaNostrId: notaNostrId || null,
      }
    })

    // Actualizar o crear estadísticas del usuario
    let estadistica = await prisma.estadistica.findUnique({
      where: { usuarioId: usuario.id }
    })

    if (!estadistica) {
      estadistica = await prisma.estadistica.create({
        data: {
          usuarioId: usuario.id,
          partidasJugadas: 1,
          partidasGanadas: gano ? 1 : 0,
          partidasPerdidas: gano ? 0 : 1,
          vecesImpostor: rol === 'impostor' ? 1 : 0,
          vecesCiudadano: rol === 'ciudadano' ? 1 : 0,
        }
      })
    } else {
      const updateData: any = {
        partidasJugadas: { increment: 1 }
      }
      
      if (gano) {
        updateData.partidasGanadas = { increment: 1 }
      } else {
        updateData.partidasPerdidas = { increment: 1 }
      }
      
      if (rol === 'impostor') {
        updateData.vecesImpostor = { increment: 1 }
      } else if (rol === 'ciudadano') {
        updateData.vecesCiudadano = { increment: 1 }
      }

      estadistica = await prisma.estadistica.update({
        where: { usuarioId: usuario.id },
        data: updateData
      })
    }

    // Actualizar estadísticas globales
    let statsGlobales = await prisma.estadisticaGlobal.findFirst()
    
    if (!statsGlobales) {
      statsGlobales = await prisma.estadisticaGlobal.create({
        data: {
          totalPartidas: 1,
          totalImpostores: impostores || 0,
          totalCiudadanos: (jugadores - impostores) || 0,
        }
      })
    } else {
      statsGlobales = await prisma.estadisticaGlobal.update({
        where: { id: statsGlobales.id },
        data: {
          totalPartidas: { increment: 1 },
          totalImpostores: { increment: impostores || 0 },
          totalCiudadanos: { increment: (jugadores - impostores) || 0 },
        }
      })
    }

    return NextResponse.json({ 
      success: true, 
      stats: estadistica,
      statsGlobales,
      partidaId: partida.id
    })
  } catch (error) {
    console.error('Error saving stats:', error)
    return NextResponse.json({ error: 'Error al guardar stats' }, { status: 500 })
  }
}

export async function GET() {
  try {
    // Obtener estadísticas globales
    let statsGlobales = await prisma.estadisticaGlobal.findFirst()
    
    if (!statsGlobales) {
      statsGlobales = await prisma.estadisticaGlobal.create({
        data: {
          totalPartidas: 0,
          totalImpostores: 0,
          totalCiudadanos: 0,
        }
      })
    }

    // Obtener todas las estadísticas de usuarios
    const estadisticasUsuarios = await prisma.estadistica.findMany({
      include: {
        usuario: {
          select: {
            npub: true,
            username: true
          }
        }
      }
    })

    return NextResponse.json({
      global: statsGlobales,
      usuarios: estadisticasUsuarios
    })
  } catch (error) {
    console.error('Error fetching stats:', error)
    return NextResponse.json({ error: 'Error al obtener stats' }, { status: 500 })
  }
}
