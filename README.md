# Jimbo Cocktail Society 🍸

Colección personal de cócteles IBA (fichas, historia, "mi despensa", notas de cata) con
perfiles de usuario y sincronización en Firebase Realtime Database.

Este proyecto era originalmente **un único archivo HTML de 140 KB** (CSS y JavaScript
embebidos). Se ha reestructurado en un proyecto multi-archivo estándar, listo para
publicar en GitHub y desplegar en GitHub Pages.

## 📁 Estructura del proyecto

```
jimbo-cocktail-society/
├── index.html              ← Página principal (solo HTML, sin CSS/JS embebido)
├── package.json             ← Scripts de build (minificación)
├── src/                     ← Código fuente, legible, para editar
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── data.js          ← Los 130 cócteles IBA (módulo ES independiente)
│       └── app.js           ← Lógica de la app (Firebase, render, modales, quiz…)
└── dist/                    ← Código de PRODUCCIÓN (generado, minificado)
    ├── css/styles.css
    └── js/{data.js, app.js}
```

`index.html` carga siempre lo que hay en `dist/`. Si editas algo en `src/`, tienes que
volver a generar `dist/` (ver más abajo).

## ⚡ Por qué está dividido así (y qué gana el rendimiento)

- **Cacheable por separado**: el CSS y el JS ya no viajan pegados al HTML. Un
  navegador que ya visitó la página solo vuelve a descargar `index.html`
  (~4 KB comprimido) en visitas posteriores, no los 130 cócteles de nuevo.
- **`data.js` separado de `app.js`**: los datos de los cócteles (que son el 55% del
  peso total) cambian poco; la lógica de la app puede evolucionar sin invalidar esa
  caché, y viceversa.
- **Minificación real** vía `terser` (JS) y `clean-css` (CSS) en vez de "aplastar" el
  código a mano — más seguro y más eficaz.
- **`preconnect`** a Google Fonts, cdnjs y Firebase para que el navegador abra esas
  conexiones en paralelo en lugar de en cascada.
- El script de DOMPurify se carga con `defer` para no bloquear el renderizado inicial.

Como la mayor parte del peso original son datos de texto (nombres, historias e
ingredientes de 130 cócteles en español), la minificación por sí sola no lo reduce
drásticamente — pero la posibilidad de cachear cada pieza por separado sí reduce mucho
la **transferencia real en visitas repetidas**, que es lo que más importa en una app
que se usa a diario.

## 🔧 Requisitos

- [Git](https://git-scm.com/)
- [Node.js](https://nodejs.org/) 18+ (solo si quieres editar `src/` y regenerar `dist/`;
  **no hace falta** para simplemente ver la web, `dist/` ya viene generado)
- Una cuenta de GitHub

## 🖥️ Cómo probarlo en local

El proyecto usa módulos JavaScript (`type="module"`) y llamadas `fetch`, así que
**no puedes abrir `index.html` haciendo doble clic** (protocolo `file://`); hace falta
servirlo por HTTP. Dos opciones sencillas:

**Opción A — con Node (recomendado, ya tienes `package.json`):**
```bash
cd jimbo-cocktail-society
npx serve . -l 5500
```
Abre <http://localhost:5500> en el navegador.

**Opción B — con Python (si no quieres instalar nada de Node):**
```bash
cd jimbo-cocktail-society
python3 -m http.server 5500
```
Abre <http://localhost:5500> en el navegador.

Cualquier cambio en `index.html` se ve al recargar. Si cambias algo dentro de
`src/css` o `src/js`, antes de recargar tienes que reconstruir `dist/` (siguiente
sección).

## 🏗️ Cómo reconstruir `dist/` tras editar `src/`

```bash
cd jimbo-cocktail-society
npm install       # solo la primera vez
npm run build     # regenera dist/css y dist/js minificados
```

Scripts disponibles:
- `npm run build` — build completo (CSS + JS)
- `npm run build:css` — solo CSS
- `npm run build:js` — solo JS
- `npm run clean` — borra `dist/`


