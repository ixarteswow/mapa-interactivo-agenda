// components/Sidebar.tsx

"use client";

import { type FC, useCallback, useEffect, useMemo, useState } from "react";
import { useMapStore } from "@/hooks/useMapStore";
import { useToastStore } from "@/hooks/useToastStore";
import { useModal } from "@/hooks/useModal";
import FocusTrap from "focus-trap-react";
import { groupLocations, getGroupStats, getUniqueGroups, DEFAULT_GROUP } from "@/types";
import { getGroupColor } from "@/lib/colors";
import LocationModal from "./LocationModal";
import { useAuthStore } from "@/hooks/useAuthStore";
import { logoutAction } from "@/app/login/actions";

// Nuevas props para controlar la visibilidad en dispositivos móviles
interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Sidebar: FC<SidebarProps> = ({ isOpen, onClose }) => {
  // Detectar móvil en cliente (no usado actualmente pero puede ser útil)
  // const [isMobile, setIsMobile] = useState(false);
  // useEffect(() => {
  //   const check = () => setIsMobile(window.innerWidth < 768);
  //   check();
  //   window.addEventListener("resize", check);
  //   return () => window.removeEventListener("resize", check);
  // }, []);

  // Estado local para búsqueda en lista + autosuggest (Nominatim)
  const [query, setQuery] = useState("");
  type Suggestion = {
    id: string;
    name: string;
    address: string;
    CP: string;
    lat: number;
    lng: number;
  };
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [showSuggest, setShowSuggest] = useState(false);
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const [onlyCenter, setOnlyCenter] = useState(false); // preferencia: solo centrar
  const [openGroup, setOpenGroup] = useState<string | null>(null); // Estado para acordeón

  // Store global (Zustand)
  const markers = useMapStore((s) => s.markers);
  const selectedId = useMapStore((s) => s.selectedId);
  const selectMarker = useMapStore((s) => s.selectMarker);
  const removeMarker = useMapStore((s) => s.removeMarker);
  const renameMarker = useMapStore((s) => s.renameMarker);
  const setCenter = useMapStore((s) => s.setCenter);
  const setZoom = useMapStore((s) => s.setZoom);
  const updateMarker = useMapStore((s) => s.updateMarker);

  const role = useAuthStore((s) => s.role);
  const isAdmin = role === "admin";

  const toast = useToastStore((s) => s.enqueue);
  const { showConfirm, showPrompt } = useModal();

  // Filtrado por título o coordenadas
  // Debounced fetch a Nominatim
  const fetchSuggestions = useMemo(() => {
    let timer: NodeJS.Timeout;
    return (q: string) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try {
          const params = new URLSearchParams({
            q,
            format: "json",
            addressdetails: "1",
            limit: "5",
          });
          const res = await fetch(`https://nominatim.openstreetmap.org/search?${params.toString()}`, {
            headers: {
              "Accept": "application/json",
              // Respeto de politicas Nominatim
              "User-Agent": "hito2-mapa-app/1.0 (contact@example.com)",
              "Referer": typeof window !== "undefined" ? window.location.origin : "",
            },
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const data = await res.json();
          const mapped: Suggestion[] = (data as Array<Record<string, unknown>>).map((d) => {
            const displayName = typeof d.display_name === 'string' ? d.display_name : '';
            const address = typeof d.address === 'object' && d.address !== null ? d.address as Record<string, unknown> : {};
            const lat = typeof d.lat === 'string' ? d.lat : String(d.lat ?? '0');
            const lon = typeof d.lon === 'string' ? d.lon : String(d.lon ?? '0');
            
            return {
              id: String(d.place_id ?? ''),
              name: displayName.split(",")[0] ?? displayName ?? "(Sin nombre)",
              address: displayName,
              CP: typeof address.postcode === 'string' ? address.postcode : "",
              lat: parseFloat(lat),
              lng: parseFloat(lon),
            };
          });
          setSuggestions(mapped);
          setShowSuggest(true);
          setActiveIndex(mapped.length ? 0 : -1);
          if (mapped.length === 0) {
            toast({ type: "info", message: `Sin resultados para "${q}"` });
          }
        } catch (err) {
          setSuggestions([]);
          setShowSuggest(true);
          setActiveIndex(-1);
          toast({ type: "error", message: `Error al buscar direcciones: ${String((err as Error)?.message ?? err)}` });
        }
      }, 350);
    };
  }, [toast]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return markers;
    return markers.filter((m) => {
      const name = (m.name ?? "").toLowerCase();
      const desc = (m.description ?? "").toLowerCase();
      const addr = (m.address ?? "").toLowerCase();
      const cp = (m.CP ?? "").toLowerCase();
      const coords = `${m.coordinates.lat.toFixed(5)},${m.coordinates.lng.toFixed(5)}`;
      return name.includes(q) || desc.includes(q) || addr.includes(q) || cp.includes(q) || coords.includes(q);
    });
  }, [markers, query]);

  // Agrupar markers filtrados por grupo
  const groupedMarkers = useMemo(() => groupLocations(filtered), [filtered]);
  const groupStats = useMemo(() => getGroupStats(filtered), [filtered]);
  const uniqueGroups = useMemo(() => getUniqueGroups(markers), [markers]);


  // Importar/Exportar JSON con el esquema AddressEntry
  const onImportClick = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!Array.isArray(data)) throw new Error("JSON no es un array");
        // Validación y normalización mínima
        const entries = data
          .map((d) => {
            if (!d) return null;
            const id = typeof d.id === "string" && d.id ? d.id : undefined;
            const name = typeof d.name === "string" ? d.name : "(Sin título)";
            const description = typeof d.description === "string" ? d.description : "";
            const address = typeof d.address === "string" ? d.address : "";
            const CP = typeof d.CP === "string" ? d.CP : "";
            const lat = d.coordinates?.lat;
            const lng = d.coordinates?.lng;
            if (typeof lat !== "number" || typeof lng !== "number") return null;
            return { id, name, description, address, CP, coordinates: { lat, lng } };
          })
          .filter(Boolean);
        if (entries.length === 0) throw new Error("No hay entradas válidas");
        // Añadir a la store
        entries.forEach((e) => {
          if (e) useMapStore.getState().addMarker(e);
        });
        toast({ type: "success", message: `Importadas ${entries.length} direcciones correctamente.` });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        toast({ type: "error", message: `Error al importar: ${errorMsg}` });
      }
    };
    input.click();
  };
  const selectSuggestion = (s: Suggestion) => {
    const id = useMapStore.getState().addMarker({
      name: s.name,
      description: "",
      address: s.address,
      CP: s.CP,
      coordinates: { lat: s.lat, lng: s.lng },
    });
    selectMarker(id);
    setQuery("");
    setSuggestions([]);
    setShowSuggest(false);
    setActiveIndex(-1);
    toast({ type: "success", message: `Añadida dirección: ${s.name}` });
  };

  const onExportClick = () => {
    const data = markers.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
      address: m.address,
      CP: m.CP,
      coordinates: { lat: m.coordinates.lat, lng: m.coordinates.lng },
    }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "direcciones.json";
    a.click();
    URL.revokeObjectURL(url);
    toast({ type: "success", message: "Exportación completada (direcciones.json)" });
  };

  const onDeleteClick = async (id: string, name?: string) => {
    const confirmed = await showConfirm({
      title: "Confirmar eliminación",
      message: `¿Estás seguro de que deseas eliminar "${name ?? "Marcador"}"?`,
      confirmText: "Eliminar",
      cancelText: "Cancelar",
      variant: "danger",
    });
    
    if (confirmed) {
      removeMarker(id);
      toast({ type: "success", message: `Eliminada: ${name ?? "Marcador"}` });
    }
  };

  const onRenameClick = async (id: string, current?: string) => {
    const newName = await showPrompt({
      title: "Renombrar dirección",
      message: "Ingresa el nuevo nombre para la dirección:",
      defaultValue: current ?? "",
      placeholder: "Nombre de la dirección",
      confirmText: "Renombrar",
      cancelText: "Cancelar",
      validate: (value) => {
        const trimmed = value.trim();
        if (trimmed.length === 0) {
          return "El nombre no puede estar vacío";
        }
        if (trimmed.length < 3) {
          return "El nombre debe tener al menos 3 caracteres";
        }
        return null;
      },
    });
    
    if (newName !== null) {
      renameMarker(id, newName.trim());
      toast({ type: "success", message: `Dirección renombrada: ${newName.trim()}` });
    }
  };

  // Edición inline por campo
  type InlineField = "name" | "description" | "address" | "CP";
  const [inlineEdit, setInlineEdit] = useState<{ id: string | null; field: InlineField | null; value: string }>(
    { id: null, field: null, value: "" }
  );

  const startInline = (m: (typeof markers)[number], field: InlineField) => {
    if (!isAdmin) return;
    // Si hay otra edición inline abierta, la cerramos sin guardar
    setInlineEdit({ id: m.id, field, value: String(m[field] ?? "") });
  };

  const cancelInline = () => setInlineEdit({ id: null, field: null, value: "" });

  const commitInline = () => {
    const { id, field, value } = inlineEdit;
    if (!id || !field) return;
    // Validaciones mínimas: name obligatorio, CP patrón opcional
    if (field === "name" && value.trim().length === 0) {
      toast({ type: "error", message: "El nombre no puede estar vacío" });
      return;
    }
    if (field === "CP" && value.trim().length > 0) {
      const cpPattern = /^\d{5}(?:[\s-].+)?$/;
      if (!cpPattern.test(value.trim())) {
        toast({ type: "error", message: "El CP debe comenzar con 5 dígitos" });
        return;
      }
    }
    updateMarker(id, { [field]: value } as Partial<Pick<typeof markers[number], "name" | "description" | "address" | "CP">>);
    toast({ type: "success", message: "Cambios guardados" });
    cancelInline();
  };

  const onInlineKey = (e: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      commitInline();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelInline();
    }
  };

  // Modal de edición completa con validaciones y accesibilidad
  // Modal de edición / creación unificado
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  const mapCenter = useMapStore((s) => s.center);
  const addMarker = useMapStore((s) => s.addMarker);


  const editingLocation = useMemo(() => 
    markers.find(m => m.id === editingId) || null, 
  [markers, editingId]);

  const handleSaveLocation = (data: any) => {
    if (editingLocation) {
      // Edición
      updateMarker(editingLocation.id, data);
      toast({ type: "success", message: "Dirección actualizada" });
      setEditingId(null);
    } else {
      // Creación
      // Usar coordenadas del formulario si existen, o centro del mapa, o default
      const coords = data.coordinates || mapCenter || { lat: 28.1235, lng: -15.4363 };
      addMarker({ ...data, coordinates: coords });
      toast({ type: "success", message: "Dirección creada" });
      setIsCreating(false);
    }
  };

  const onAddClick = () => {
    setIsCreating(true);
  };

  return (
    <aside
      className={`
        absolute top-0 left-0 h-full bg-gray-800 text-white
        ${isOpen ? "p-4 z-40 pointer-events-auto" : "p-0 z-0 pointer-events-none"}
        flex flex-col flex-shrink-0
        transform transition-transform duration-300 ease-in-out
        // Mobile width
        w-80 ${isOpen ? "translate-x-0" : "-translate-x-full"}
        // Desktop behavior: occupy layout only when open
        ${isOpen ? "md:relative md:w-96 md:translate-x-0" : "md:absolute md:w-0 md:-translate-x-full md:p-0"}
      `}
      aria-hidden={!isOpen}
    >
      {/* Encabezado con título y botón de cierre para móvil */}
      <div className="flex justify-between items-center mb-4">
        <div>
          <h2 className="text-2xl font-bold">Mis Direcciones</h2>
          <form action={logoutAction}>
            <button type="submit" className="text-xs text-red-400 hover:text-red-300 underline mt-1">
              Cerrar sesión
            </button>
          </form>
        </div>
        <div className="flex items-center gap-2">
          {/* Botón de ocultar para escritorio */}
          <button
            onClick={onClose}
            className="hidden md:inline-flex text-gray-300 hover:text-white text-sm px-2 py-1 rounded border border-gray-600 hover:border-gray-500"
            aria-label="Ocultar barra lateral"
            title="Ocultar"
          >
            Ocultar
          </button>
          {/* Botón de cierre para móvil */}
          <button
            onClick={onClose}
            className="md:hidden text-gray-400 hover:text-white text-2xl"
            aria-label="Cerrar menú"
          >
            &times;
          </button>
        </div>
      </div>

      {/* Campo de Búsqueda */}
      <div className="relative">
        <input
          type="text"
          placeholder="Buscar por nombre o coordenadas (lat,lng)..."
          className="w-full p-2 rounded bg-gray-700 border border-gray-600 placeholder-gray-400"
          value={query}
          onChange={(e) => {
            const v = e.target.value;
            setQuery(v);
            if (v.trim().length >= 3) {
              fetchSuggestions(v);
            } else {
              setSuggestions([]);
              setShowSuggest(false);
            }
          }}
          onFocus={() => {
            if (suggestions.length > 0) setShowSuggest(true);
          }}
          onKeyDown={(e) => {
            if (!showSuggest || suggestions.length === 0) return;
            // Atajos: Ctrl+Enter => solo centrar, Enter => crear (según toggle onlyCenter)
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIndex((i) => (i + 1) % suggestions.length);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              const s = suggestions[activeIndex] ?? suggestions[0];
              if (!s) return;
              if (e.ctrlKey || onlyCenter) {
                // Solo centrar: sin crear marker
                setCenter(s.lat, s.lng);
                setZoom(Math.max(14, (useMapStore.getState().zoom ?? 12)));
                toast({ type: "info", message: `Vista centrada en: ${s.name}` });
                setShowSuggest(false);
              } else {
                selectSuggestion(s);
              }
            } else if (e.key === "Escape") {
              setShowSuggest(false);
            }
          }}
          aria-expanded={showSuggest}
          aria-controls="suggest-listbox"
          aria-autocomplete="list"
          role="combobox"
        />

        {showSuggest && (
          <ul
            id="suggest-listbox"
            role="listbox"
            className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-gray-600 bg-gray-800 shadow-lg"
          >
            {suggestions.length === 0 ? (
              <li className="px-3 py-2 text-sm text-gray-400">Sin resultados</li>
            ) : (
              suggestions.map((s, idx) => (
                <li
                  key={s.id}
                  id={`opt-${s.id}`}
                  role="option"
                  aria-selected={idx === activeIndex}
                  className={`cursor-pointer px-3 py-2 text-sm ${idx === activeIndex ? "bg-gray-700" : "bg-gray-800 hover:bg-gray-700"}`}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    if (onlyCenter) {
                      setCenter(s.lat, s.lng);
                      setZoom(Math.max(14, (useMapStore.getState().zoom ?? 12)));
                      toast({ type: "info", message: `Vista centrada en: ${s.name}` });
                      setShowSuggest(false);
                    } else {
                      selectSuggestion(s);
                    }
                  }}
                >
                  <div className="font-medium">{s.name}</div>
                  <div className="text-xs text-gray-400">{s.address}</div>
                </li>
              ))
            )}
          </ul>
        )}
        <div className="mt-2 flex items-center gap-2 text-xs text-gray-300">
          <label className="inline-flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              className="accent-blue-500"
              checked={onlyCenter}
              onChange={(e) => setOnlyCenter(e.target.checked)}
            />
            Solo centrar (no crear marcador)
          </label>
        </div>
      </div>

      {/* Lista de Ubicaciones Agrupadas */}
      <div className="mt-4 flex-grow overflow-y-auto pr-2">
        {Object.keys(groupedMarkers).length === 0 ? (
          <p className="text-sm text-gray-400">No hay resultados para &quot;{query}&quot;</p>
        ) : (
          Object.entries(groupedMarkers)
            .sort(([a], [b]) => {
              // Inbox siempre primero
              if (a === "Inbox") return -1;
              if (b === "Inbox") return 1;
              return a.localeCompare(b);
            })
            .map(([groupName, items]) => (
              <details
                key={groupName}
                open={openGroup === groupName}
                className="mb-3"
              >
                <summary
                  className="cursor-pointer font-bold text-lg text-gray-100 hover:text-white mb-2 select-none flex items-center gap-2"
                  onClick={(e) => {
                    e.preventDefault();
                    setOpenGroup(openGroup === groupName ? null : groupName);
                  }}
                >
                  <div
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: getGroupColor(groupName) }}
                  />
                  {groupName} ({groupStats[groupName] || 0})
                </summary>
                <ul className="space-y-3 ml-2">
                  {items.map((m) => (
                    <li
                      key={m.id}
                      className={`bg-gray-700 p-3 rounded-lg flex justify-between items-start border ${
                        selectedId === m.id ? "border-blue-500" : "border-transparent"
                      }`}
                    >
                      <button
                        className="text-left flex-grow"
                        onClick={() => selectMarker(m.id)}
                        title="Seleccionar en el mapa"
                      >
                        {/* Name inline */}
                        {inlineEdit.id === m.id && inlineEdit.field === "name" ? (
                          <input
                            className="font-semibold w-full bg-gray-700 border border-blue-500 rounded px-2 py-1"
                            value={inlineEdit.value}
                            onChange={(e) => setInlineEdit((s) => ({ ...s, value: e.target.value }))}
                            onBlur={commitInline}
                            onKeyDown={onInlineKey}
                            autoFocus
                          />
                        ) : (
                          <h3
                            className="font-semibold hover:underline cursor-text"
                            title="Editar nombre"
                            onClick={() => startInline(m, "name")}
                          >
                            {m.name || "(Sin título)"}
                          </h3>
                        )}

                        {/* Tags pills */}
                        {m.tags && m.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-1">
                            {m.tags.map((tag, idx) => (
                              <span
                                key={idx}
                                className="inline-block bg-gray-600 text-gray-200 text-xs px-2 py-0.5 rounded-full"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}

                        {/* Description inline */}
                        {inlineEdit.id === m.id && inlineEdit.field === "description" ? (
                          <textarea
                            className="mt-1 w-full bg-gray-700 border border-blue-500 rounded px-2 py-1 text-sm text-gray-200"
                            value={inlineEdit.value}
                            onChange={(e) => setInlineEdit((s) => ({ ...s, value: e.target.value }))}
                            onBlur={commitInline}
                            onKeyDown={onInlineKey}
                            rows={2}
                            autoFocus
                          />
                        ) : (
                          <p
                            className="text-sm text-gray-400 hover:underline cursor-text mt-1"
                            title="Editar descripción"
                            onClick={() => startInline(m, "description")}
                          >
                            {m.description || <span className="italic text-gray-500">Añade una descripción</span>}
                          </p>
                        )}

                        {/* Address inline */}
                        {inlineEdit.id === m.id && inlineEdit.field === "address" ? (
                          <input
                            className="mt-1 w-full bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-gray-200"
                            value={inlineEdit.value}
                            onChange={(e) => setInlineEdit((s) => ({ ...s, value: e.target.value }))}
                            onBlur={commitInline}
                            onKeyDown={onInlineKey}
                            autoFocus
                          />
                        ) : (
                          <p
                            className="text-xs text-gray-500 hover:underline cursor-text mt-1"
                            title="Editar dirección"
                            onClick={() => startInline(m, "address")}
                          >
                            {m.address || <span className="italic text-gray-600">Añade una dirección</span>}
                          </p>
                        )}

                        {/* CP inline */}
                        {inlineEdit.id === m.id && inlineEdit.field === "CP" ? (
                          <input
                            className="mt-1 w-full bg-gray-700 border border-blue-500 rounded px-2 py-1 text-xs text-gray-200"
                            value={inlineEdit.value}
                            onChange={(e) => setInlineEdit((s) => ({ ...s, value: e.target.value }))}
                            onBlur={commitInline}
                            onKeyDown={onInlineKey}
                            autoFocus
                          />
                        ) : (
                          <p
                            className="text-xs text-gray-500 hover:underline cursor-text mt-1"
                            title="Editar CP"
                            onClick={() => startInline(m, "CP")}
                          >
                            {m.CP || <span className="italic text-gray-600">Añade CP</span>}
                          </p>
                        )}
                        <p className="text-xs text-gray-500 mt-1">
                          {m.coordinates.lat.toFixed(5)}, {m.coordinates.lng.toFixed(5)}
                        </p>
                      </button>
                      {isAdmin && (
                        <div className="flex flex-col gap-1 items-end ml-2">
                          <div className="flex gap-1">
                            <button
                              className="text-gray-300 hover:text-white text-xs px-2 py-1 rounded border border-gray-600 hover:border-gray-500"
                              onClick={() => onRenameClick(m.id, m.name)}
                              title="Renombrar"
                            >
                              Renombrar
                            </button>
                            <button
                              className="text-gray-300 hover:text-white text-xs px-2 py-1 rounded border border-gray-600 hover:border-gray-500"
                              onClick={() => setEditingId(m.id)}
                              title="Editar"
                            >
                              Editar
                            </button>
                          </div>
                          <button
                            className="text-gray-400 hover:text-red-400 text-xl leading-none"
                            aria-label={`Eliminar ${m.name ?? "Marcador"}`}
                            onClick={() => onDeleteClick(m.id, m.name)}
                            title="Eliminar"
                          >
                            &times;
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </details>
            ))
        )}
      </div>

      {/* Botones de Acción */}
      {isAdmin && (
        <div className="mt-4 pt-4 border-t border-gray-700">
          <button
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded mb-2"
            onClick={() => setIsCreating(true)}
          >
            + Añadir Nueva Dirección
          </button>
          <div className="flex space-x-2">
            <button
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded"
              onClick={onImportClick}
            >
              Importar
            </button>
            <button
              className="flex-1 bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded"
              onClick={onExportClick}
            >
              Exportar
            </button>
          </div>
        </div>
      )}

      {/* Modal de edición / creación */}
      <LocationModal
        isOpen={!!editingId || isCreating}
        onClose={() => {
          setEditingId(null);
          setIsCreating(false);
        }}
        onSave={handleSaveLocation}
        initialData={editingLocation}
        defaultCoordinates={mapCenter || { lat: 28.1235, lng: -15.4363 }}
      />
    </aside>
  );
};

export default Sidebar;

