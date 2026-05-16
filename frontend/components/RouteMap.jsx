"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_SCRIPT_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = "&copy; OpenStreetMap &copy; CARTO";
const LEG_DURATION_MS = 1200;

const modeVisuals = {
  sea: { label: "Sea", color: "#5DCAA5", weight: 2.5, dashArray: "8,6" },
  rail: { label: "Rail", color: "#8AAB4A", weight: 2.5, dashArray: "2,8" },
  truck: { label: "Truck", color: "#EF9F27", weight: 2.3, dashArray: null },
  air: { label: "Air", color: "#9CCBFF", weight: 2.3, dashArray: "4,10" }
};

const defaultModeVisual = { label: "Other", color: "#CBD5E1", weight: 2.3, dashArray: null };

let leafletPromise;

function loadLeaflet() {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Leaflet requires a browser"));
  }

  if (window.L) {
    return Promise.resolve(window.L);
  }

  if (!document.querySelector(`link[href="${LEAFLET_CSS_URL}"]`)) {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = LEAFLET_CSS_URL;
    document.head.appendChild(link);
  }

  if (!leafletPromise) {
    leafletPromise = new Promise((resolve, reject) => {
      const existingScript = document.querySelector(`script[src="${LEAFLET_SCRIPT_URL}"]`);

      if (existingScript) {
        existingScript.addEventListener("load", () => resolve(window.L), { once: true });
        existingScript.addEventListener("error", () => reject(new Error("Leaflet failed to load")), { once: true });
        return;
      }

      const script = document.createElement("script");
      script.src = LEAFLET_SCRIPT_URL;
      script.async = true;
      script.onload = () => resolve(window.L);
      script.onerror = () => reject(new Error("Leaflet failed to load"));
      document.body.appendChild(script);
    });
  }

  return leafletPromise;
}

function buildRouteSegments(legs) {
  const segments = [];
  const waypoints = [];
  let cumulativeEmissions = 0;

  legs.forEach((leg, index) => {
    const from = {
      name: leg.from_name,
      lat: leg.from_latitude,
      lng: leg.from_longitude
    };
    const to = {
      name: leg.to_name,
      lat: leg.to_latitude,
      lng: leg.to_longitude
    };

    if (index === 0 || waypoints.length === 0) {
      waypoints.push({ ...from, cumulativeEmissions });
    }

    cumulativeEmissions += leg.emissions_kg;
    waypoints.push({ ...to, cumulativeEmissions });
    segments.push({
      from,
      to,
      mode: leg.mode,
      emissions: leg.emissions_kg,
      geometry:
        Array.isArray(leg.geometry) && leg.geometry.length >= 2
          ? leg.geometry.map((point) => [point[0], point[1]])
          : defaultGeometryForMode(leg.mode, from, to)
    });
  });

  return { segments, waypoints };
}

function greatCirclePoints(from, to, steps = 42) {
  const lat1 = toRadians(from.lat);
  const lon1 = toRadians(from.lng);
  const lat2 = toRadians(to.lat);
  const lon2 = toRadians(to.lng);
  const distance =
    2 *
    Math.asin(
      Math.sqrt(
        Math.sin((lat2 - lat1) / 2) ** 2 +
          Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
      )
    );

  if (distance === 0) {
    return [[from.lat, from.lng]];
  }

  return Array.from({ length: steps + 1 }, (_, index) => {
    const fraction = index / steps;
    const a = Math.sin((1 - fraction) * distance) / Math.sin(distance);
    const b = Math.sin(fraction * distance) / Math.sin(distance);
    const x = a * Math.cos(lat1) * Math.cos(lon1) + b * Math.cos(lat2) * Math.cos(lon2);
    const y = a * Math.cos(lat1) * Math.sin(lon1) + b * Math.cos(lat2) * Math.sin(lon2);
    const z = a * Math.sin(lat1) + b * Math.sin(lat2);
    const lat = Math.atan2(z, Math.sqrt(x * x + y * y));
    const lon = Math.atan2(y, x);

    return [toDegrees(lat), toDegrees(lon)];
  });
}

function corridorPoints(from, to, bend = 0.12) {
  const midLat = (from.lat + to.lat) / 2;
  const midLng = (from.lng + to.lng) / 2;
  const deltaLat = to.lat - from.lat;
  const deltaLng = to.lng - from.lng;
  return [
    [from.lat, from.lng],
    [midLat + -deltaLng * bend, midLng + deltaLat * bend],
    [to.lat, to.lng]
  ];
}

