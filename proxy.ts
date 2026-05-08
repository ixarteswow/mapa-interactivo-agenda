import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { decrypt } from "@/lib/auth";

export async function proxy(request: NextRequest) {
  // Ignorar rutas estáticas y de la API de Next.js
  if (
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/api") ||
    request.nextUrl.pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const sessionCookie = request.cookies.get("session")?.value;
  
  // Si no hay sesión y no estamos en la página de login, redirigir a login
  if (!sessionCookie && request.nextUrl.pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  // Si hay sesión
  if (sessionCookie) {
    const payload = await decrypt(sessionCookie);
    
    // Si la sesión es inválida, borrar la cookie y redirigir
    if (!payload) {
      const response = NextResponse.redirect(new URL("/login", request.url));
      response.cookies.delete("session");
      return response;
    }
    
    // Si el usuario ya está logueado e intenta acceder a /login, redirigir a /
    if (request.nextUrl.pathname === "/login") {
      return NextResponse.redirect(new URL("/", request.url));
    }
    
    // Podemos pasar información del rol en los headers para usarlo en el cliente (opcional)
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set("x-user-role", payload.role as string);
    requestHeaders.set("x-user-name", payload.username as string);
    
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
