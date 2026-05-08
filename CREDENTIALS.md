# Credenciales de Acceso - Mapa Interactivo

Este documento contiene las credenciales por defecto para acceder al sistema. **IMPORTANTE: En un entorno de producción, estas credenciales deben ser cambiadas utilizando variables de entorno (.env).**

## Roles y Permisos

El sistema cuenta con dos niveles de acceso:

1.  **Administrador (admin):** Tiene acceso completo al mapa. Puede añadir, editar, renombrar y eliminar marcadores, así como importar y exportar direcciones.
2.  **Usuario (user):** Tiene acceso de solo lectura. Puede visualizar el mapa, buscar direcciones, centrar la vista y utilizar el asistente virtual (Chat), pero no puede modificar los marcadores ni exportar la base de datos.

## Credenciales por Defecto

Si no se han configurado las variables de entorno correspondientes (`ADMIN_USER`, `ADMIN_PASSWORD`, `GUEST_USER`, `GUEST_PASSWORD`), se utilizarán las siguientes credenciales:

### Cuenta de Administrador
-   **Usuario:** `admin`
-   **Contraseña:** `admin123`

### Cuenta de Usuario (Invitado)
-   **Usuario:** `invitado`
-   **Contraseña:** `invitado123`

## Configuración en Producción

Para modificar estas credenciales, crea o edita el archivo `.env.local` en la raíz del proyecto y añade las siguientes variables:

```env
ADMIN_USER=mi_admin_personalizado
ADMIN_PASSWORD=mi_contraseña_segura
GUEST_USER=mi_usuario_personalizado
GUEST_PASSWORD=mi_contraseña_invitado
```
