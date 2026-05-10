"use client";

import "leaflet/dist/leaflet.css"; // estilos de Leaflet solo en el cliente
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap, CircleMarker } from "react-leaflet";
import { type FC, Fragment, useCallback, useEffect, useId, useState, useRef } from "react";
import { useMapStore } from "@/hooks/useMapStore";
import { useAuthStore } from "@/hooks/useAuthStore";
import LocationModal from "./LocationModal";
import L from "leaflet";
import { getGroupColor } from "@/lib/colors";

// Asegurar iconos por defecto de Leaflet desde /public
L.Icon.Default.mergeOptions({
  iconUrl: "/marker-icon.png",
  iconRetinaUrl: "/marker-icon-2x.png",
  shadowUrl: "/marker-shadow.png",
});

const DEFAULT_CENTER: [number, number] = [28.1235, -15.4363]; // Las Palmas de Gran Canaria, como ejemplo
const DEFAULT_ZOOM = 12;

/**
 * Genera un icono de marcador con SVG coloreado dinámicamente
 * @param color - Color hex del marcador (ej: "#ef4444")
 * @returns L.DivIcon con SVG personalizado
 */
function createColoredMarkerIcon(color: string): L.DivIcon {
  const svgIcon = `
    <svg width="30" height="42" viewBox="0 0 30 42" xmlns="http://www.w3.org/2000/svg">
      <path 
        d="M15 0C6.716 0 0 6.716 0 15c0 8.284 15 27 15 27s15-18.716 15-27C30 6.716 23.284 0 15 0z" 
        fill="${color}" 
        stroke="#ffffff" 
        stroke-width="2"
      />
      <circle cx="15" cy="15" r="5" fill="#ffffff" />
    </svg>
  `;
  
  return L.divIcon({
    html: svgIcon,
    className: 'custom-marker-icon', // Clase para estilos adicionales si necesario
    iconSize: [30, 42],
    iconAnchor: [15, 42], // Punto del icono que corresponde a la posición del marcador
    popupAnchor: [0, -42], // Punto desde donde se abre el popup
  });
}

function InvalidateOnSidebarChange({ open }: { open?: boolean }) {
  const map = useMap();
  useEffect(() => {
    // pequeño retraso para permitir terminar la animación del sidebar
    const t = setTimeout(() => map.invalidateSize(), 160);
    return () => clearTimeout(t);
  }, [open, map]);
  return null;
}

function MapEventBinder({
  onDoubleClick,
}: {
  onDoubleClick: (lat: number, lng: number) => void;
}) {
  const setCenter = useMapStore((s) => s.setCenter);
  const setZoom = useMapStore((s) => s.setZoom);

  useMapEvents({
    dblclick(e) {
      const { lat, lng } = e.latlng;
      onDoubleClick(lat, lng);
    },
    moveend(e) {
      const c = e.target.getCenter();
      const z = e.target.getZoom();
      setCenter(c.lat, c.lng);
      setZoom(z);
    },
  });
  return null;
}

function SelectedMarkerFollower() {
  const map = useMap();
  const selectedId = useMapStore((s) => s.selectedId);
  const markers = useMapStore((s) => s.markers);

  useEffect(() => {
    if (!selectedId) return;
    const m = markers.find((x) => x.id === selectedId);
    if (!m) return;
    const targetZoom = Math.max(map.getZoom(), 14);
    map.flyTo([m.coordinates.lat, m.coordinates.lng], targetZoom, { duration: 0.5 });
  }, [selectedId, markers, map]);
  return null;
}

function CenterZoomFollower() {
  const map = useMap();
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);

  useEffect(() => {
    if (!center) return;
    const current = map.getCenter();
    const currentZoom = map.getZoom();
    const targetZoom = typeof zoom === "number" ? zoom : currentZoom;
    const eps = 1e-7;
    const sameCenter = Math.abs(current.lat - center.lat) < eps && Math.abs(current.lng - center.lng) < eps;
    const sameZoom = Math.abs(currentZoom - targetZoom) < eps;
    if (sameCenter && sameZoom) return;
    map.flyTo([center.lat, center.lng], targetZoom, { duration: 0.5 });
  }, [center, zoom, map]);
  return null;
}

type MapLeafletProps = { sidebarOpen?: boolean };

