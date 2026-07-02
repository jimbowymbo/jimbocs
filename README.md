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

## 🚀 Cómo publicarlo en GitHub (paso a paso)

### 1. Crea el repositorio en GitHub
1. Entra en [github.com/new](https://github.com/new).
2. Ponle un nombre, por ejemplo `jimbo-cocktail-society`.
3. Déjalo público (o privado, si prefieres) y **no** marques "Add a README" (ya
   tenemos uno).
4. Pulsa **Create repository**. GitHub te mostrará una URL como
   `https://github.com/tu-usuario/jimbo-cocktail-society.git`.

### 2. Sube el proyecto desde tu ordenador
Desde la carpeta del proyecto:
```bash
cd jimbo-cocktail-society
git init
git add .
git commit -m "Primera versión: proyecto reestructurado en múltiples archivos"
git branch -M main
git remote add origin https://github.com/TU-USUARIO/jimbo-cocktail-society.git
git push -u origin main
```
(Sustituye `TU-USUARIO` por tu usuario real de GitHub.)

### 3. Activa GitHub Pages
1. En tu repositorio de GitHub, ve a **Settings → Pages**.
2. En "Build and deployment" → "Source", elige **Deploy from a branch**.
3. En "Branch", elige `main` y la carpeta `/ (root)`.
4. Pulsa **Save**.
5. Espera 1–2 minutos; GitHub te dará la URL pública, algo como:
   `https://tu-usuario.github.io/jimbo-cocktail-society/`

Listo: tu web ya está publicada y cualquiera puede entrar con esa URL.

### 4. Actualizar la web tras hacer cambios
```bash
# edita lo que necesites en src/ y/o index.html
npm run build          # si tocaste src/css o src/js
git add .
git commit -m "Describe aquí el cambio"
git push
```
GitHub Pages se actualiza sola en cuanto detecta el `push` a `main` (unos segundos).

## ⚠️ Notas importantes

- **Claves de Firebase visibles en el código**: la configuración de Firebase
  (`apiKey`, `databaseURL`, etc.) es pública por diseño en cualquier app de Firebase
  del lado del cliente — no es un secreto que haya que ocultar. La seguridad real la
  dan las **Reglas de seguridad** de tu Realtime Database. Antes de publicar,
  revisa esas reglas en la consola de Firebase para asegurarte de que solo permiten
  leer/escribir lo que corresponde a cada usuario.
- **Historia generada por IA**: la función que pide la historia de un cóctel a la API
  de Anthropic (`loadHistoria()`) hace la llamada directamente desde el navegador sin
  clave de API — funciona dentro del entorno de vista previa de Claude, pero **una vez
  publicado en GitHub Pages esa llamada fallará** (no hay clave ni backend que la
  gestione). No es un problema grave: casi todos los cócteles ya traen su historia
  guardada en `data.js`, así que la app simplemente mostrará ese texto guardado en vez
  de generar uno nuevo. Si en el futuro quieres que esa función funcione en producción,
  necesitarías un pequeño backend/proxy propio que guarde la clave de la API de forma
  segura (por ejemplo, una Cloud Function de Firebase).
