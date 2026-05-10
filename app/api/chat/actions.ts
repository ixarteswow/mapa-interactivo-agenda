// app/api/chat/actions.ts
import type { AddressEntry } from "@/hooks/useMapStore";
import type { ToolResult } from "@/lib/chat-tools";

/**
 * Genera un ID único para marcadores
 */
function generateId(): string {
  return `marker_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/**
 * Interfaz para la respuesta estructurada de Nominatim
 */
interface NominatimAddress {
  house_number?: string;
  road?: string;
  suburb?: string;
  neighbourhood?: string;
  village?: string;
  town?: string;
  city?: string;
  municipality?: string;
  state?: string;
  postcode?: string;
  country?: string;
}

interface NominatimResult {
  lat: string;
  lon: string;
  display_name: string;
  address?: NominatimAddress;
  name?: string;
  type?: string;
}

/**
 * Parsea la información de Nominatim y la estructura en campos separados
 */
function parseNominatimAddress(result: NominatimResult): {
  name: string;
  address: string;
  CP: string;
  description: string;
} {
  const addr = result.address;
  
  if (!addr) {
    // Si no hay información estructurada, usar display_name
    return {
      name: result.name || result.display_name.split(',')[0] || "Ubicación",
      address: result.display_name,
      CP: "",
      description: "",
    };
  }

  // Construir el nombre (número + calle o nombre del lugar)
  let name = "";
  if (addr.house_number && addr.road) {
    name = `${addr.road}, ${addr.house_number}`;
  } else if (addr.road) {
    name = addr.road;
  } else if (result.name) {
    name = result.name;
  } else {
    // Usar el primer elemento del display_name como fallback
    name = result.display_name.split(',')[0].trim();
  }

  // Construir la dirección completa (calle completa)
  let address = "";
  if (addr.house_number && addr.road) {
    address = `${addr.road}, ${addr.house_number}`;
  } else if (addr.road) {
    address = addr.road;
  } else {
    address = name;
  }

  // Extraer código postal
  const CP = addr.postcode || "";

  // Construir descripción con información adicional (barrio, ciudad, etc.)
  const descParts: string[] = [];
  
  if (addr.suburb || addr.neighbourhood) {
    descParts.push(addr.suburb || addr.neighbourhood!);
  }
  
  const locality = addr.city || addr.town || addr.village || addr.municipality;
  if (locality) {
    descParts.push(locality);
  }
  
  if (addr.state) {
    descParts.push(addr.state);
  }
  
  if (addr.country) {
    descParts.push(addr.country);
  }

  const description = descParts.join(", ");

  return {
    name,
    address,
    CP,
    description,
  };
}

/**
 * Busca una ubicación usando Nominatim (OpenStreetMap)
 * Ahora incluye addressdetails=1 para obtener información estructurada
 */
async function searchLocation(query: string): Promise<any> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=1&addressdetails=1`,
      {
        headers: {
          "User-Agent": "RovoDevInteractiveMap/1.0 (rovo-dev-project)",
          "Referer": "https://rovo-dev-project.vercel.app"
        }
      }
    );

    if (!response.ok) {
      console.error(`Nominatim Error status: ${response.status}`);
      throw new Error("Error en la búsqueda");
    }

    const results = await response.json();
    return results;
  } catch (error) {
    console.error("Error buscando ubicación:", error);
    return [];
  }
}

/**
 * Realiza una búsqueda web usando Nominatim (sin consumir cuota de Gemini).
 * Devuelve resultados crudos que la IA principal interpretará.
 */
