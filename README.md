# 🏋️ Apli-Gym

Aplicación web para registrar tus pesos del gimnasio y ver tu progreso en un gráfico.

## Qué hace

- **Registrar** cada ejercicio con fecha, nombre del ejercicio, implemento (**barra**, **mancuernas** o **peso corporal**), peso, series, repeticiones y notas.
- **Gráfico de progreso** por ejercicio, con una línea por implemento. Métricas:
  - Peso máximo del día
  - 1RM estimado (fórmula de Epley)
  - Volumen (series × reps × kg)
  - Repeticiones máximas (útil para peso corporal)
- **Resumen**: récord personal, último registro, progreso desde el inicio y días entrenados.
- **Objetivos** por ejercicio e implemento (peso máximo, 1RM estimado o repeticiones), con fecha límite opcional:
  barra de avance, estado (en curso / logrado / vencido), ritmo semanal necesario y línea de meta en el gráfico.
- **Historial** filtrable por ejercicio, con opción de eliminar registros.
- **Respaldo**: exportar e importar los datos en JSON.

Convenciones de peso:
- Mancuernas → peso de **una** mancuerna.
- Peso corporal → **lastre adicional** (0 si no usas).

## Cómo usarla

### En el celular (recomendado) 📱

Apli-Gym es una **app instalable (PWA)**: se agrega a la pantalla de inicio con su ícono, abre a pantalla completa y **funciona sin internet** en el gimnasio.

**1. Publicarla (una sola vez)** con GitHub Pages, que da la dirección HTTPS que necesita una app instalable:

1. Une esta rama a `main`. El workflow `.github/workflows/deploy.yml` publica la app cada vez que cambia `main`.
2. En GitHub: **Settings → Pages → Build and deployment → Source: “GitHub Actions”**.
3. Espera a que termine la acción **“Publicar Apli-Gym en GitHub Pages”** (pestaña *Actions*). La dirección queda como
   `https://<tu-usuario>.github.io/apli-gym/`.

> GitHub Pages en planes gratuitos requiere que el repositorio sea **público**. El código no contiene datos personales: tus registros viven solo en tu celular.

**2. Instalarla**

- **Android (Chrome):** abre la dirección y toca **“📲 Instalar en el celular”** (o menú ⋮ → *Instalar app*).
- **iPhone (Safari):** abre la dirección, toca **Compartir ⬆️ → “Agregar a pantalla de inicio”**.

Después ábrela siempre desde el ícono. Cada vez que publiques cambios, la app se actualiza sola la siguiente vez que la abras con internet.

### En el computador

Abre `index.html` con doble clic, o sírvela localmente:

```bash
python3 -m http.server 8000
# luego abre http://localhost:8000
```

> Los datos se guardan en el navegador de cada dispositivo (no se comparten entre el celular y el PC). Usa **Exportar JSON** para respaldar o para pasar datos de uno a otro con **Importar JSON**.

## Estructura

```
.
├── .github/workflows/deploy.yml  # Publica en GitHub Pages
├── index.html            # Interfaz
├── styles.css            # Estilos (modo claro/oscuro, responsive)
├── manifest.webmanifest  # Nombre, ícono y colores de la app instalable
├── sw.js                 # Service worker: uso sin internet (subir CACHE_VERSION al cambiar archivos)
├── icons/                # Íconos (fuente: icon.svg)
├── js/
│   ├── storage.js        # Capa de datos (único punto que toca localStorage)
│   ├── chart.js          # Gráfico SVG sin dependencias
│   ├── app.js            # Lógica de la interfaz
│   └── pwa.js            # Instalación, service worker y almacenamiento persistente
└── docs/adr/
    └── ADR-001-arquitectura-apli-gym.md
```

## Próximos pasos

Ver la decisión de arquitectura y el roadmap en [`docs/adr/ADR-001-arquitectura-apli-gym.md`](docs/adr/ADR-001-arquitectura-apli-gym.md):

1. ~~Objetivos por ejercicio~~ ✅
2. ~~App instalable en el celular (PWA)~~ ✅
3. Sincronización en la nube.
