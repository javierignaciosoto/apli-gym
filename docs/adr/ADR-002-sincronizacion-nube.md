# ADR-002: Sincronización en la nube

**Status:** Accepted
**Date:** 2026-11-10
**Deciders:** Javier

## Context

Apli-Gym guarda los datos en el `localStorage` de cada dispositivo (ADR-001). Esto genera dos problemas:

- El celular y el computador tienen datos distintos.
- Si se pierde o se cambia el teléfono, se pierde el historial, salvo que exista un respaldo JSON manual.

Restricciones:

- Debe seguir **funcionando sin internet** en el gimnasio (PWA, ADR-001 Fase 3).
- Sin costo y sin servidor propio que mantener.
- Mantener la app **sin dependencias ni paso de build**.
- Es un solo usuario con pocos datos (miles de filas en años), así que no se necesita colaboración en tiempo real.

## Decision

Se usa **Supabase**, con un modelo **offline-first**:

1. **Fuente de verdad local.** La interfaz solo lee y escribe en `localStorage` mediante `storage.js`, igual que antes. La nube es una réplica.
2. **Esquema v2 local.** Cada registro y objetivo tiene:
   - `updatedAt`: fecha del último cambio;
   - `deleted`: borrado suave, para que el borrado llegue a los otros dispositivos;
   - `_dirty`: indica que el cambio todavía no se subió.

   Los datos v1 se migran solos y quedan pendientes de subir.
3. **Sincronización** (`js/cloud.js`), en cada pasada:
   - **Bajar:** pide las filas con `synced_at > último synced_at visto`. El servidor fija `synced_at` con un trigger, así no se depende del reloj del celular.
   - **Mezclar:** por registro gana el `updatedAt` más reciente (*last-write-wins*).
   - **Subir:** envía los registros pendientes con `upsert` (`on_conflict=id`).
   - **Disparadores:** se sincroniza al abrir la app, al guardar o borrar algo, al recuperar internet, al volver a la app y cada 5 minutos.
4. **Acceso por REST** (`fetch` a PostgREST y GoTrue), sin `supabase-js`. Así no se cargan librerías desde un CDN y la app funciona sin conexión.
5. **Autenticación con código de un solo uso enviado por correo (OTP).** No se usa enlace mágico porque en iOS el enlace se abre en Safari, que no comparte almacenamiento con la PWA instalada.
6. **Seguridad con RLS.** Cada tabla tiene `user_id default auth.uid()` y políticas de select, insert y update solo sobre las filas propias. No hay política de DELETE: los borrados son suaves. La URL y la clave *anon/publishable* son públicas.
7. **Cerrar sesión:**
   - primero sube lo pendiente;
   - luego borra los datos locales, que quedan en la nube, para que no se mezclen con otra cuenta en el mismo dispositivo;
   - si quedan cambios sin subir, avisa antes de borrar.

## Options Considered

### Option A: Supabase vía REST + offline-first (elegida)
| Dimension | Assessment |
|-----------|------------|
| Complexity | Media (≈300 líneas propias de sincronización) |
| Cost | $0 (plan gratuito: 500 MB de base de datos, 50.000 usuarios activos al mes) |
| Scalability | Sobra para el caso; Postgres permite consultas y análisis futuros |
| Team familiarity | SQL estándar y JSON |

**Pros:** datos en Postgres con RLS, consultables con SQL; sin dependencias; funciona sin internet.
**Cons:** hay que configurar el proyecto, la plantilla del correo y las claves (una sola vez). Un proyecto inactivo por más de 7 días en el plan gratuito se pausa y se reactiva desde el panel.

### Option B: Firebase (Firestore) con su SDK
| Dimension | Assessment |
|-----------|------------|
| Complexity | Baja–media; la sincronización offline viene incluida |
| Cost | $0 en el plan Spark |
| Scalability | Alta |
| Team familiarity | Media; las reglas de seguridad son propias de Firebase |

**Pros:** la persistencia offline y la sincronización vienen hechas.
**Cons:** el SDK pesa ~100 KB+, rompe el principio de "sin dependencias", los datos son NoSQL y se depende más de Google.

### Option C: Archivo JSON en Google Drive o GitHub Gist
| Dimension | Assessment |
|-----------|------------|
| Complexity | Media (OAuth de Google/GitHub en una app estática) |
| Cost | $0 |
| Scalability | Baja: se reescribe el archivo completo en cada cambio |
| Team familiarity | Alta |

**Pros:** sin base de datos.
**Cons:** conflictos a nivel de archivo completo y un OAuth más complejo. En Gist habría que manejar un token personal en el navegador.

## Trade-off Analysis

Firebase ahorraría escribir la lógica de sincronización, pero obliga a cargar su SDK y a usar un modelo NoSQL. Supabase por REST mantiene la app liviana y sin dependencias, y deja los datos en SQL estándar, útil para futuras estadísticas o para exportar a una planilla. La lógica propia es acotada porque es un solo usuario: *last-write-wins* por registro es suficiente, porque rara vez se edita el mismo registro en dos dispositivos al mismo tiempo.

## Consequences

- **Más fácil:** usar varios dispositivos, no perder datos y hacer análisis con SQL en el futuro.
- **Más difícil:** la configuración inicial (proyecto, plantilla de correo, claves) y probar contra un servidor real. La lógica se probó con un Supabase simulado en las pruebas automáticas.
- **A revisar:**
  - Si se agrega **edición** de registros (hoy solo se crean y borran), *last-write-wins* sigue funcionando porque se actualiza `updatedAt`.
  - Si un día hay varios usuarios compartiendo datos (por ejemplo, un entrenador), habría que revisar las políticas RLS.
  - Las filas con `deleted = true` se pueden purgar periódicamente (por ejemplo, las de más de 90 días).

## Action Items

1. [x] Esquema v2 local con migración automática desde v1.
2. [x] `supabase/schema.sql` con tablas, triggers y RLS.
3. [x] `js/cloud.js` (auth OTP, pull/push incremental, reintentos, renovación de sesión).
4. [x] Interfaz: sección "Sincronización" e indicador de estado en el encabezado.
5. [ ] Javier: crear el proyecto de Supabase y completar `js/config.js` (pasos en el README).
6. [ ] Probar con el proyecto real en el celular y en el computador.
