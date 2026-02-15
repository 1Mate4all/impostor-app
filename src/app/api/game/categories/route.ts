import { NextResponse } from 'next/server'

const CATEGORIES = [
  { id: 1, name: 'Frutas' },
  { id: 2, name: 'Animales' },
  { id: 3, name: 'Países' },
  { id: 4, name: 'Colores' },
  { id: 5, name: 'Profesiones' },
  { id: 6, name: 'Comida' },
  { id: 7, name: 'Deportes' },
  { id: 8, name: 'Objetos' },
]

export async function GET() {
  try {
    return NextResponse.json(CATEGORIES)
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 })
  }
}
