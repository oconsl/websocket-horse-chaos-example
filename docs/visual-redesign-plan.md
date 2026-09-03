# Horse Chaos — Plan de Rediseño Visual

Estado actual: funcional, sin identidad visual (CSS mínimo, sin modo oscuro, sin assets de caballos). Este plan lleva la app de "demo funcional" a "algo que se ve bien proyectado en el aula".

## 1. Objetivos

- Identidad visual propia (paleta, tipografía, tono "gaming/arcade" acorde a los nombres de los caballos).
- Modo claro/oscuro con toggle persistente.
- Ilustraciones/sprites de los 5 caballos, reconocibles por carril y por nombre.
- Fondo/paisaje de pista con parallax simple durante la carrera.
- Sistema de botones/componentes reutilizable (no CSS repetido por página).
- Sin romper nada de lo funcional (server-authoritative, sockets) — esto es 100% capa visual.

## 2. Design system

### 2.1 Paleta

- **Light**: fondo cálido tipo "día de carreras" (crema/beige claro), acentos vivos por caballo (rojo/azul/verde/amarillo/violeta — ya sugeridos en el doc original).
- **Dark**: fondo noche/neón (azul muy oscuro / casi negro), mismos acentos por caballo pero con más saturación/glow para que resalten.
- Definir tokens CSS (`--bg`, `--bg-elevated`, `--text`, `--text-muted`, `--accent-horse-1..5`, `--success`, `--danger`) en `globals.css`, redefinidos bajo `[data-theme="dark"]` y `prefers-color-scheme: dark`.
- Toggle de tema: botón en el header, persistido en `localStorage`, default a preferencia del sistema.

### 2.2 Tipografía

- Un display font tipo "arcade/pixel" solo para títulos y números grandes (coins, countdown, odds) — vía Google Fonts (permitido: `fonts.googleapis.com`).
- Un sans-serif legible para texto de UI/feed de eventos (no todo en pixel font, cansa leer párrafos).

### 2.3 Componentes base (carpeta `web/components/ui/`)

- `Button` (variantes: primary/danger/ghost, estados disabled/loading).
- `Card` / `Panel` (contenedor con borde/sombra consistente, usado en apuestas, powerups, resultados).
- `Badge` (coins, estado de carrera).
- `Stepper` (monto de apuesta, ya existe lógica, falta estilizarlo).
- `ThemeToggle`.

Esto reemplaza el CSS ad-hoc que se fue acumulando página por página en las fases anteriores.

## 3. Caballos — identidad visual

5 caballos, cada uno necesita: **ícono/avatar** (para carriles, feed de eventos, tarjetas de apuesta) + **color de acento**.

| Carril | Caballo | Color acento | Vibe visual |
|---|---|---|---|
| 1 | 🔴 El Backend | rojo | robusto, "tanque" |
| 2 | 🔵 NullPointer | azul | errático, glitch |
| 3 | 🟢 CSS Master | verde | prolijo, geométrico |
| 4 | 🟡 Segmentation Fault | amarillo | caótico, con "grietas" |
| 5 | 🟣 localhost:3000 | violeta | fantasmal/digital |

### Opciones de asset (de más a menos esfuerzo)

1. **Ilustración custom por caballo** (SVG, estilo flat/vector, un artista o generado con herramienta de imagen) — mejor resultado, más trabajo.
2. **Sprite/emoji estilizado**: partir de un emoji de caballo por color/filtro CSS + un ícono temático superpuesto (ej. NullPointer con un glitch effect) — rápido, decente.
3. **Placeholder geométrico con personalidad**: sin ilustración, solo forma (rombo/triángulo) + color + nombre — el fallback si no hay tiempo, mínimo pero coherente.

Recomendación: arrancar con opción 2 (rápido, ya con identidad), dejar opción 1 como mejora incremental si sobra tiempo antes de la clase.

Assets van a `web/public/horses/` (SVG o PNG, uno por caballo + una versión "corriendo" si se anima con CSS sprite/steps()).

## 4. Fondo / paisaje

