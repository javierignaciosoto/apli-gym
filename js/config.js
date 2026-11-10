/*
 * Configuración de la nube (Supabase).
 * Estos dos valores son PÚBLICOS por diseño: la seguridad la dan el inicio de sesión
 * y las reglas RLS de supabase/schema.sql. Nunca pongas aquí la clave "service_role" / "secret".
 * Si se dejan vacíos, la app pide los datos en la sección "Sincronización" (se guardan solo en ese dispositivo).
 */
window.APLI_GYM_CONFIG = {
  supabaseUrl: '',
  supabaseKey: ''
};
