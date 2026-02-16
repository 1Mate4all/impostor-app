# Plan: Eliminar Auto-Refresh, Paginación y Corregir Temas

## Problemas Actuales

1. **Auto-refresh each 15 seconds**: The feed refreshes every 15 seconds, causing posts to stop displaying correctly.

2. **Themes not applying**: When selecting a theme from the selector, the colors do not apply to the site.

---

## Objetivos

1. Eliminar el auto-refresh de 15 segundos
2. Implementar paginación manual con botón "Cargar más"
3. Mostrar 10 posts iniciales y cargar 10 más por click
4. Corregir que los temas se apliquen correctamente al sitio

---

## Cambios en `src/components/Nostr/Feed.tsx`

### 1. Eliminar Auto-Refresh
- Quitar el `setInterval` que ejecuta `fetchNotes()` cada 15 segundos
- Solo cargar una vez al montar el componente (useEffect)

### 2. Cambiar Configuración de Paginación
- `NOTES_PER_PAGE`: cambiar de 50 a **10**
- Usar `until` con el timestamp del post más antiguo cargado para paginar hacia atrás

### 3. Botón "Cargar más"
- Mantener el botón existente para cargar siguientes 10 posts
- Mostrar "No hay más posts" cuando el relay no devuelva más eventos

---

## Cambios en Componentes de Temas

### Problema identificado
Los temas no se aplican porque:
1. El ThemeInitializer aplica los colores solo una vez al montar
2. No hay un useEffect que escuche cambios en el tema después de la carga inicial
3. Los componentes del sitio usan colores hardcodeados en lugar de variables CSS

### Solución
1. Modificar `ThemeInitializer.tsx` para escuchar cambios del tema correctamente
2. Modificar `ThemeSelector.tsx` para forzar re-render del tema
3. Los colores se almacenan en variables CSS: `--primary`, `--secondary`, `--accent`, `--bg-theme`

---

## Estado Final Esperado

- Al cargar la página: 10 posts más recientes
- Al hacer click en "Cargar más": 10 posts anteriores
- Sin auto-refresh automático
- Los temas se aplican correctamente al seleccionar cualquier tema