function defaultGeometryForMode(mode, from, to) {
  if (mode === "sea" || mode === "air") {
    return greatCirclePoints(from, to);
  }
  if (mode === "rail") {
    return corridorPoints(from, to, 0.16);
  }
  return corridorPoints(from, to, 0.08);
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

export default function RouteMap({ legs, totalCO2e }) {
  const mapId = useId().replace(/:/g, "");
  const mapRef = useRef(null);
  const layersRef = useRef(null);
  const timersRef = useRef([]);
  const counterFrameRef = useRef(null);
  const [leafletFailed, setLeafletFailed] = useState(false);
  const [replayKey, setReplayKey] = useState(0);
  const [counter, setCounter] = useState(0);

  const routeData = useMemo(() => buildRouteSegments(legs ?? []), [legs]);

  useEffect(() => {
    let disposed = false;

    loadLeaflet()
      .then((L) => {
        if (disposed) {
          return;
        }

        if (!mapRef.current) {
          mapRef.current = L.map(mapId, {
            scrollWheelZoom: false,
            zoomControl: false,
            attributionControl: true
          });

          L.tileLayer(TILE_URL, {
            attribution: TILE_ATTRIBUTION,
            maxZoom: 18
          }).addTo(mapRef.current);

          const legend = L.control({ position: "bottomleft" });
          legend.onAdd = () => {
            const element = L.DomUtil.create("div", "route-map-legend");
            element.innerHTML = Object.entries(modeVisuals)
              .map(
                ([mode, visual]) => `
                  <div><span class="route-map-legend-line route-map-legend-${mode}" style="background:${visual.color};"></span>${visual.label}</div>
                `
              )
              .join("");
            return element;
          };
          legend.addTo(mapRef.current);
        }

        layersRef.current = layersRef.current ?? L.layerGroup().addTo(mapRef.current);
      })
      .catch(() => setLeafletFailed(true));

    return () => {
      disposed = true;
    };
  }, [mapId]);

  useEffect(() => {
    let cancelled = false;

    function clearAnimation() {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
      timersRef.current = [];

      if (counterFrameRef.current) {
        window.cancelAnimationFrame(counterFrameRef.current);
        counterFrameRef.current = null;
      }
    }

    clearAnimation();
    setCounter(0);

    loadLeaflet()
      .then((L) => {
        if (cancelled || !mapRef.current || !layersRef.current) {
          return;
        }

        layersRef.current.clearLayers();

        if (routeData.waypoints.length > 0) {
          const bounds = L.latLngBounds(routeData.waypoints.map((point) => [point.lat, point.lng]));
          mapRef.current.fitBounds(bounds, { padding: [40, 40], maxZoom: 6 });
        } else {
          mapRef.current.setView([18, 103], 3);
        }

        routeData.waypoints.forEach((point, index) => {
          const isFinal = index === routeData.waypoints.length - 1;
          L.circleMarker([point.lat, point.lng], {
            radius: isFinal ? 7 : 5,
            color: "#ffffff",
            weight: 2,
            fillColor: "#8aab4a",
            fillOpacity: 1,
            className: isFinal ? "route-map-final-marker" : ""
          })
            .bindTooltip(`${point.name} - ${point.cumulativeEmissions.toFixed(1)} kg CO2e so far`, {
              direction: "top",
              offset: [0, -8],
              className: "route-map-tooltip"
            })
            .addTo(layersRef.current);
        });

        routeData.segments.forEach((segment, index) => {
          const timer = window.setTimeout(() => {
            if (cancelled || !layersRef.current) {
              return;
            }

            const visual = modeVisuals[segment.mode] ?? defaultModeVisual;

            const points = segment.geometry;
            const polyline = L.polyline([], {
              color: visual.color,
              weight: visual.weight,
              opacity: 0.95,
              dashArray: visual.dashArray,
              lineCap: "round"
            }).addTo(layersRef.current);
            const startedAt = performance.now();

            function drawFrame(now) {
              if (cancelled) {
                return;
              }

              const progress = Math.min((now - startedAt) / LEG_DURATION_MS, 1);
              const visiblePoints = Math.max(2, Math.ceil(points.length * easeOutCubic(progress)));
              polyline.setLatLngs(points.slice(0, visiblePoints));

              if (progress < 1) {
                window.requestAnimationFrame(drawFrame);
              }
            }

            window.requestAnimationFrame(drawFrame);
          }, index * LEG_DURATION_MS);

          timersRef.current.push(timer);
        });

        const totalDuration = Math.max(routeData.segments.length * LEG_DURATION_MS, LEG_DURATION_MS);
        const counterStartedAt = performance.now();

        function updateCounter(now) {
          if (cancelled) {
            return;
          }

          const progress = Math.min((now - counterStartedAt) / totalDuration, 1);
          setCounter(totalCO2e * easeOutCubic(progress));

          if (progress < 1) {
            counterFrameRef.current = window.requestAnimationFrame(updateCounter);
          }
        }

        counterFrameRef.current = window.requestAnimationFrame(updateCounter);
      })
      .catch(() => setLeafletFailed(true));

    return () => {
      cancelled = true;
      clearAnimation();
    };
  }, [routeData, replayKey, totalCO2e]);

  return (
    <div className="mt-5">
      <div className="mb-3 flex items-center justify-between gap-4 rounded-2xl bg-white/10 px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-white/55">CO2e accumulated</span>
        <span className="text-[22px] font-semibold text-[#5DCAA5]">{counter.toFixed(1)} kg</span>
      </div>

      <div className="relative overflow-hidden rounded-lg">
        <div id={mapId} className="h-[280px] w-full bg-[#0f1f1a]" />
        <button
          type="button"
          aria-label="Replay route animation"
          onClick={() => setReplayKey((key) => key + 1)}
          className="absolute right-3 top-3 z-[500] inline-flex items-center gap-2 rounded-full bg-[#0f1f1a]/90 px-3 py-2 text-xs font-bold text-white shadow-lg transition hover:bg-[#1a2e2a]"
        >
          <span aria-hidden="true" className="text-sm leading-none">↻</span>
          Replay
        </button>
        {leafletFailed ? (
          <div className="absolute inset-0 z-[600] grid place-items-center bg-[#0f1f1a] text-sm font-semibold text-white/55">
            Map unavailable — see journey graph below
          </div>
        ) : null}
      </div>
    </div>
  );
}
