// lib/ai-service.ts
import { GoogleGenerativeAI, type FunctionDeclaration, type Tool } from "@google/generative-ai";
import type { AddressEntry } from "@/hooks/useMapStore";
import {
  AVAILABLE_TOOLS,
  executeTool,
  type ChatActionsContext,
  type ToolResult,
} from "./chat-tools";

/**
 * Servicio para interactuar con Google AI (Gemini)
 */

// Configuración del modelo
export const MODEL_NAME = process.env.NEXT_PUBLIC_MODEL_NAME || "gemini-3.1-flash-lite";

/**
 * Monitor para rastrear el uso de la API y el límite de 15 RPM
 */
class RequestMonitor {
  private requests: number[] = [];
  private readonly WINDOW_MS = 60000; // 1 minuto

  /**
   * Registra una nueva petición
   */
  recordRequest() {
    const now = Date.now();
    this.requests.push(now);
    this.cleanOldRequests();
    
    const currentRPM = this.requests.length;
    console.log(`\x1b[36m[API Monitor]\x1b[0m Petición registrada. Uso actual: \x1b[33m${currentRPM}/15 RPM\x1b[0m (último minuto)`);
    
    if (currentRPM >= 13) {
      console.warn("\x1b[31m[API Monitor] ADVERTENCIA: Te estás acercando al límite de 15 RPM.\x1b[0m");
    }
  }

  /**
   * Elimina las peticiones que tienen más de 1 minuto
   */
  private cleanOldRequests() {
    const now = Date.now();
    this.requests = this.requests.filter(time => now - time < this.WINDOW_MS);
  }

  /**
   * Obtiene el número de peticiones en el último minuto
   */
  getCurrentRPM(): number {
    this.cleanOldRequests();
    return this.requests.length;
  }
}

// Instancia única del monitor
export const apiMonitor = new RequestMonitor();

