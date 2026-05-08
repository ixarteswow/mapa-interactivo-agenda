# Registro de Sesión - Mapa Interactivo Agenda
**Fecha de última actualización:** 9 de Mayo de 2026

Este archivo sirve como registro (checkpoint) del estado actual del proyecto, las decisiones tomadas y las configuraciones críticas para facilitar la reanudación del trabajo en futuras sesiones.

## 🎯 Hitos Conseguidos

### 1. Control de Acceso Basado en Roles (RBAC)
- **Autenticación Segura:** Se implementó JWT mediante la librería `jose` utilizando cookies `HttpOnly` para máxima seguridad contra ataques XSS.
- **Roles:**
  - `admin`: Acceso total (lectura, escritura, borrado).
  - `user` (invitado): Solo lectura.
- **UI Reactiva:** La interfaz (Sidebar y mapa) utiliza el store global `useAuthStore` sincronizado desde el servidor a través de `AuthProvider` para ocultar o deshabilitar herramientas de escritura si el usuario no tiene permisos de administrador.
- **Credenciales:** Las credenciales por defecto se han registrado en el archivo `CREDENTIALS.md`.

### 2. Configuración y Despliegue en Netlify
- **Warning de Next.js Resuelto:** El archivo de middleware clásico (`middleware.ts`) ha sido renombrado a `proxy.ts` resolviendo la advertencia de deprecación de Next.js 16.2.6.
- **Fix de la API para Producción:** Se añadió explícitamente `export const dynamic = "force-dynamic"` y `export const maxDuration = 60` en `app/api/chat/route.ts`. Esto evita que la ruta se cachee como una página estática y soluciona el clásico problema de *timeouts* o errores 500 silenciosos que ocurren al desplegar Next.js App Router en plataformas *serverless* como Netlify.
- El proyecto se ha enlazado y subido correctamente al repositorio: `https://github.com/ixarteswow/mapa-interactivo-agenda.git`

### 3. Mejoras de Interfaz (Mobile First)
- En el componente `ChatWindow.tsx`, se trasladó el "Indicador de uso de API y Prompts" de la parte inferior a la parte superior (justo debajo del header del chat). Esto garantiza que el contador nunca sea tapado por el teclado nativo de iOS/Android durante su uso.

## 🚧 Siguientes Pasos (Roadmap sugerido)

1. **Gestión de Sesiones Remotas:** Considerar la integración con una base de datos real (Supabase, Firebase, o MongoDB) si se desea guardar los marcadores para todos los usuarios centralizadamente en la nube en lugar de la persistencia local.
2. **Ampliación de Herramientas IA:** Extender las `tools` de la IA para que permita modificar o borrar direcciones existentes, no solo agregar y buscar.
3. **PWA:** Transformar la aplicación en una PWA instalable para un acceso aún más directo desde el teléfono.

---
*Nota: Este archivo ha sido creado para mantener el contexto técnico de la IA y el usuario para la siguiente interacción.*
