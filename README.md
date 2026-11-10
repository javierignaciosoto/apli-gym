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
- **Sincronización en la nube** (opcional, Supabase): los mismos datos en todos tus dispositivos, funcionando también sin internet.

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

> Sin sincronización, los datos se guardan en el navegador de cada dispositivo. Para compartirlos entre el celular y el PC, activa la [sincronización en la nube](#sincronización-en-la-nube-️) o usa **Exportar / Importar JSON**.

## Sincronización en la nube ☁️

Opcional. Con ella tienes **los mismos datos en el celular y en el computador**, y no los pierdes si cambias de teléfono.
Usa [Supabase](https://supabase.com) (plan gratuito). La app sigue funcionando sin internet: guarda en el dispositivo y sube los cambios cuando vuelve la conexión.

### Configuración (una sola vez, ~10 minutos)

1. **Crea el proyecto:** entra a supabase.com → *New project* (elige la región más cercana, por ejemplo São Paulo).
2. **Crea las tablas:** en el proyecto → **SQL Editor** → *New query* → pega todo el archivo [`supabase/schema.sql`](supabase/schema.sql) → **Run**.
3. **Activa el inicio de sesión con código:** **Authentication → Emails → Templates → Magic Link** y reemplaza el contenido por algo como:

   ```html
   <h2>Tu código para Apli-Gym</h2>
   <p>Escribe este código en la app: <strong>{{ .Token }}</strong></p>
   ```

   (Por defecto Supabase envía un enlace; la app necesita el **código**, porque en iPhone el enlace se abriría en Safari y no en la app instalada.)
4. **Permite tu dirección:** **Authentication → URL Configuration → Site URL** = `https://javierignaciosoto.github.io/apli-gym/`.
5. **Copia los datos de conexión:** **Project Settings → API** (o el botón *Connect*): la **Project URL** y la clave **anon / publishable**.
6. **Ponlos en la app**, de una de estas dos formas:
   - **Recomendado:** escríbelos en [`js/config.js`](js/config.js) y súbelo a `main`. Así todos tus dispositivos quedan configurados solos.
   - O pégalos en la sección **☁️ Sincronización** de la app (se guardan solo en ese dispositivo).

> La URL y la clave *anon/publishable* son **públicas por diseño**: la seguridad la dan el inicio de sesión y las reglas RLS de `schema.sql` (cada cuenta solo ve sus propios datos).
> **Nunca** uses la clave `service_role` / *secret* en la app.

### Uso

1. En **☁️ Sincronización** escribe tu correo → **Enviarme un código** → escribe el código que llega.
2. Lo que ya tenías en ese dispositivo se sube a tu cuenta, y se baja lo que haya en la nube.
3. Repite en cada dispositivo con **el mismo correo**.

Se sincroniza sola: al abrir la app, al guardar o borrar algo, al recuperar internet y cada 5 minutos. El indicador del encabezado muestra el estado (☁️ Sincronizado · ⏳ pendientes · 📴 sin conexión).
Si el mismo registro cambia en dos dispositivos, **gana el cambio más reciente**.

**Cerrar sesión** sube lo pendiente y borra los datos *de ese dispositivo* (siguen en la nube); si hay cambios que no se pudieron subir, la app avisa antes.

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
│   ├── pwa.js            # Instalación, service worker y almacenamiento persistente
│   ├── config.js         # URL y clave pública de Supabase (opcional)
│   ├── cloud.js          # Sincronización con Supabase (REST, sin librerías)
│   └── cloud-ui.js       # Pantalla de sincronización e indicador de estado
├── supabase/
│   └── schema.sql        # Tablas, seguridad RLS y triggers para Supabase
└── docs/adr/
    ├── ADR-001-arquitectura-apli-gym.md
    └── ADR-002-sincronizacion-nube.md
```

## Próximos pasos

Ver la decisión de arquitectura y el roadmap en [`docs/adr/ADR-001-arquitectura-apli-gym.md`](docs/adr/ADR-001-arquitectura-apli-gym.md):

1. ~~Objetivos por ejercicio~~ ✅
2. ~~App instalable en el celular (PWA)~~ ✅
3. ~~Sincronización en la nube~~ ✅ (ver [`ADR-002`](docs/adr/ADR-002-sincronizacion-nube.md))
4. Ideas: rutinas/plantillas, volumen semanal por grupo muscular, alertas de récord.
