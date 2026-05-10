"use client";

import { type FC, type FormEvent, useState, useRef, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { useChatStore } from "@/hooks/useChatStore";
import { useMapStore } from "@/hooks/useMapStore";
import { useToastStore } from "@/hooks/useToastStore";
import { useServerActions } from "@/hooks/useServerActions";
import ChatMessage from "./ChatMessage";
import ChatActionMessage from "./ChatActionMessage";


/**
 * Clases de estilo reutilizables para el componente ChatWindow.
 */
const STYLES = {
  header:
    "bg-gray-700 p-3 rounded-t-lg cursor-pointer hover:bg-gray-600 transition-colors",
  headerTitle: "font-bold text-lg",
  messagesArea: "flex-grow p-4 overflow-y-auto",
  placeholder: "text-center text-gray-400 text-sm",
  exampleText: "text-xs mt-2 italic",
  form: "p-3 border-t border-gray-700 flex items-center gap-1.5 bg-gray-800 rounded-b-lg",
  input:
    "flex-grow p-2 rounded-md bg-gray-600 border border-gray-500 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all",
  submitButton:
    "bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors",
  icon: "w-6 h-6",
} as const;

/**
 * Props para el componente ChatWindow, necesarias para el control responsive.
 */
interface ChatWindowProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Componente ChatWindow - Ventana de chat adaptable para móvil y escritorio.
 * En móvil se comporta como un modal de pantalla completa, en escritorio como una ventana flotante.
 */
const ChatWindow: FC<ChatWindowProps> = ({ onClose }) => {
  const [inputValue, setInputValue] = useState("");
  const [isListening, setIsListening] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const recognitionRef = useRef<any>(null);
  
  // Stores
  const messages = useChatStore((s) => s.messages);
  const isLoading = useChatStore((s) => s.isLoading);
  const addMessage = useChatStore((s) => s.addMessage);
  const setLoading = useChatStore((s) => s.setLoading);
  const setError = useChatStore((s) => s.setError);
  const getHistory = useChatStore((s) => s.getHistory);
  const clearChat = useChatStore((s) => s.clearChat);
  
  const markers = useMapStore((s) => s.markers);
  const center = useMapStore((s) => s.center);
  
  const toast = useToastStore((s) => s.enqueue);
  const { processServerActions } = useServerActions();

  // Web Speech API - Reconocimiento de voz
  const toggleVoice = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      toast({ type: "error", message: "Tu navegador no soporta reconocimiento de voz", timeout: 3000 });
      return;
    }

    if (isListening && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsListening(false);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInputValue((prev) => prev ? `${prev} ${transcript}` : transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech error:", event.error);
      if (event.error !== "aborted") {
        toast({ type: "error", message: "Error de micrófono: " + event.error, timeout: 3000 });
      }
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
      recognitionRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [isListening, toast]);

  // Cleanup al desmontar
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  // Auto-scroll al último mensaje
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /**
   * Maneja el envío del formulario de chat.
   */
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    const userMessage = inputValue.trim();
    if (!userMessage || isLoading) return;

    // Limpiar input
    setInputValue("");
    
    // Agregar mensaje del usuario
    addMessage("user", userMessage);
    setLoading(true);

    try {
      // Obtener historial de conversación
      const history = getHistory();
      
      // Enviar mensaje al API Route del servidor
      const apiResponse = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userMessage,
          markers,
          center,
          conversationHistory: history,
        }),
      });

      if (!apiResponse.ok) {
        const errorData = await apiResponse.json();
        throw new Error(errorData.error || "Error al comunicarse con el servidor");
      }

      const response = await apiResponse.json();
      
      // Si la IA usó herramientas, procesarlas y agregar mensajes de acción
      if (response.toolsUsed && response.toolsUsed.length > 0) {
        // Procesar acciones en el cliente
        processServerActions(response.toolsUsed);

        // Agregar mensajes de acción al chat
        response.toolsUsed.forEach((toolUse: any) => {
          addMessage(
            "action",
            `Acción ejecutada: ${toolUse.name}`,
            {
              toolName: toolUse.name,
              parameters: toolUse.parameters,
              result: toolUse.result,
            }
          );
        });
      }
      
      // Agregar respuesta del asistente
      addMessage("assistant", response.text);
      

      
      setError(null);
    } catch (error) {
      console.error("Error al enviar mensaje:", error);
      
      const errorMessage = error instanceof Error 
        ? error.message 
        : "Error al comunicarse con la IA";
      
      setError(errorMessage);
      
      // Mostrar toast de error
      toast({
        type: "error",
        message: errorMessage,
        timeout: 5000,
      });
      
      // Agregar mensaje de error al chat
      addMessage(
        "assistant",
        "Lo siento, ocurrió un error al procesar tu mensaje. Por favor, verifica tu conexión y la configuración de la API key."
      );
    } finally {
      setLoading(false);
    }
  };

  /**
   * Maneja el botón de limpiar chat
   */
  const handleClearChat = () => {
    clearChat();
    toast({
      type: "info",
      message: "Chat limpiado",
    });
  };

  return (
    <motion.aside
      className={`
        fixed
        bg-gray-800 text-white shadow-xl flex flex-col
        rounded-t-2xl md:rounded-lg
        border-t border-gray-700
        z-50
        bottom-0 left-0 right-0
        h-[60vh]
        md:inset-auto md:bottom-5 md:right-5 md:w-96 md:h-[500px]
      `}
      role="dialog"
      aria-modal={true}
      aria-labelledby="chat-title"
      initial={{ opacity: 0, y: 40, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 40, scale: 0.98 }}
      transition={{ type: "spring", stiffness: 220, damping: 22, mass: 0.9 }}
    >
      {/* Cabecera del Chat con botón de cierre para móvil y minimizar en desktop */}
      <header className={`${STYLES.header} flex justify-between items-center`}>
        <h2 className={STYLES.headerTitle} id="chat-title">
          Chat con el Mapa 🤖
        </h2>
        <div className="flex items-center gap-2">
          {/* Limpiar chat */}
          {messages.length > 0 && (
            <button
              onClick={handleClearChat}
              className="text-gray-400 hover:text-white text-sm px-2 py-1 rounded border border-gray-600 hover:border-gray-500"
              aria-label="Limpiar chat"
              title="Limpiar chat"
            >
              Limpiar
            </button>
          )}
          {/* Minimizar (desktop) */}
          <button
            onClick={onClose}
            className="hidden md:inline-flex text-gray-300 hover:text-white text-sm px-2 py-1 rounded border border-gray-600 hover:border-gray-500"
            aria-label="Minimizar chat"
            title="Minimizar"
          >
            Minimizar
          </button>
          {/* Cerrar (móvil) */}
          <button
            onClick={onClose}
            className="md:hidden text-gray-400 hover:text-white text-2xl leading-none"
            aria-label="Cerrar chat"
            title="Cerrar"
          >
            &times;
          </button>
        </div>
      </header>


      {/* Área de Mensajes */}
      <div className={STYLES.messagesArea} role="log">
        {messages.length === 0 ? (
          <div className={STYLES.placeholder}>
            <p>👋 ¡Hola! Soy tu asistente de mapas.</p>
            <p className={STYLES.exampleText}>
              Pregúntame sobre ubicaciones o pídeme que te ayude con el mapa.
            </p>
            <p className={STYLES.exampleText}>
              Ejemplo: &quot;¿Qué marcadores tengo guardados?&quot;
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg) => {
              // Renderizar mensajes de acción con componente especial
              if (msg.role === "action" && msg.metadata) {
                return (
                  <ChatActionMessage
                    key={msg.id}
                    metadata={msg.metadata}
                    timestamp={msg.timestamp}
                  />
                );
              }
              
              // Renderizar mensajes normales
              return (
                <ChatMessage
                  key={msg.id}
                  message={msg.content}
                  sender={msg.role as "user" | "assistant"}
                  timestamp={msg.timestamp}
                />
              );
            })}
            {isLoading && (
              <div className="flex justify-start mb-4">
                <div className="bg-gray-700 px-4 py-3 rounded-lg">
                  <div className="flex gap-1">
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }}></span>
                    <span className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }}></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Formulario de Entrada */}
      <form
        className={STYLES.form}
        onSubmit={handleSubmit}
        aria-labelledby="chat-title"
      >
        <label htmlFor="chat-input" className="sr-only">
          Escribe tu mensaje
        </label>
        <input
          id="chat-input"
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Escribe tu mensaje..."
          className={STYLES.input}
          autoComplete="off"
          aria-required="true"
          disabled={isLoading}
        />
        <button
          type="button"
          onClick={toggleVoice}
          className={`p-2 rounded-md transition-all ${
            isListening
              ? "bg-red-500 hover:bg-red-600 text-white animate-pulse shadow-[0_0_12px_rgba(239,68,68,0.5)]"
              : "bg-gray-600 hover:bg-gray-500 text-gray-300"
          }`}
          aria-label={isListening ? "Detener micrófono" : "Activar micrófono"}
          disabled={isLoading}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className="w-5 h-5"
            aria-hidden="true"
          >
            {isListening ? (
              <path fillRule="evenodd" d="M5.25 5.25a.75.75 0 0 1 .75-.75h12a.75.75 0 0 1 .75.75v13.5a.75.75 0 0 1-.75.75H6a.75.75 0 0 1-.75-.75V5.25Z" clipRule="evenodd" />
            ) : (
              <>
                <path d="M8.25 4.5a3.75 3.75 0 1 1 7.5 0v8.25a3.75 3.75 0 1 1-7.5 0V4.5Z" />
                <path d="M6 10.5a.75.75 0 0 1 .75.75v1.5a5.25 5.25 0 1 0 10.5 0v-1.5a.75.75 0 0 1 1.5 0v1.5a6.751 6.751 0 0 1-6 6.709v2.291h3a.75.75 0 0 1 0 1.5h-7.5a.75.75 0 0 1 0-1.5h3v-2.291a6.751 6.751 0 0 1-6-6.709v-1.5A.75.75 0 0 1 6 10.5Z" />
              </>
            )}
          </svg>
        </button>
        <button
          type="submit"
          className={STYLES.submitButton}
          aria-label="Enviar mensaje"
          disabled={isLoading || !inputValue.trim()}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="currentColor"
            className={STYLES.icon}
            aria-hidden="true"
          >
            <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
          </svg>
        </button>
      </form>
    </motion.aside>
  );
};

export default ChatWindow;
