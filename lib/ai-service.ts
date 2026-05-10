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
    let result = await chat.sendMessage(userMessage);
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
        result = await chat.sendMessage(functionResponse);
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
