# ADR-001: Arquitectura de Apli-Gym (registro de pesos y progreso)

**Status:** Accepted
**Date:** 2026-11-10
**Deciders:** Javier (dueño del producto y único usuario por ahora)

## Context

Quiero una aplicación de registro personal para el gimnasio donde pueda:

- Ingresar cada serie/ejercicio con **fecha**, **tipo de ejercicio**, **peso** y **implemento** (mancuernas, barra o peso corporal), además de series y repeticiones.
- Ver un **gráfico entendible** de mi progreso por ejercicio.
- Más adelante, agregar **objetivos** (ej. "Press banca 80 kg al 31/12") y otras funciones (rutinas, récords personales, sincronización entre dispositivos).

Fuerzas en juego:

- Es un proyecto personal: un solo usuario, volumen de datos pequeño (miles de registros como máximo en años).
- Debe ser usable desde el celular en el gimnasio, rápido de cargar y sin fricción.
- No quiero pagar ni mantener un servidor en esta etapa.
- El diseño debe permitir crecer (objetivos, sincronización) sin reescribir todo.

## Decision

Construir una **aplicación web estática (HTML + CSS + JavaScript sin frameworks ni dependencias)** que guarda los datos en el **`localStorage` del navegador**, con:

1. Una **capa de almacenamiento aislada** (`js/storage.js`) que expone una API tipo repositorio (`listEntries`, `addEntry`, `deleteEntry`, `exportData`, `importData`, …). El resto de la app nunca toca `localStorage` directamente; así, migrar a IndexedDB o a un backend (Supabase/Firebase/API propia) solo cambia ese archivo.
2. Un **esquema de datos versionado** (`schemaVersion`) que ya reserva la colección `goals` para la fase de objetivos.
3. **Gráfico SVG propio** (`js/chart.js`), sin librerías externas, para que funcione offline y sin CDN.
4. **Exportar / importar JSON** como respaldo manual mientras no exista sincronización.