- Fondo de pista con capas simples (parallax CSS, no necesita librería): cielo/gradiente (cambia con el tema) + una capa de "público"/tribuna difuminada + línea de meta.
- Durante `RACING`, un patrón repetido de pasto/pista se desplaza horizontalmente (CSS `background-position` animado) para dar sensación de movimiento, independiente del movimiento real de los caballos (que sigue viniendo de `race:update`).
- Mantener el `overflow-x` controlado — nada de scroll horizontal de página.

## 5. Rediseño por página

### `/join`
- Pantalla de bienvenida con logo/wordmark "HORSE CHAOS", input grande, botón primary llamativo. Fondo con el paisaje ya en modo estático (sin caballos corriendo todavía).

### `/lobby`
- Header con badge de jugador (avatar genérico + coins) + ThemeToggle.
- Lista de jugadores conectados como grid de chips, no lista simple.
- Nav clara a `/race` y `/leaderboard` (ya corregido a `next/link` en fase 5 — no tocar esa lógica).

### `/race` (la página más importante visualmente)
- Pista de 5 carriles con el paisaje de fondo, cada caballo con su sprite/avatar posicionado por `%` según `race:update` (igual que ahora, solo mejor renderizado — transición CSS suave entre snapshots).
- Panel de apuestas: tarjetas por caballo con avatar + barra de pool + odds, más visual que texto plano.
- Countdown overlay: número grande animado (scale/fade) sobre el paisaje.
- Panel "Tus poderes": tarjetas de powerup con ícono propio por tipo (🚀💣🐌🛡️) y su color de acento.
- Feed de eventos: burbujas/toast que aparecen y se desvanecen (no una lista que crece infinito) — coherente con el mockup del doc original.
- Pantalla de resultados: podio visual (🥇🥈🥉) con los caballos, banner grande de GANASTE/perdiste.

### `/leaderboard`
- Tabla estilizada con rank destacado (medallas para top 3), fila resaltada para el jugador actual.

### `/host`
- No necesita el mismo nivel de pulido (panel de profesor, uso interno) pero sí legibilidad: agrupar acciones por fase del state machine, estado actual bien visible.

## 6. Animación / movimiento

- Transición CSS entre posiciones de `race:update` (ya que llegan a ~10Hz, un `transition: left 100ms linear` en cada caballo da interpolación fluida sin lógica extra — esto es exactamente el punto pedagógico del doc original, "no interpolar en JS, dejar que CSS lo haga").
- Micro-animaciones: countdown (scale pulse), powerup usado (shake/flash en el carril afectado), caballo que termina (bounce + confetti simple con CSS, no librería).
- Reacciones en vivo (emoji flotantes, §15 del doc original) — si se implementa, es una animación CSS de "float up + fade" pura, buen candidato para sumar en esta pasada visual ya que es puramente estética y no toca el server-authoritative core.

## 7. Alcance técnico

- Todo en CSS/CSS Modules o Tailwind (definir cuál — hoy el proyecto usa CSS plano en `globals.css` + `page.module.css`; decidir si se migra a Tailwind o se sigue con CSS plano + tokens, para no mezclar dos sistemas).
- Sin librerías de animación pesadas (Framer Motion sería overkill para esto) — CSS transitions/keyframes alcanzan.
- Assets de caballos como SVG inline o `next/image` optimizado, no imágenes pesadas sin optimizar.

## 8. Fases de implementación sugeridas

1. **Design tokens + modo claro/oscuro** — paleta, toggle, tipografía. Base para todo lo demás.
2. **Componentes UI reutilizables** — Button/Card/Badge/Stepper, migrar páginas existentes a usarlos.
3. **Identidad de caballos** — avatares/sprites + color de acento, aplicado en `/race` y `/leaderboard`.
4. **Paisaje de fondo + animación de pista** — en `/race`.
5. **Pulido de countdown, resultados, feed de eventos** — micro-animaciones.
6. **Pase final de responsive** — verificar que se vea bien proyectado (pantalla grande) y en laptops de alumnos.

## 9. Fuera de alcance de este plan

- Cualquier cambio a lógica de servidor, sockets, o reglas de juego — esto es 100% visual sobre lo ya construido.
- Assets de audio/sonido (no pedido, se puede sumar después).
- Sistema de skins/cosméticos por jugador (mencionado como expansión en el doc original, no en este pase).
