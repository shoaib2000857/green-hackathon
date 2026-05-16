"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";

const LEAFLET_CSS_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
const LEAFLET_SCRIPT_URL = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const TILE_URL = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION = "&copy; OpenStreetMap &copy; CARTO";
const LEG_DURATION_MS = 1200;

const waypointCoordinates = {
  "chennai port": { name: "Chennai Port", lat: 13.095, lng: 80.309 },
  "chennai air cargo": { name: "Chennai Air Cargo", lat: 12.994, lng: 80.17 },
  "bengaluru air cargo": { name: "Bengaluru Air Cargo", lat: 13.198, lng: 77.706 },
  "delhi rail logistics hub": { name: "Delhi Rail Logistics Hub", lat: 28.644, lng: 77.216 },
  "nhava sheva port": { name: "Nhava Sheva Port", lat: 18.949, lng: 72.952 },
  "colombo port": { name: "Colombo Port", lat: 6.948, lng: 79.844 },
  "port of singapore": { name: "Port of Singapore", lat: 1.265, lng: 103.82 },
  "changi air cargo": { name: "Changi Air Cargo", lat: 1.364, lng: 103.991 },
  "kuala lumpur inland terminal": { name: "Kuala Lumpur Inland Terminal", lat: 3.139, lng: 101.687 },
  "bangkok logistics hub": { name: "Bangkok Logistics Hub", lat: 13.756, lng: 100.501 },
  "ho chi minh port": { name: "Ho Chi Minh Port", lat: 10.776, lng: 106.7 },
  "hanoi rail terminal": { name: "Hanoi Rail Terminal", lat: 21.028, lng: 105.834 },
  "port of yokohama": { name: "Port of Yokohama", lat: 35.443, lng: 139.638 },
  "tokyo air cargo": { name: "Tokyo Air Cargo", lat: 35.772, lng: 140.392 },
  "tokyo distribution center": { name: "Tokyo Distribution Center", lat: 35.676, lng: 139.65 },
  "shanghai port": { name: "Shanghai Port", lat: 31.23, lng: 121.473 },
  "hong kong air cargo": { name: "Hong Kong Air Cargo", lat: 22.308, lng: 113.918 },
  chennai: { name: "Chennai Port", lat: 13.095, lng: 80.309 },
  singapore: { name: "Port of Singapore", lat: 1.265, lng: 103.82 },
  yokohama: { name: "Port of Yokohama", lat: 35.443, lng: 139.638 },
  tokyo: { name: "Tokyo Air Cargo", lat: 35.772, lng: 140.392 },
  narita: { name: "Tokyo Air Cargo", lat: 35.772, lng: 140.392 },
  shanghai: { name: "Shanghai Port", lat: 31.23, lng: 121.473 },
  mumbai: { name: "Nhava Sheva Port", lat: 18.949, lng: 72.952 },
  colombo: { name: "Colombo Port", lat: 6.948, lng: 79.844 },
  bangkok: { name: "Bangkok Logistics Hub", lat: 13.756, lng: 100.501 },
  "hong kong": { name: "Hong Kong Air Cargo", lat: 22.308, lng: 113.918 },
  busan: { name: "Port of Yokohama", lat: 35.443, lng: 139.638 },
  jakarta: { name: "Bangkok Logistics Hub", lat: 13.756, lng: 100.501 }
};

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

function normalizeName(value) {
  return value.toLowerCase().replace(/[^a-z\s]/g, " ");
}

function matchWaypoint(value) {
  const normalized = normalizeName(value);
  const exact = waypointCoordinates[normalized];
  if (exact) {
    return exact;
  }

  const match = Object.entries(waypointCoordinates).find(([city]) => normalized.includes(city));
  return match ? match[1] : null;
}

function waypointForLegName(name) {
  const waypoint = matchWaypoint(name);
  if (!waypoint) {
    console.warn(`Route map skipped unmatched waypoint: ${name}`);
    return null;
  }

  return { ...waypoint, sourceName: name };
}

function buildRouteSegments(legs) {
  const segments = [];
  const waypoints = [];
  let cumulativeEmissions = 0;

  legs.forEach((leg, index) => {
    const from = waypointForLegName(leg.from_name);
    const to = waypointForLegName(leg.to_name);

    if (!from || !to) {
      console.warn(`Route map skipped unmatched leg: ${leg.from_name} to ${leg.to_name}`);
      cumulativeEmissions += leg.emissions_kg;
      return;
    }

    if (index === 0 || waypoints.length === 0) {
      waypoints.push({ ...from, cumulativeEmissions });
    }

    cumulativeEmissions += leg.emissions_kg;
    waypoints.push({ ...to, cumulativeEmissions });
    segments.push({ from, to, mode: leg.mode, emissions: leg.emissions_kg });
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

            const points =
              segment.mode === "sea"
                ? greatCirclePoints(segment.from, segment.to)
                : [
                    [segment.from.lat, segment.from.lng],
                    [segment.to.lat, segment.to.lng]
                  ];
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
