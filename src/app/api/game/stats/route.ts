import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const { npub, stats } = await request.json()

    if (!npub) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    return NextResponse.json({ 
      success: true,
      message: 'Las estadísticas se guardan en el cliente (localStorage)'
    })
  } catch (error) {
    console.error('Error saving stats:', error)
    return NextResponse.json({ error: 'Error al guardar stats' }, { status: 500 })
  }
}

export async function GET() {
  return NextResponse.json({
    message: 'Las estadísticas se guardan en el cliente (localStorage)'
  })
}
