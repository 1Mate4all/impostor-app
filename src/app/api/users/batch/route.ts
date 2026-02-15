import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function POST(request: Request) {
  try {
    const { npubs } = await request.json()

    if (!npubs || !Array.isArray(npubs) || npubs.length === 0) {
      return NextResponse.json({ users: [] })
    }

    const users = await prisma.usuario.findMany({
      where: {
        npub: {
          in: npubs
        }
      },
      select: {
        npub: true,
        username: true
      }
    })

    const userMap = users.reduce((acc, user) => {
      acc[user.npub] = user.username
      return acc
    }, {} as Record<string, string>)

    return NextResponse.json({ users: userMap })
  } catch (error) {
    console.error('Error fetching batch users:', error)
    return NextResponse.json({ users: {} })
  }
}
