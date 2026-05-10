// app/page.tsx
"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";

import Sidebar from "@/components/Sidebar";
import Map from "@/components/Map";
import ChatWindow from "@/components/ChatWindow";
import MenuButton from "@/components/MenuButton";
import ChatBubble from "@/components/ChatBubble"; // 1. Importar ChatBubble
import ChatDock from "@/components/ChatDock";
import { useMapStore } from "@/hooks/useMapStore";
import { useToastStore } from "@/hooks/useToastStore";
import LZString from "lz-string";

const HomePage: FC = () => {
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  // 2. Añadir estado para el chat
  const [isChatOpen, setChatOpen] = useState(false);
  const chatDockRef = useRef<HTMLButtonElement | null>(null);
  const sharedImportedRef = useRef(false);

  const addMarker = useMapStore((s) => s.addMarker);
  const toast = useToastStore((s) => s.enqueue);

  // Importar marcadores desde ?s= (comprimido) o ?shared= (legacy) en la URL
  useEffect(() => {
    if (sharedImportedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    
    // Intentar nuevo formato comprimido (?s=) o legacy (?shared=)
    const compressedData = params.get("s");
    const legacyData = params.get("shared");
    if (!compressedData && !legacyData) return;

    sharedImportedRef.current = true;
    try {
      let decoded: any;
      
      if (compressedData) {
        // Nuevo formato: lz-string + claves cortas
        const json = LZString.decompressFromEncodedURIComponent(compressedData);
        if (!json) throw new Error("No se pudo descomprimir");
        const compact = JSON.parse(json);
        decoded = {
          group: compact.g || "Compartidos",
          markers: (compact.m || []).map((m: any) => ({
            name: m.n, lat: m.a, lng: m.o,
            address: m.d || "", description: m.s || "",
          })),
        };
      } else if (legacyData) {
        // Legacy: Base64
        decoded = JSON.parse(decodeURIComponent(escape(atob(legacyData))));
      }

      const group = decoded.group || "Compartidos";
      const markers = decoded.markers;
      if (!Array.isArray(markers) || markers.length === 0) throw new Error("Sin marcadores");

      let count = 0;
      for (const m of markers) {
        if (typeof m.lat !== "number" || typeof m.lng !== "number") continue;
        addMarker({
          name: m.name || "(Sin título)",
          description: m.description || "",
          address: m.address || "",
          CP: m.CP || "",
          coordinates: { lat: m.lat, lng: m.lng },
          group,
        });
        count++;
      }

      if (count > 0) {
        toast({ type: "success", message: `Importados ${count} marcador(es) de "${group}"` });
        setSidebarOpen(true);
      }

      // Limpiar parámetro de la URL sin recargar
      window.history.replaceState({}, "", window.location.pathname);
    } catch (err) {
      console.error("Error importando marcadores compartidos:", err);
      toast({ type: "error", message: "No se pudieron importar los marcadores compartidos" });
    }
  }, [addMarker, toast]);

  return (
    <>
      {!isSidebarOpen && <MenuButton onClick={() => setSidebarOpen(true)} />}
      {/* 3. Mostrar el ChatBubble en móvil cuando el chat está cerrado */}
      {!isChatOpen && <ChatBubble onClick={() => setChatOpen(true)} />}
      {!isChatOpen && (
        <ChatDock
          onClick={() => {
            setChatOpen(true);
            // mover el foco al input del chat tras abrir
            setTimeout(() => {
              document.getElementById("chat-input")?.focus();
            }, 0);
          }}
          ref={chatDockRef}
        />
      )}

      <div
        className="flex h-screen bg-gray-900 overflow-hidden"
        role="application"
      >
        <Sidebar isOpen={isSidebarOpen} onClose={() => setSidebarOpen(false)} />
        <Map sidebarOpen={isSidebarOpen} />
      </div>

      {/* 4. Pasar el estado y el controlador de cierre al ChatWindow */}
      <AnimatePresence initial={false} mode="wait">
        {isChatOpen && (
          <ChatWindow
            isOpen={true}
            onClose={() => {
              setChatOpen(false);
              setTimeout(() => {
                chatDockRef.current?.focus?.();
              }, 200);
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
};

export default HomePage;