const MapLeaflet: FC<MapLeafletProps> = ({ sidebarOpen }) => {
  const [mounted, setMounted] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingCoordinates, setPendingCoordinates] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "searching" | "active">("idle");
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const mapKey = useId();

  const markers = useMapStore((s) => s.markers);
  const selectedId = useMapStore((s) => s.selectedId);
  const addMarker = useMapStore((s) => s.addMarker);
  const selectMarker = useMapStore((s) => s.selectMarker);
  const setCenter = useMapStore((s) => s.setCenter);
  const setZoom = useMapStore((s) => s.setZoom);
  const persistedCenter = useMapStore((s) => s.center);
  const persistedZoom = useMapStore((s) => s.zoom);

  // Evitar setState directo en effect - usar patrón de inicialización
  useEffect(() => {
    // Este efecto solo actualiza mounted una vez al montar
    const timer = setTimeout(() => setMounted(true), 0);
    return () => clearTimeout(timer);
  }, []);

  // Establecer estado inicial de vista en la store al montar el mapa,
  // respetando valores persistidos si existen
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!mounted || initializedRef.current) return;
    initializedRef.current = true;
    if (persistedCenter) {
      setCenter(persistedCenter.lat, persistedCenter.lng);
    } else {
      setCenter(DEFAULT_CENTER[0], DEFAULT_CENTER[1]);
    }
    if (typeof persistedZoom === "number") {
      setZoom(persistedZoom);
    } else {
      setZoom(DEFAULT_ZOOM);
    }
  }, [mounted, setCenter, setZoom, persistedCenter, persistedZoom]);

  const handleDoubleClick = (lat: number, lng: number) => {
    const isAdmin = useAuthStore.getState().role === "admin";
    if (!isAdmin) return;
    setPendingCoordinates({ lat, lng });
    setModalOpen(true);
  };

  const handleModalConfirm = (data: any) => {
    const id = addMarker(data);
    selectMarker(id);
    setModalOpen(false);
    setPendingCoordinates(null);
  };

  const handleModalCancel = () => {
    setModalOpen(false);
    setPendingCoordinates(null);
  };

  // GPS: Obtener ubicación del usuario
  const handleGpsClick = useCallback(() => {
    if (!navigator.geolocation) return;

    if (gpsStatus === "active" && userLocation) {
      // Si ya está activo, re-centrar
      setCenter(userLocation.lat, userLocation.lng);
      setZoom(16);
      return;
    }

    setGpsStatus("searching");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        setCenter(loc.lat, loc.lng);
        setZoom(16);
        setGpsStatus("active");
      },
      (err) => {
        console.error("GPS error:", err.message);
        setGpsStatus("idle");
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, [gpsStatus, userLocation, setCenter, setZoom]);

  if (!mounted) return null;

  return (
    <>
      <LocationModal
        isOpen={modalOpen}
        onClose={handleModalCancel}
        onSave={handleModalConfirm}
        defaultCoordinates={pendingCoordinates || undefined}
      />
      <MapContainer
        key={mapKey}
        center={persistedCenter ? [persistedCenter.lat, persistedCenter.lng] : DEFAULT_CENTER}
        zoom={typeof persistedZoom === "number" ? persistedZoom : DEFAULT_ZOOM}
        className="w-full h-full"
        scrollWheelZoom
        preferCanvas
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <MapEventBinder onDoubleClick={handleDoubleClick} />
      <SelectedMarkerFollower />
      <CenterZoomFollower />
      <InvalidateOnSidebarChange open={sidebarOpen} />

      {markers.map((m) => {
        const selectMarkerFn = useMapStore.getState().selectMarker;
        // Obtener color dinámico basado en el grupo
        const markerColor = getGroupColor(m.group || 'Inbox');
        const markerIcon = createColoredMarkerIcon(markerColor);
        
        return (
          <Fragment key={m.id}>
            <Marker
              position={[m.coordinates.lat, m.coordinates.lng]}
              icon={markerIcon}
              zIndexOffset={selectedId === m.id ? 1000 : 0}
              eventHandlers={{
                click: () => {
                  selectMarkerFn(m.id);
                },
              }}
            >
              <Popup>
                <div className="text-sm">
                  <strong>{m.name || "(Sin título)"}</strong>
                  <br />
                  <span className="text-gray-600">
                    {m.coordinates.lat.toFixed(5)}, {m.coordinates.lng.toFixed(5)}
                  </span>
                  {m.address && (
                    <>
                      <br />
                      <span className="text-gray-700">{m.address}</span>
                    </>
                  )}
                  {m.description && (
                    <>
                      <br />
                      <span className="text-gray-600 italic text-xs">{m.description}</span>
                    </>
                  )}
                </div>
              </Popup>
            </Marker>
            {selectedId === m.id && (
              <CircleMarker
                center={[m.coordinates.lat, m.coordinates.lng]}
                radius={14}
                pathOptions={{ color: "#3b82f6", weight: 3, fill: false }}
              />
            )}
          </Fragment>
        );
      })}

      {/* Marcador de ubicación GPS del usuario */}
      {userLocation && gpsStatus === "active" && (
        <>
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={8}
            pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.9, weight: 2 }}
          >
            <Popup>
              <div className="text-sm">
                <strong>📍 Tu ubicación</strong>
                <br />
                <span className="text-gray-600">
                  {userLocation.lat.toFixed(5)}, {userLocation.lng.toFixed(5)}
                </span>
              </div>
            </Popup>
          </CircleMarker>
          <CircleMarker
            center={[userLocation.lat, userLocation.lng]}
            radius={20}
            pathOptions={{ color: "#3b82f6", fillColor: "#3b82f6", fillOpacity: 0.15, weight: 1 }}
          />
        </>
      )}
      </MapContainer>

      {/* Botón GPS flotante */}
      <button
        onClick={handleGpsClick}
        className={`absolute bottom-6 right-4 z-[1000] w-11 h-11 rounded-full shadow-lg flex items-center justify-center transition-all ${
          gpsStatus === "searching"
            ? "bg-blue-500 animate-pulse shadow-blue-500/40"
            : gpsStatus === "active"
              ? "bg-green-500 hover:bg-green-600 shadow-green-500/30"
              : "bg-gray-700 hover:bg-gray-600 shadow-black/30"
        }`}
        aria-label={gpsStatus === "searching" ? "Buscando ubicación..." : "Obtener mi ubicación"}
        title={gpsStatus === "searching" ? "Buscando..." : gpsStatus === "active" ? "Centrar en mi ubicación" : "¿Dónde estoy?"}
      >
        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          {gpsStatus === "searching" ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          ) : (
            <>
              <circle cx="12" cy="12" r="3" strokeWidth={2} />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2v3m0 14v3m10-10h-3M5 12H2" />
            </>
          )}
        </svg>
      </button>
    </>
  );
};

export default MapLeaflet;
