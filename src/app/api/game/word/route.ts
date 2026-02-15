import { NextResponse } from 'next/server'
import { prisma } from '@/lib/db'

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const categoryIds = searchParams.get('categories')

    let where = {}
    
    if (categoryIds) {
      const ids = categoryIds.split(',').map(Number).filter(n => !isNaN(n))
      if (ids.length > 0) {
        where = { categoriaId: { in: ids } }
      }
    }

    let palabras = await prisma.palabra.findMany({ where })

    if (palabras.length === 0) {
      const defaultPalabras = [
        { palabra: 'MANZANA', categoriaId: 1 },
        { palabra: 'PLÁTANO', categoriaId: 1 },
        { palabra: 'UVA', categoriaId: 1 },
        { palabra: 'NARANJA', categoriaId: 1 },
        { palabra: 'FRESA', categoriaId: 1 },
        { palabra: 'PERA', categoriaId: 1 },
        { palabra: 'SANDÍA', categoriaId: 1 },
        { palabra: 'MANGO', categoriaId: 1 },
        { palabra: 'PERRO', categoriaId: 2 },
        { palabra: 'GATO', categoriaId: 2 },
        { palabra: 'LEÓN', categoriaId: 2 },
        { palabra: 'TIGRE', categoriaId: 2 },
        { palabra: 'ELEFANTE', categoriaId: 2 },
        { palabra: 'JIRAFA', categoriaId: 2 },
        { palabra: 'MONO', categoriaId: 2 },
        { palabra: 'ESPAÑA', categoriaId: 3 },
        { palabra: 'ARGENTINA', categoriaId: 3 },
        { palabra: 'BRASIL', categoriaId: 3 },
        { palabra: 'MÉXICO', categoriaId: 3 },
        { palabra: 'CHILE', categoriaId: 3 },
        { palabra: 'COLOMBIA', categoriaId: 3 },
        { palabra: 'PERÚ', categoriaId: 3 },
        { palabra: 'ROJO', categoriaId: 4 },
        { palabra: 'AZUL', categoriaId: 4 },
        { palabra: 'VERDE', categoriaId: 4 },
        { palabra: 'AMARILLO', categoriaId: 4 },
        { palabra: 'MÉDICO', categoriaId: 5 },
        { palabra: 'ABOGADO', categoriaId: 5 },
        { palabra: 'MAESTRO', categoriaId: 5 },
        { palabra: 'INGENIERO', categoriaId: 5 },
        { palabra: 'CHEF', categoriaId: 5 },
        { palabra: 'POLICÍA', categoriaId: 5 },
      ]

      for (const p of defaultPalabras) {
        await prisma.palabra.create({ data: p })
      }

      palabras = await prisma.palabra.findMany({ where })
    }

    if (palabras.length === 0) {
      return NextResponse.json({ word: 'CASA' })
    }

    const randomWord = palabras[Math.floor(Math.random() * palabras.length)]
    
    return NextResponse.json({ word: randomWord.palabra })
  } catch (error) {
    console.error('Error fetching word:', error)
    return NextResponse.json({ word: 'CASA' })
  }
}
