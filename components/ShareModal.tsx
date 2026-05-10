"use client";

import { type FC, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import QRCode from "qrcode";
import LZString from "lz-string";
import type { Location } from "@/types";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  groupName: string;
  markers: Location[];
}

/**
 * Modal para compartir una carpeta de marcadores por QR Code o URL.
 * Codifica los marcadores en Base64 dentro de la URL.
 */
const ShareModal: FC<ShareModalProps> = ({ isOpen, onClose, groupName, markers }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);
  const [shareUrl, setShareUrl] = useState("");

  // Generar URL con datos codificados
  useEffect(() => {
    if (!isOpen || markers.length === 0) return;

    // Datos mínimos: claves cortas para reducir tamaño de URL
    const compact = {
      g: groupName,
      m: markers.map((m) => ({
        n: m.name,
        a: +m.coordinates.lat.toFixed(5),
        o: +m.coordinates.lng.toFixed(5),
        ...(m.address ? { d: m.address } : {}),
        ...(m.description ? { s: m.description } : {}),
      })),
    };

    const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(compact));
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const url = `${origin}/?s=${compressed}`;
    setShareUrl(url);

    // Generar QR Code en canvas
    if (canvasRef.current) {
      QRCode.toCanvas(canvasRef.current, url, {
        width: 280,
        margin: 3,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
      }).catch(console.error);
    }
  }, [isOpen, groupName, markers]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback para navegadores que no soportan clipboard API
      const input = document.createElement("input");
      input.value = shareUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      document.body.removeChild(input);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Carpeta "${groupName}" — Mapa Interactivo`,
          text: `Te comparto ${markers.length} ubicación(es) de la carpeta "${groupName}"`,
          url: shareUrl,
        });
      } catch (err) {
        // Usuario canceló el diálogo de compartir
        if ((err as Error).name !== "AbortError") console.error(err);
      }
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            className="bg-gray-800 rounded-xl border border-gray-600 shadow-2xl p-6 max-w-sm w-full"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">
                📤 Compartir &quot;{groupName}&quot;
              </h3>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white text-2xl leading-none"
                aria-label="Cerrar"
              >
                &times;
              </button>
            </div>

            <p className="text-sm text-gray-400 mb-4">
              {markers.length} ubicación(es). Quien abra este enlace verá estos marcadores en su mapa.
            </p>

            {/* QR Code */}
            <div className="flex justify-center mb-4 bg-white rounded-lg p-3">
              <canvas ref={canvasRef} />
            </div>

            {/* Botones */}
            <div className="space-y-2">
              {/* Copiar enlace */}
              <button
                onClick={handleCopy}
                className={`w-full py-2.5 px-4 rounded-lg font-medium text-sm transition-all flex items-center justify-center gap-2 ${
                  copied
                    ? "bg-green-600 text-white"
                    : "bg-gray-700 hover:bg-gray-600 text-gray-200"
                }`}
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                    ¡Enlace copiado!
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
                    Copiar enlace
                  </>
                )}
              </button>

              {/* Compartir (Web Share API) */}
              {typeof navigator !== "undefined" && "share" in navigator && (
                <button
                  onClick={handleShare}
                  className="w-full py-2.5 px-4 rounded-lg font-medium text-sm bg-blue-600 hover:bg-blue-700 text-white transition-all flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                  Compartir por WhatsApp, Telegram...
                </button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ShareModal;