/**
 * Utilidad para esperar un tiempo determinado
 */
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Ejecuta una función con reintentos y backoff exponencial si hay errores de Rate Limit (429)
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 2000
): Promise<T> {
  let lastError: any;
  
  for (let i = 0; i <= maxRetries; i++) {
    try {
      // Registrar la petición en el monitor
      apiMonitor.recordRequest();
      
      return await fn();
    } catch (error: any) {
      lastError = error;
      const errorMessage = error.message || "";
      
      // Verificar si es un error de Rate Limit (429)
      const isRateLimit = 
        errorMessage.includes("429") || 
        error.status === 429 || 
        errorMessage.toLowerCase().includes("too many requests") ||
        errorMessage.toLowerCase().includes("quota exceeded");

      if (isRateLimit && i < maxRetries) {
        let delay = initialDelay * Math.pow(2, i);
        
        // Intentar extraer el tiempo de espera recomendado por la API (ej: "Please retry in 24s")
        const retryMatch = errorMessage.match(/retry in ([\d.]+s)/);
        if (retryMatch && retryMatch[1]) {
          const seconds = parseFloat(retryMatch[1]);
          delay = (seconds + 1) * 1000; // Agregar 1s de margen
          console.warn(`\x1b[35m[API Monitor]\x1b[0m La API solicita esperar ${retryMatch[1]}. Esperando ${delay}ms...`);
        } else {
          console.warn(`\x1b[35m[API Monitor]\x1b[0m Rate limit alcanzado. Reintentando en ${delay}ms... (Intento ${i + 1}/${maxRetries})`);
        }
        
        await sleep(delay);
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * Obtiene la instancia de Google AI
 */
function getGoogleAI() {
  const apiKey = process.env.GOOGLE_AI_API_KEY;

  if (!apiKey) {
    throw new Error(
      "API Key de Google AI no configurada. Por favor, agrega GOOGLE_AI_API_KEY en tu archivo .env.local",
    );
  }

  return new GoogleGenerativeAI(apiKey);
}

/**
 * Construye el contexto del mapa para incluir en los prompts
 */
export function buildMapContext(
  markers: AddressEntry[],
  center?: { lat: number; lng: number } | null,
): string {
  let context = "Contexto del mapa:\n";

  if (center) {
    context += `- Ubicación actual del mapa: ${center.lat.toFixed(4)}, ${center.lng.toFixed(4)}\n`;
  }

  if (markers.length === 0) {
    context += "- No hay marcadores guardados actualmente.\n";
  } else {
    context += `- Marcadores guardados (${markers.length}):\n`;
    markers.forEach((marker, index) => {
      context += `  ${index + 1}. "${marker.name}" en ${marker.address || marker.coordinates.lat + ", " + marker.coordinates.lng}`;
      if (marker.description) {
        context += ` - ${marker.description}`;
      }
      context += "\n";
    });
  }

  return context;
}

/**
 * Convierte las herramientas a formato de functionDeclarations de Gemini
 */
function convertToolsToFunctionDeclarations(): FunctionDeclaration[] {
  return AVAILABLE_TOOLS.map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: {
      type: "OBJECT" as any,
      properties: Object.entries(tool.parameters.properties).reduce(
        (acc, [key, value]) => {
          acc[key] = {
            type: value.type.toUpperCase() as any,
            description: value.description,
          };
          return acc;
        },
        {} as any,
      ),
      required: tool.parameters.required,
    },
  }));
}

/**
 * Resultado extendido que incluye información sobre herramientas ejecutadas
 */
export interface SendMessageResult {
  text: string;
  toolsUsed?: Array<{
    name: string;
    parameters: Record<string, any>;
    result: ToolResult;
  }>;
}

/**
 * Envía un mensaje a Google AI y obtiene la respuesta
 * Soporta Function Calling para que la IA ejecute acciones en el mapa
 */
export async function sendMessage(
  userMessage: string,
  markers: AddressEntry[],
  center?: { lat: number; lng: number } | null,
  conversationHistory?: Array<{ role: string; parts: string }>,
  actionsContext?: ChatActionsContext,
): Promise<SendMessageResult> {
  try {
    const genAI = getGoogleAI();

    // Construir contexto del mapa
    const mapContext = buildMapContext(markers, center);

    // Configurar herramientas
    const tools: Tool[] = [];
    if (actionsContext) {
      tools.push({
        functionDeclarations: convertToolsToFunctionDeclarations(),
      });
    }

    // Mensaje del sistema
    const systemInstruction = `Eres un asistente virtual especializado en ayudar con mapas interactivos y ubicaciones.

${mapContext}

Tu función es:
1. Ayudar al usuario a gestionar marcadores en el mapa usando las herramientas disponibles
2. Proporcionar información sobre ubicaciones
3. Sugerir lugares según las necesidades del usuario
4. Responder preguntas sobre los marcadores existentes

IMPORTANTE: Cuando el usuario pida agregar, buscar o gestionar marcadores, DEBES usar las herramientas disponibles (add_marker, search_location, list_markers, etc.).
No solo describas lo que harías, EJECUTA las herramientas.

INSTRUCCIONES PARA BÚSQUEDA Y CREACIÓN DE MARCADORES:
1. Cuando busques una ubicación con search_location, la respuesta incluirá un campo "parsed" con información estructurada:
   - parsed.name: Nombre del lugar o calle con número
   - parsed.address: Dirección completa de la calle
   - parsed.CP: Código postal
   - parsed.description: Información adicional (barrio, ciudad, provincia, país)

2. Cuando crees un marcador después de buscar, USA la información estructurada de "parsed":
   - name: Usa parsed.name (ejemplo: "Calle Fernando Guanarteme, 70")
   - address: Usa parsed.address (ejemplo: "Calle Fernando Guanarteme, 70")
   - description: Usa parsed.description (ejemplo: "Guanarteme, Las Palmas de Gran Canaria, Canarias, España")
   - latitude/longitude: Usa lat y lon del resultado
   - NO uses display_name directamente

3. Si el usuario pide buscar y agregar una dirección, DEBES:
   a) Primero usar search_location para buscar
   b) Luego usar add_marker con los campos parsed para crear el marcador correctamente estructurado

Responde de forma concisa, amigable y útil.`;

    // Obtener modelo
    const model = genAI.getGenerativeModel({
      model: MODEL_NAME,
      systemInstruction: systemInstruction,
      tools: tools.length > 0 ? tools : undefined,
    });

    // Construir historial del chat
    const history = conversationHistory?.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.parts }],
    })) || [];

    const chat = model.startChat({
      history: history,
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 1024,
      },
    });

    // Enviar mensaje del usuario
    let result = await withRetry(() => chat.sendMessage(userMessage));
    let response = await result.response;
    let responseText = response.text();

    const toolsUsed: Array<{
      name: string;
      parameters: Record<string, any>;
      result: ToolResult;
    }> = [];

    // Verificar si hay function calls
    const functionCalls = response.functionCalls();

    if (actionsContext && functionCalls && functionCalls.length > 0) {
      console.log("🔧 Function calls detectados:", functionCalls.length);

      for (const call of functionCalls) {
        console.log("  → Ejecutando:", call.name, call.args);

        // Ejecutar la herramienta
        const toolResult = await executeTool(
          call.name,
          call.args || {},
          actionsContext,
        );
        toolsUsed.push({
          name: call.name,
          parameters: call.args || {},
          result: toolResult,
        });

        // Enviar resultado de vuelta a la IA
        const functionResponse = [
          {
            functionResponse: {
              name: call.name,
              response: toolResult,
            },
          },
        ];

        // Continuar la conversación
        result = await withRetry(() => chat.sendMessage(functionResponse));
        response = await result.response;
      }
      responseText = response.text();
    }

    return {
      text: responseText,
      toolsUsed: toolsUsed.length > 0 ? toolsUsed : undefined,
    };
  } catch (error) {
    console.error("Error al comunicarse con Google AI:", error);

    if (error instanceof Error) {
      if (error.message.includes("API") || error.message.includes("key")) {
        throw new Error(
          "Error de configuración: API Key no válida o no configurada",
        );
      }
      throw new Error(`Error al comunicarse con la IA: ${error.message}`);
    }

    throw new Error("Error desconocido al comunicarse con la IA");
  }
}

/**
 * Envía un mensaje con respuesta streaming (para futuras mejoras)
 */
export async function* sendMessageStream(
  userMessage: string,
  markers: AddressEntry[],
  center?: { lat: number; lng: number } | null,
): AsyncGenerator<string, void, unknown> {
   // Implementación básica de streaming si se requiere
   throw new Error("Streaming not implemented");
}
