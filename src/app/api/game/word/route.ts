import { NextResponse } from 'next/server'

const WORDS = {
  1: [
    'MANZANA', 'PLÁTANO', 'UVA', 'NARANJA', 'FRESA', 'PERA', 'SANDÍA', 'MANGO',
    'CEREZA', 'MELÓN', 'KIWI', 'PAPAYA', 'MARACUYÁ', 'LIMÓN', 'COCO', 'HIGO'
  ],
  2: [
    'PERRO', 'GATO', 'LEÓN', 'TIGRE', 'ELEFANTE', 'JIRAFA', 'MONO', 'CABALLO',
    'VACA', 'OVEJA', 'CERDO', 'POLLO', 'ÁGUILA', 'LOBO', 'ZORRO', 'OSO'
  ],
  3: [
    'ESPAÑA', 'ARGENTINA', 'BRASIL', 'MÉXICO', 'CHILE', 'COLOMBIA', 'PERÚ',
    'URUGUAY', 'ECUADOR', 'VENEZUELA', 'PARAGUAY', 'BOLIVIA', 'PANAMÁ', 'CUBA'
  ],
  4: [
    'ROJO', 'AZUL', 'VERDE', 'AMARILLO', 'NARANJA', 'MORADO', 'ROSADO', 'NEGRO',
    'BLANCO', 'GRIS', 'MARRÓN', 'CELESTE', 'DORADO', 'PLATEADO'
  ],
  5: [
    'MÉDICO', 'ABOGADO', 'MAESTRO', 'INGENIERO', 'CHEF', 'POLICÍA', 'BOMBERO',
    'PILOTO', 'ACTOR', 'MÚSICO', 'ARTISTA', 'DEPORTISTA', 'CIENTÍFICO', 'COCINERO'
  ],
  6: [
    'ARROZ', 'PASTA', 'PAN', 'CARNE', 'PESCADO', 'HAMBURGUESA', 'PIZZA', 'TACO',
    'SOPA', 'ENSALADA', 'HUEVO', 'LECHE', 'QUESO', 'MANTEQUILLA', 'DULCE'
  ],
  7: [
    'FÚTBOL', 'BASKETBALL', 'TENIS', 'GOLF', 'NATACIÓN', 'ATLETISMO', 'BÉISBOL',
    'VOLEIBOL', 'BOXEO', 'LUCHA', 'CICLISMO', 'ESQUÍ', 'SURF', 'RUGBY'
  ],
  8: [
    'CASA', 'COCHE', 'TELÉFONO', 'COMPUTADORA', 'LIBRO', 'MESA', 'SILLA', 'CAMA',
    'LÁMPARA', 'RELOJ', 'CÁMARA', 'TELEVISOR', 'RADIO', 'CUCHILLO', 'TENEDOR'
  ]
}

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

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const categoryIds = searchParams.get('categories')

    let availableCategories = CATEGORIES
    
    if (categoryIds) {
      const ids = categoryIds.split(',').map(Number).filter(n => !isNaN(n) && n > 0 && n <= 8)
      if (ids.length > 0) {
        availableCategories = CATEGORIES.filter(c => ids.includes(c.id))
      }
    }

    const randomCategory = availableCategories[Math.floor(Math.random() * availableCategories.length)]
    const words = WORDS[randomCategory.id as keyof typeof WORDS] || []
    const randomWord = words[Math.floor(Math.random() * words.length)]
    
    return NextResponse.json({ 
      word: randomWord || 'CASA',
      categoria: randomCategory.name
    })
  } catch (error) {
    console.error('Error fetching word:', error)
    return NextResponse.json({ word: 'CASA' })
  }
}
