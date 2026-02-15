import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET() {
  try {
    let categorias = await prisma.categoria.findMany()
    
    if (categorias.length === 0) {
      const defaultCategorias = [
        { nombre: 'Frutas' },
        { nombre: 'Animales' },
        { nombre: 'Países' },
        { nombre: 'Colores' },
        { nombre: 'Profesiones' },
        { nombre: 'Comida' },
        { nombre: 'Deportes' },
        { nombre: 'Objetos' },
      ]
      
      for (const cat of defaultCategorias) {
        await prisma.categoria.create({ data: cat })
      }
      
      categorias = await prisma.categoria.findMany()
    }
    
    return NextResponse.json(categorias)
  } catch (error) {
    console.error('Error fetching categories:', error)
    return NextResponse.json({ error: 'Error al obtener categorías' }, { status: 500 })
  }
}
