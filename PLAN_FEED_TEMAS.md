# Plan: Feed de Nostr + Sistema de Temas

## PARTE 1: Corregir Bugs de Posts/Comentarios

### Problemas identificados

1. **Lógica incorrecta de identificación** (`Feed.tsx:147-154`)
   - Usa solo el tag 'e' para determinar si es comentario
   - Nostr puede tener múltiples tags 'e' (root + reply)

2. **Carga de comentarios rota** (`Feed.tsx:124-130`)
   - Al cargar más posts, los comentarios no se cargan
   - Solo se cargan en la carga inicial

3. **Profundidad limitada** (`Feed.tsx:158`)
   - `if (depth > 1) return []` limita a solo 2 niveles

### Solución propuesta

- Usar lógica correcta de Nostr: verificar si el evento referenciado existe en la lista
- Agregar carga de comentarios on-demand o con "ver más comentarios"
- Soportar threads profundos (más de 2 niveles)

---

## PARTE 2: Mejorar UI del Feed

### Referencia: iris.to / nostrdesign.org

**Cambios visuales:**
- Cards con mejor espaciado y sombras (en lugar de solo bordes)
- Líneas verticales de threading para comentarios anidados
- Avatares más prominentes (48px posts, 40px comentarios)
- Timestamps relativos ("hace 5 min", "ayer")
- Botón "mostrar más respuestas" para threads largos
- Separador visual claro entre posts

---

## PARTE 3: Sistema de Temas (copiado de NYM)

### Temas disponibles

| Tema | Primary | Secondary | Text | Background |
|------|---------|-----------|------|------------|
| **Matrix** (default) | #00ff00 | #00ffff | #00ff00 | #000000 |
| **Amber** | #ffb000 | #ffd700 | #ffb000 | #000000 |
| **Cyberpunk** | #ff00ff | #00ffff | #ff00ff | #000000 |
| **Hacker** | #00ffff | #00ff00 | #00ffff | #000000 |
| **Ghost** | #ffffff | #cccccc | #ffffff | #000000 |

### Implementación

1. **Crear ThemeStore** (`src/stores/themeStore.ts`)
   - Estado para tema actual
   - Persistencia en localStorage
   - Funciones para cambiar tema

2. **Crear componente ThemeSelector** (`src/components/Layout/ThemeSelector.tsx`)
   - Dropdown en Navbar
   - Opciones visualmente diferenciadas
   - Preview del color

3. **Actualizar globals.css**
   - Definir variables CSS para cada tema
   - Aplicar theme class al body

4. **Integrar en Navbar** (`src/components/Layout/Navbar.tsx`)
   - Añadir ThemeSelector

---

## Archivos a modificar

1. `src/components/Nostr/Feed.tsx` - Corregir bugs + mejorar UI
2. `src/stores/themeStore.ts` - **NUEVO** - Theme store
3. `src/components/Layout/ThemeSelector.tsx` - **NUEVO** - Selector de tema
4. `src/components/Layout/Navbar.tsx` - Añadir ThemeSelector
5. `src/app/globals.css` - Definir variables de temas

---

## Notas adicionales

- El proyecto usa Tailwind CSS
- Nostr utiliza eventos kind 1 para posts y comentarios
- Los comentarios se identifican por tener tags 'e' que referencian al post padre
- La paginación actual solo carga posts, no comentarios adicionales
