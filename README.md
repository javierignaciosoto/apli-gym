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

No necesita instalación ni servidor. Abre `index.html` en el navegador (doble clic).

Para usarla desde el celular, publícala con GitHub Pages (Settings → Pages) apuntando a esta carpeta, o sírvela localmente:

```bash
cd apli-gym
python3 -m http.server 8000
# luego abre http://localhost:8000
```

> Los datos se guardan en el `localStorage` del navegador: cada navegador/dispositivo tiene sus propios datos. Usa **Exportar JSON** para respaldar.

## Estructura

```
apli-gym/
├── index.html          # Interfaz
├── styles.css          # Estilos (modo claro/oscuro, responsive)
├── js/
│   ├── storage.js      # Capa de datos (único punto que toca localStorage)
│   ├── chart.js        # Gráfico SVG sin dependencias
│   └── app.js          # Lógica de la interfaz
└── docs/adr/
    └── ADR-001-arquitectura-apli-gym.md
```

## Próximos pasos

Ver la decisión de arquitectura y el roadmap en [`docs/adr/ADR-001-arquitectura-apli-gym.md`](docs/adr/ADR-001-arquitectura-apli-gym.md):

1. ~~Objetivos por ejercicio~~ ✅
2. PWA instalable en el celular.
3. Sincronización en la nube.
