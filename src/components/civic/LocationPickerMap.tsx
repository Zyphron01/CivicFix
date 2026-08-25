"use client";

import React, { useEffect, useRef } from "react";
import L from "leaflet";
import { LocationSource } from "@/types/civic";

interface LocationPickerMapProps {
  latitude: number | null;
  longitude: number | null;
  accuracyMeters?: number;
  locationSource?: LocationSource;
  onManualLocationSelected: (lat: number, lng: number) => void;
  disabled?: boolean;
}

/**
 * Pure visualization component. Does NOT drive any location logic.
 * It only renders what it is given.
 *
 * Initial state (latitude=null, longitude=null):
 *   Shows "No location selected yet" overlay.
 *   Map initializes on a neutral country-level view of India (no city, no marker).
 *   The neutral centre is NEVER saved or used as an issue location.
 *
 * When valid coordinates are provided:
 *   Marker and accuracy circle are placed at those coordinates.
 *
 * When user clicks/drags:
 *   Calls onManualLocationSelected — the parent decides what to do.
 */
export default function LocationPickerMap({
  latitude,
  longitude,
  accuracyMeters,
  locationSource,
  onManualLocationSelected,
  disabled = false,
}: LocationPickerMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const markerRef = useRef<L.Marker | null>(null);
  const circleRef = useRef<L.Circle | null>(null);

  // Initialize the map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // Neutral India-level view — zoom 5, centred on geographic centre of India.
    // This is NEVER treated as or stored as a user location.
    const map = L.map(mapContainerRef.current, {
      center: [20.5937, 78.9629],
      zoom: 5,
      scrollWheelZoom: !disabled,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    if (!disabled) {
      map.on("click", (e: L.LeafletMouseEvent) => {
        const lat = Number(e.latlng.lat.toFixed(6));
        const lng = Number(e.latlng.lng.toFixed(6));
        onManualLocationSelected(lat, lng);
      });
    }

    mapInstanceRef.current = map;

    return () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        markerRef.current = null;
        circleRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update marker and accuracy circle when coordinates change
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const hasValidCoords =
      latitude !== null &&
      longitude !== null &&
      isFinite(latitude) &&
      isFinite(longitude);

    if (hasValidCoords) {
      const pos: [number, number] = [latitude!, longitude!];

      const customIcon = L.icon({
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41],
      });

      if (!markerRef.current) {
        const marker = L.marker(pos, {
          draggable: !disabled,
          icon: customIcon,
        }).addTo(map);

        const popupText =
          locationSource === "LIVE_PRECISE_DEVICE"
            ? "<b>Precise GPS Location</b><br>Drag marker to adjust if needed."
            : "<b>Manual Location Pin</b><br>Drag marker to adjust.";
        marker.bindPopup(popupText).openPopup();

        marker.on("dragend", () => {
          const p = marker.getLatLng();
          onManualLocationSelected(Number(p.lat.toFixed(6)), Number(p.lng.toFixed(6)));
        });

        markerRef.current = marker;
      } else {
        markerRef.current.setLatLng(pos);
      }

      // Zoom in on coordinates — only if map is at country-level zoom
      if (map.getZoom() < 13) {
        map.setView(pos, 16);
      } else {
        map.setView(pos, map.getZoom());
      }

      // Accuracy circle
      if (circleRef.current) {
        map.removeLayer(circleRef.current);
        circleRef.current = null;
      }

      if (accuracyMeters && accuracyMeters > 0) {
        circleRef.current = L.circle(pos, {
          radius: accuracyMeters,
          color: locationSource === "LIVE_PRECISE_DEVICE" ? "#16a34a" : "#2563eb",
          fillColor: locationSource === "LIVE_PRECISE_DEVICE" ? "#22c55e" : "#3b82f6",
          fillOpacity: 0.12,
          weight: 1.5,
        }).addTo(map);
      }
    } else {
      // Remove any existing marker and circle — reset to neutral state
      if (markerRef.current) {
        map.removeLayer(markerRef.current);
        markerRef.current = null;
      }
      if (circleRef.current) {
        map.removeLayer(circleRef.current);
        circleRef.current = null;
      }
    }
  }, [latitude, longitude, accuracyMeters, locationSource, disabled, onManualLocationSelected]);

  const hasValidCoords =
    latitude !== null &&
    longitude !== null &&
    isFinite(latitude) &&
    isFinite(longitude);

  const sourceLabel =
    locationSource === "LIVE_PRECISE_DEVICE"
      ? "📡 Precise GPS Location"
      : locationSource === "MANUAL_MAP_SELECTION"
      ? "🗺️ Manual Location Pin"
      : null;

  return (
    <div className="relative w-full rounded-2xl overflow-hidden border border-slate-300 shadow-inner">
      <div ref={mapContainerRef} className="w-full h-64 z-0" />

      {!hasValidCoords ? (
        <div className="absolute inset-0 bg-slate-900/65 backdrop-blur-sm flex flex-col items-center justify-center p-4 text-center z-[400] text-white pointer-events-none">
          <span className="text-3xl mb-2">📍</span>
          <p className="font-bold text-sm">No Location Selected Yet</p>
          <p className="text-xs text-slate-300 max-w-xs mt-1">
            Click <strong className="text-emerald-400">&quot;Use My Live Location&quot;</strong> above, or click
            anywhere on the map to place a manual pin.
          </p>
        </div>
      ) : (
        <div className="absolute bottom-2 left-2 right-2 bg-slate-900/85 backdrop-blur text-white text-[11px] px-3 py-2 rounded-xl flex items-center justify-between z-[400] shadow pointer-events-none border border-slate-700">
          <div className="flex items-center space-x-2">
            <span
              className={`w-2 h-2 rounded-full ${
                locationSource === "LIVE_PRECISE_DEVICE" ? "bg-emerald-400 animate-pulse" : "bg-blue-400"
              }`}
            />
            <span className="font-bold">{sourceLabel}</span>
          </div>
          <span className="font-mono text-emerald-300 font-bold">
            {latitude?.toFixed(5)}, {longitude?.toFixed(5)}
            {accuracyMeters ? ` (±${accuracyMeters}m)` : ""}
          </span>
        </div>
      )}
    </div>
  );
}
