"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import { loginAction } from "./actions";
import { MapPin, Lock, User, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const [state, formAction, isPending] = useActionState(loginAction, null);
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";

  return (
    <div className="min-h-screen w-full bg-gray-950 flex items-center justify-center relative overflow-hidden">
      {/* Elementos de fondo */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-blue-600/20 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-indigo-600/20 blur-[120px] pointer-events-none" />
      
      <div className="z-10 w-full max-w-md p-8 md:p-10 bg-gray-900/40 backdrop-blur-xl rounded-3xl border border-gray-800 shadow-2xl relative">
        <div className="absolute inset-0 rounded-3xl ring-1 ring-white/10 pointer-events-none" />
        
        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-indigo-500 rounded-2xl flex items-center justify-center shadow-lg mb-6 shadow-blue-500/20">
            <MapPin className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight mb-2">
            Mapa Interactivo
          </h1>
          <p className="text-gray-400 text-sm text-center">
            Inicia sesión para acceder a las ubicaciones y herramientas
          </p>
        </div>

        <form action={formAction} className="space-y-5">
          <input type="hidden" name="callbackUrl" value={callbackUrl} />
          {state?.error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <p className="text-sm text-red-400">{state.error}</p>
            </div>
          )}

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 ml-1">Usuario</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <User className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="text"
                name="username"
                required
                className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500 outline-none transition-all"
                placeholder="admin o invitado"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-300 ml-1">Contraseña</label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                <Lock className="h-5 w-5 text-gray-500" />
              </div>
              <input
                type="password"
                name="password"
                required
                className="w-full pl-11 pr-4 py-3 bg-gray-800/50 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-white placeholder-gray-500 outline-none transition-all"
                placeholder="••••••••"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full py-3.5 mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white rounded-xl font-medium shadow-lg shadow-blue-900/20 focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900 outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed flex justify-center items-center gap-2"
          >
            {isPending ? (
              <>
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                <span>Accediendo...</span>
              </>
            ) : (
              <span>Iniciar Sesión</span>
            )}
          </button>
        </form>
        
        <div className="mt-8 text-center text-xs text-gray-500">
          <p>Credenciales de prueba:</p>
          <div className="flex justify-center gap-4 mt-2">
            <code>admin / admin123</code>
            <code>invitado / invitado123</code>
          </div>
        </div>
      </div>
    </div>
  );
}