### Modelo de datos (v1)

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "id": "uuid",
      "date": "2026-11-10",
      "exercise": "Press banca",
      "equipment": "barra | mancuernas | peso_corporal",
      "weight": 60,
      "sets": 4,
      "reps": 8,
      "notes": "",
      "createdAt": "ISO-8601"
    }
  ],
  "goals": []
}
```

Convenciones:

- `weight` en **kg**. Con **mancuernas** es el peso de **una** mancuerna. Con **peso corporal** es el **lastre adicional** (0 si no hay).
- Métrica del gráfico por día y ejercicio: **peso máximo** levantado, o **1RM estimado** (fórmula de Epley: `peso × (1 + reps/30)`). Para peso corporal sin lastre se grafican **repeticiones máximas**.
- Objetivos (fase 2, implementada): `{ id, exercise, equipment, metric: "weight|e1rm|reps", target, deadline?, createdAt }`.
  El avance y la fecha de logro **no se guardan**: se calculan siempre desde los registros (mejor marca ÷ meta), así nunca quedan desincronizados si se edita o borra un registro.

## Options Considered

### Option A: Web estática + localStorage (elegida)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Low |
| Cost | $0 (se puede publicar gratis en GitHub Pages) |
| Scalability | Suficiente para un usuario; limitado a ~5 MB y a un dispositivo |
| Team familiarity | Alta: HTML/JS estándar |

**Pros:** cero infraestructura, funciona offline, abre con doble clic, fácil de entender y modificar.
**Cons:** los datos viven en un solo navegador (riesgo si se borra el caché → mitigado con exportar JSON); sin sincronización entre celular y PC.

### Option B: SPA (React/Vite) + Backend como servicio (Supabase/Firebase)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | Gratis en capa free, con límites |
| Scalability | Alta, multi-dispositivo, multi-usuario |
| Team familiarity | Media: requiere build, auth y cuentas externas |

**Pros:** datos en la nube, sincronización, autenticación lista.
**Cons:** más piezas móviles (build, auth, claves, políticas de seguridad) antes de registrar el primer peso.

### Option C: Google Sheets como base de datos (Apps Script)

| Dimension | Assessment |
|-----------|------------|
| Complexity | Medium |
| Cost | $0 |
| Scalability | Aceptable para un usuario |
| Team familiarity | Media (encaja con la idea de `automatizacion-buk` de usar Excel/Sheets) |

**Pros:** datos visibles en una planilla, fáciles de analizar.
**Cons:** UI de Apps Script limitada y lenta en móvil; gráficos menos controlables; latencia en cada guardado.

## Trade-off Analysis

El valor principal ahora es **registrar rápido y ver progreso**. La opción A entrega eso hoy con mínimo esfuerzo. El costo es que los datos quedan en un dispositivo; lo mitigamos con exportar/importar JSON y, sobre todo, con la **capa de almacenamiento aislada**, que hace que pasar a la opción B (o C) sea un cambio acotado y no una reescritura. Elegimos no usar frameworks ni librerías de gráficos para evitar un paso de build y dependencias de CDN; si la UI crece mucho (rutinas, múltiples vistas), se reevaluará migrar a un framework.

## Consequences

- **Más fácil:** empezar a usarla ya; desplegar en GitHub Pages; modificar el código sin herramientas.
- **Más difícil:** usar la app en dos dispositivos con los mismos datos (hasta la fase de sincronización).
- **A revisar:**
  - Si los datos superan ~1–2 MB o se requiere sync → migrar `storage.js` a IndexedDB o a Supabase.
  - Si se agregan muchas vistas → evaluar un framework ligero (Preact/Vue/React).

## Action Items

1. [x] Formulario de registro (fecha, ejercicio, implemento, peso, series, reps, notas).
2. [x] Historial con filtro por ejercicio y opción de eliminar.
3. [x] Gráfico de progreso por ejercicio (peso máximo / 1RM estimado / reps).
4. [x] Resumen: récord personal, último registro y variación.
5. [x] Exportar / importar JSON.
6. [x] Fase 2: **Objetivos** por ejercicio, con línea de meta en el gráfico y % de avance (ver nota abajo).
7. [x] Fase 3: PWA instalable (manifest + service worker) para usarla como app en el celular (ver nota abajo).
8. [x] Fase 4: Sincronización en la nube (Supabase). Detalle en [ADR-002](ADR-002-sincronizacion-nube.md).
9. [ ] Ideas futuras: rutinas/plantillas, volumen semanal por grupo muscular, alertas de récord.

## Nota de implementación — Fase 2 (Objetivos)

- Un objetivo es por **ejercicio + implemento + métrica** (peso máximo, 1RM estimado o repeticiones). El volumen se excluyó porque depende del día y no es una meta estable.
- Estados: **en curso**, **logrado** (primer registro que alcanza la meta) y **vencido** (pasó la fecha límite sin lograrlo).
- Con fecha límite se muestra el ritmo necesario (≈ kg o reps por semana).
- La meta se dibuja como línea punteada en el gráfico cuando coinciden ejercicio y métrica.
- No hizo falta migrar el esquema: `goals` ya estaba reservado en v1.

## Nota de implementación — Fase 3 (App para el celular / PWA)

Se eligió **PWA** en vez de una app nativa (Android/iOS) o un empaquetador (Capacitor):

| | PWA (elegida) | App nativa / Capacitor |
|---|---|---|
| Reutiliza el código actual | 100 % | Parcial (Capacitor) / nada (nativa) |
| Costo | $0 | Cuenta de desarrollador (Apple USD 99/año, Google USD 25) |
| Publicación | GitHub Pages, actualización inmediata | Tiendas, revisión de cada versión |
| Funciona sin internet | Sí (service worker) | Sí |

- `manifest.webmanifest`: nombre, íconos (incluye ícono *maskable* para Android) y modo `standalone`.
- `sw.js`: precarga los archivos de la app y usa *stale-while-revalidate*; al publicar cambios se sube `CACHE_VERSION`.
- `js/pwa.js`: botón de instalación (Android/Chrome) o instrucciones (iPhone), y `navigator.storage.persist()` para reducir el riesgo de que el sistema borre los datos.
- Publicación automática con GitHub Actions → GitHub Pages (requiere HTTPS, que Pages entrega).
- Riesgo pendiente: los datos siguen en un solo dispositivo; lo resuelve la Fase 4 (sincronización, ver ADR-002).