async function performWebSearch(query: string): Promise<string> {
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&addressdetails=1`,
      {
        headers: {
          "User-Agent": "RovoDevInteractiveMap/1.0 (rovo-dev-project)",
          "Referer": "https://rovo-dev-project.vercel.app"
        }
      }
    );

    if (!response.ok) {
      return `Error al buscar: HTTP ${response.status}`;
    }

    const results = await response.json();

    if (!results || results.length === 0) {
      return `No se encontraron resultados para "${query}". Intenta usar search_location con una dirección más específica.`;
    }

    // Formatear los resultados para que la IA los interprete
    const formatted = results.map((r: any, i: number) => {
      const parsed = parseNominatimAddress(r);
      return `${i + 1}. ${parsed.name} — ${parsed.address}${parsed.CP ? ` (CP: ${parsed.CP})` : ""} — ${parsed.description} [${r.lat}, ${r.lon}]`;
    }).join("\n");

    return `Resultados encontrados para "${query}":\n${formatted}`;
  } catch (error) {
    console.error("Error en performWebSearch:", error);
    return "Lo siento, hubo un error al realizar la búsqueda.";
  }
}

/**
 * Ejecuta una acción en el servidor y retorna el resultado
 * Las acciones NO modifican el store directamente (está en el cliente)
 * En su lugar, retornan datos para que el cliente los aplique
 */
export async function executeServerAction(
  toolName: string,
  parameters: Record<string, any>,
  currentMarkers: AddressEntry[]
): Promise<ToolResult> {
  try {
    switch (toolName) {
      case "add_marker": {
        const { name, latitude, longitude, address, description, CP } = parameters;

        // Validar coordenadas
        if (latitude < -90 || latitude > 90) {
          return {
            success: false,
            error: "Latitud inválida (debe estar entre -90 y 90)",
          };
        }
        if (longitude < -180 || longitude > 180) {
          return {
            success: false,
            error: "Longitud inválida (debe estar entre -180 y 180)",
          };
        }

        // Generar ID para el nuevo marcador
        const markerId = generateId();

        // Retornar datos del marcador para que el cliente lo agregue
        return {
          success: true,
          data: {
            id: markerId,
            name,
            coordinates: { lat: latitude, lng: longitude },
            address: address || "",
            description: description || "",
            CP: CP || "",
          },
          message: `Marcador "${name}" creado exitosamente en [${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`,
        };
      }

      case "remove_marker": {
        const { marker_id } = parameters;

        // Verificar que el marcador existe
        const markerExists = currentMarkers.some((m) => m.id === marker_id);

        if (!markerExists) {
          return {
            success: false,
            error: "No se encontró el marcador con ese ID",
          };
        }

        // Retornar ID para que el cliente lo elimine
        return {
          success: true,
          data: { id: marker_id },
          message: "Marcador eliminado exitosamente",
        };
      }

      case "list_markers": {
        // Retornar la lista actual de marcadores
        return {
          success: true,
          data: currentMarkers,
          message: `Se encontraron ${currentMarkers.length} marcadores`,
        };
      }

      case "center_map": {
        const { latitude, longitude, zoom } = parameters;

        // Retornar coordenadas para que el cliente centre el mapa
        return {
          success: true,
          data: {
            latitude,
            longitude,
            zoom: zoom || undefined,
          },
          message: `Mapa centrado en [${latitude.toFixed(4)}, ${longitude.toFixed(4)}]`,
        };
      }

      case "search_location": {
        const { query } = parameters;

        // Buscar ubicación
        const result = await searchLocation(query);

        if (!result || result.length === 0) {
          return {
            success: false,
            error: `No se encontraron resultados para "${query}"`,
          };
        }

        // Parsear la información estructurada
        const parsedAddress = parseNominatimAddress(result[0]);

        // Retornar primer resultado con información estructurada
        return {
          success: true,
          data: {
            ...result[0],
            parsed: parsedAddress,
          },
          message: `Ubicación encontrada: ${result[0].display_name}`,
        };
      }

      case "search_web": {
        const { query } = parameters;
        
        // Realizar búsqueda web con "Nested Grounding"
        const searchResult = await performWebSearch(query);

        return {
          success: true,
          data: { searchResult },
          message: searchResult, // El mensaje será el contenido encontrado
        };
      }

      case "modify_location": {
        const { targetName, newGroup, newTags, description } = parameters;
        
        // El servidor no modifica el estado (localStorage), solo valida y pasa la acción al cliente
        return {
          success: true,
          data: { targetName, newGroup, newTags, description },
          message: `Solicitud de modificación para "${targetName}" recibida`,
        };
      }

      default:
        return {
          success: false,
          error: `Herramienta desconocida: ${toolName}`,
        };
    }
  } catch (error) {
    console.error(`Error ejecutando tool ${toolName} en servidor:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  }
}
