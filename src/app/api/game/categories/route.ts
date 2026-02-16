import { NextResponse } from 'next/server'

const CATEGORIES = [
  { id: 1, nombre: 'Frutas' },
  { id: 2, nombre: 'Animales' },
  { id: 3, nombre: 'Países' },
  { id: 4, nombre: 'Colores' },
  { id: 5, nombre: 'Profesiones' },
  { id: 6, nombre: 'Comida' },
  { id: 7, nombre: 'Deportes' },
  { id: 8, nombre: 'Objetos' },
]

export async function GET() {
  try {
    return NextResponse.json(CATEGORIES)
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 })
  }
}
