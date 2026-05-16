"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

type Mode = "sea" | "road" | "air" | "rail";
type Confidence = "high" | "medium" | "low";

type ForecastLegInput = {
  id: string;
  from_node: string;
  to_node: string;
  mode: Mode;
  weight_kg: number;
  load_pct: number;
  fuel_type: string;
  is_reefer: boolean;
  departure_date: string;
};

type LegForecast = {
  from_node: string;
  to_node: string;
  mode: Mode;
  distance_km: number;
  distance_source: string;
  emissions_nominal_kg: number;
  emissions_low_kg: number;
  emissions_high_kg: number;
  confidence: Confidence;
  emission_factor_source: string;
  corrections_applied: string[];
  weather_context: null | {
    wind_speed_ms?: number;
    temp_c?: number;
    weather_description?: string;
  };
};

type ForecastResponse = {
  legs: LegForecast[];
  total_nominal_kg: number;
  total_low_kg: number;
  total_high_kg: number;
  overall_confidence: Confidence;
  generated_at: string;
};

type Factors = Record<Mode, Record<string, number>>;

const modeMeta: Record<Mode, { label: string; freightLabel: string; emoji: string; fuelFallback: string }> = {
  sea: { label: "Sea", freightLabel: "Sea Freight", emoji: "🚢", fuelFallback: "diesel" },
  road: { label: "Road", freightLabel: "Road Freight", emoji: "🚛", fuelFallback: "diesel" },
  air: { label: "Air", freightLabel: "Air Freight", emoji: "✈️", fuelFallback: "kerosene" },
  rail: { label: "Rail", freightLabel: "Rail Freight", emoji: "🚂", fuelFallback: "diesel" }
};

const confidenceClass: Record<Confidence, string> = {
  high: "bg-fern/20 text-moss border-fern/30",
  medium: "bg-amber-100 text-amber-800 border-amber-200",
  low: "bg-red-100 text-red-700 border-red-200"
};

const distanceSourceLabels: Record<string, string> = {
  searoute_local: "searoute package",
  osrm: "OSRM routing",
  formula: "Great-circle formula",
  haversine_fallback: "Haversine estimate (fallback)"
};

const defaultFactors: Factors = {
  sea: { diesel: 0.011, marine_diesel: 0.013, lng: 0.008 },
  road: { diesel: 0.096, electric: 0.04 },
  air: { kerosene: 0.602 },
  rail: { diesel: 0.028, electric: 0.018 }
};

type DataSourceRow = {
  sourceName: string;
  usedFor: string;
  status: "Active" | "Fallback" | "Not used";
  note: string;
};

type ConfidenceDriver = {
  legLabel: string;
  reason: string;
};

type ConfidenceChecklistItem = {
  label: string;
  done: boolean;
  note: string;
};

function isMode(value: string | null): value is Mode {
  return value === "sea" || value === "road" || value === "air" || value === "rail";
}

function getModeMeta(mode: Mode) {
  return modeMeta[mode];
}

function getDistanceSourceLabel(source: string) {
  return distanceSourceLabels[source] ?? source.replaceAll("_", " ");
}

function isFallbackDistanceSource(source: string) {
  return source.includes("fallback") || source.includes("formula");
}

function getDistanceSourceTone(source: string) {
  return isFallbackDistanceSource(source) ? "text-amber-700" : "text-ink/55";
}

function newLeg(): ForecastLegInput {
  return {
    id: crypto.randomUUID(),
    from_node: "Chennai Port",
    to_node: "Port of Yokohama",
    mode: "sea",
    weight_kg: 1200,
    load_pct: 75,
    fuel_type: modeMeta.sea.fuelFallback,
    is_reefer: false,
    departure_date: ""
  };
}

function formatKg(value: number) {
  return `${value.toFixed(2)} kg CO₂e`;
}

function buildInitialLeg(query: string): ForecastLegInput {
  const params = new URLSearchParams(query);
  const modeParam = params.get("mode");
  const mode = isMode(modeParam) ? modeParam : "sea";
  const weightValue = Number(params.get("weightKg") ?? 1200);

  return {
    id: crypto.randomUUID(),
    from_node: params.get("origin") ?? "Chennai Port",
    to_node: params.get("destination") ?? "Port of Yokohama",
    mode,
    weight_kg: Number.isFinite(weightValue) && weightValue > 0 ? weightValue : 1200,
    load_pct: 75,
    fuel_type: modeMeta[mode].fuelFallback,
    is_reefer: false,
    departure_date: ""
  };
}

function buildDataSourceRows(forecast: ForecastResponse, submittedLegs: ForecastLegInput[]): DataSourceRow[] {
  const hasSeaLeg = forecast.legs.some((leg) => leg.mode === "sea");
  const hasRoadLeg = forecast.legs.some((leg) => leg.mode === "road");
  const weatherRequested = submittedLegs.some((leg) => Boolean(leg.departure_date));

  const seaActive = forecast.legs.some((leg) => leg.distance_source === "searoute_local");
  const roadActive = forecast.legs.some((leg) => leg.distance_source === "osrm");
  const climatiqActive = forecast.legs.some((leg) => leg.emission_factor_source === "climatiq");
  const weatherActive = forecast.legs.some((leg) => leg.weather_context !== null);

  const seaFallback = forecast.legs.some((leg) => leg.mode === "sea" && isFallbackDistanceSource(leg.distance_source));
  const roadFallback = forecast.legs.some((leg) => leg.mode === "road" && isFallbackDistanceSource(leg.distance_source));
  const climatiqFallback = forecast.legs.some((leg) => leg.emission_factor_source === "glec_local");
  const weatherFallback = !weatherActive;

  return [
    {
      sourceName: "searoute open-source package",
      usedFor: "Offline sea leg distance resolution",
      status: seaActive ? "Active" : hasSeaLeg ? "Fallback" : "Not used",
      note: !hasSeaLeg
        ? "Add a sea leg to use local maritime routing."
        : seaFallback
          ? "Install backend requirements to enable the free local searoute package."
          : "Free local maritime routing is active for sea legs."
    },
    {
      sourceName: "OSRM routing",
      usedFor: "Road leg distance resolution",
      status: roadActive ? "Active" : hasRoadLeg ? "Fallback" : "Not used",
      note: !hasRoadLeg
        ? "Add a road leg to use OSRM routing."
        : roadFallback
          ? "Set OSRM_BASE_URL or connect a routing service for verified road distances."
          : "Verified routing is active for road legs."
    },
    {
      sourceName: "Climatiq GLEC factors",
      usedFor: "Emission factor lookup and kg CO₂e estimation",
      status: climatiqActive ? "Active" : "Fallback",
      note: climatiqFallback ? "Set CLIMATIQ_API_KEY for verified emission factors." : "Verified emission factors are active."
    },
    {
      sourceName: "OpenWeatherMap",
      usedFor: "Weather context for departure-date-sensitive uncertainty",
      status: weatherActive ? "Active" : weatherRequested ? "Fallback" : "Not used",
      note: !weatherRequested
        ? "Provide a departure date to request weather-adjusted estimates."
        : weatherFallback
          ? "Set OPENWEATHER_API_KEY for weather-adjusted estimates."
          : "Weather context is active for at least one leg."
    }
  ];
}

function buildConfidenceDetails(forecast: ForecastResponse | null, submittedLegs: ForecastLegInput[]) {
  if (!forecast) {
    return { drivers: [] as ConfidenceDriver[], checklist: [] as ConfidenceChecklistItem[] };
  }

  const drivers: ConfidenceDriver[] = [];

  forecast.legs.forEach((leg, index) => {
    const submittedLeg = submittedLegs[index];
    const reasons: string[] = [];

    if (leg.emission_factor_source === "glec_local") {
      reasons.push("uses local GLEC factors");
    }
    if (isFallbackDistanceSource(leg.distance_source)) {
      reasons.push(`distance via ${getDistanceSourceLabel(leg.distance_source)}`);
    }
    if (!leg.weather_context) {
      reasons.push("no weather context");
    }
    if (submittedLeg?.load_pct === 75) {
      reasons.push("default 75% load assumption");
    }
    if (!submittedLeg?.departure_date) {
      reasons.push("no departure date provided");
    }

    if (reasons.length > 0 && leg.confidence === "low") {
      drivers.push({
        legLabel: `${leg.from_node} → ${leg.to_node} (${getModeMeta(leg.mode).freightLabel})`,
        reason: reasons.join("; ")
      });
    }
  });

  const checklist: ConfidenceChecklistItem[] = [
    {
      label: "Set CLIMATIQ_API_KEY for verified emission factors (+precision)",
      done: !forecast.legs.some((leg) => leg.emission_factor_source === "glec_local"),
      note: forecast.legs.some((leg) => leg.emission_factor_source === "glec_local")
        ? "One or more legs fell back to local GLEC factors."
        : "Verified emission factors are already active."
    },
    {
      label: "Install searoute package for local sea distances (+precision)",
      done: !forecast.legs.some((leg) => isFallbackDistanceSource(leg.distance_source)),
      note: forecast.legs.some((leg) => isFallbackDistanceSource(leg.distance_source))
        ? "One or more legs used a fallback distance estimate."
        : "Verified routing is already active where available."
    },
    {
      label: "Set OPENWEATHER_API_KEY for weather-adjusted estimates (+context)",
      done: forecast.legs.some((leg) => leg.weather_context !== null),
      note: forecast.legs.some((leg) => leg.weather_context !== null)
        ? "At least one leg already includes weather context."
        : submittedLegs.some((leg) => leg.departure_date)
          ? "Add the OpenWeather key to convert the supplied departure date into weather context."
          : "Provide a departure date to unlock weather context."
    },
    {
      label: "Specify exact load percentage instead of default 75%",
      done: submittedLegs.every((leg) => leg.load_pct !== 75),
      note: submittedLegs.some((leg) => leg.load_pct === 75)
        ? "One or more legs are still using the default load assumption."
        : "Load percentages are customized for all legs."
    },
    {
      label: "Provide departure date for weather context",
      done: submittedLegs.every((leg) => Boolean(leg.departure_date)),
      note: submittedLegs.some((leg) => !leg.departure_date)
        ? "A departure date lets the model fetch context-sensitive weather data."
        : "Departure dates are provided for all legs."
    }
  ];

  return { drivers, checklist };
}

export default function ForecastPage() {
  return (
    <Suspense fallback={<ForecastLoading />}>
      <ForecastPageContent />
    </Suspense>
  );
}

function ForecastLoading() {
  return (
    <main className="grid min-h-screen place-items-center p-6">
      <div className="rounded-[2rem] bg-white/80 p-8 shadow-panel">Loading forecast builder...</div>
    </main>
  );
}

function ForecastPageContent() {
  const searchParams = useSearchParams();
  const query = searchParams.toString();
  const initialLeg = useMemo(() => buildInitialLeg(query), [query]);
  const [legs, setLegs] = useState<ForecastLegInput[]>([initialLeg]);
  const [submittedLegs, setSubmittedLegs] = useState<ForecastLegInput[]>([initialLeg]);
  const [factors, setFactors] = useState<Factors>(defaultFactors);
  const [forecast, setForecast] = useState<ForecastResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showInfoBanner, setShowInfoBanner] = useState(true);
  const [confidencePopoverOpen, setConfidencePopoverOpen] = useState(false);
  const [dataSourcesExpanded, setDataSourcesExpanded] = useState(false);

  const forecastContext = useMemo(() => {
    const params = new URLSearchParams(query);
    return {
      origin: params.get("origin"),
      destination: params.get("destination"),
      priority: params.get("priority"),
      mode: params.get("mode")
    };
  }, [query]);

  useEffect(() => {
    const loadFactors = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/forecast/factors`, { cache: "no-store" });
        if (!response.ok) {
          throw new Error(`Factor lookup failed with ${response.status}`);
        }
        setFactors(await response.json());
      } catch {
        setFactors(defaultFactors);
      }
    };

    void loadFactors();
  }, []);

  useEffect(() => {
    setLegs([initialLeg]);
    setSubmittedLegs([initialLeg]);
    setForecast(null);
    setConfidencePopoverOpen(false);
    setDataSourcesExpanded(false);
  }, [initialLeg]);

  useEffect(() => {
    setDataSourcesExpanded(false);
  }, [forecast]);

  const totalWeight = useMemo(() => legs.reduce((sum, leg) => sum + Number(leg.weight_kg || 0), 0), [legs]);
  const dataSourceRows = useMemo(() => (forecast ? buildDataSourceRows(forecast, submittedLegs) : []), [forecast, submittedLegs]);
  const confidenceDetails = useMemo(() => buildConfidenceDetails(forecast, submittedLegs), [forecast, submittedLegs]);

  function updateLeg(id: string, patch: Partial<ForecastLegInput>) {
    setLegs((current) =>
      current.map((leg) => {
        if (leg.id !== id) {
          return leg;
        }
        const next = { ...leg, ...patch };
        if (patch.mode && !factors[patch.mode]?.[next.fuel_type]) {
          next.fuel_type = Object.keys(factors[patch.mode] ?? {})[0] ?? modeMeta[patch.mode].fuelFallback;
        }
        return next;
      })
    );
  }

  function addLeg() {
    setLegs((current) => [...current, newLeg()]);
  }

  function removeLeg(id: string) {
    setLegs((current) => (current.length > 1 ? current.filter((leg) => leg.id !== id) : current));
  }

  async function runForecast(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const legSnapshot = legs.map((leg) => ({ ...leg }));
      const requestLegs = legSnapshot.map(({ id, ...leg }) => ({
        ...leg,
        mode: leg.mode.toLowerCase() as Mode
      }));

      setSubmittedLegs(legSnapshot);

      const response = await fetch(`${API_BASE_URL}/forecast/emissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          legs: requestLegs,
          currency: "USD"
        })
      });
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(detail || `Forecast failed with ${response.status}`);
      }
      setForecast(await response.json());
    } catch (error) {
      setError(error instanceof Error ? error.message : "Forecast failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-6 md:px-10">
      <div className="grain" />
      <section className="relative mx-auto max-w-7xl">
        <header className="flex flex-col gap-5 rounded-[1.75rem] border border-white/60 bg-white/65 p-6 shadow-panel backdrop-blur md:flex-row md:items-center md:justify-between">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-bold text-ink md:text-5xl">Emissions Forecasting</h1>
            <p className="mt-2 text-base text-ink/70">Physics-based carbon estimation using GLEC emission factors — with uncertainty ranges and optional live data enrichment</p>
            {showInfoBanner ? (
              <div className="mt-4 flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900 shadow-sm">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-100 text-xs font-semibold text-sky-700">i</span>
                <p className="flex-1 leading-6">Estimates use the GLEC Framework (ISO 14083-aligned) emission factors. Install the free searoute package and connect Climatiq in your .env for higher-accuracy results.</p>
                <button type="button" onClick={() => setShowInfoBanner(false)} className="rounded-full px-2 py-1 text-base font-semibold text-sky-700 transition hover:bg-sky-100" aria-label="Dismiss information banner">
                  ×
                </button>
              </div>
            ) : null}
            {forecastContext.origin || forecastContext.destination || forecastContext.priority ? (
              <div className="mt-4 flex flex-wrap gap-2 text-xs font-medium text-moss/70">
                <span className="rounded-full bg-limewash px-3 py-1.5 text-moss">Loaded from dashboard</span>
                {forecastContext.origin ? <span className="rounded-full bg-white px-3 py-1.5 text-ink/60 border border-ink/5">Origin: {forecastContext.origin}</span> : null}
                {forecastContext.destination ? <span className="rounded-full bg-white px-3 py-1.5 text-ink/60 border border-ink/5">Destination: {forecastContext.destination}</span> : null}
                {forecastContext.priority ? <span className="rounded-full bg-white px-3 py-1.5 text-ink/60 border border-ink/5">Priority: {forecastContext.priority}</span> : null}
                {forecastContext.mode ? <span className="rounded-full bg-white px-3 py-1.5 text-ink/60 border border-ink/5">Mode: {forecastContext.mode}</span> : null}
              </div>
            ) : null}
          </div>
          <Link href="/" className="inline-flex w-fit rounded-full border border-moss/20 bg-limewash px-5 py-3 text-sm font-semibold text-moss transition hover:-translate-y-0.5">
            Back to dashboard
          </Link>
        </header>

        {error ? (
          <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            <span>{error}</span>
            <button className="font-black" onClick={() => setError(null)} aria-label="Dismiss error">
              ×
            </button>
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
          <form onSubmit={runForecast} className="rounded-[1.5rem] bg-ink p-5 text-white shadow-panel">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-white/50 uppercase tracking-[0.1em]">Forecast builder</p>
                <h2 className="mt-1 text-xl font-semibold">Shipment legs</h2>
              </div>
              <button type="button" onClick={addLeg} className="rounded-full bg-fern px-4 py-2 text-sm font-semibold text-ink transition hover:-translate-y-0.5">
                Add Leg
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              {legs.map((leg, index) => (
                <div key={leg.id} className="rounded-xl border border-white/10 bg-white/10 p-4">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <span className="font-semibold text-white">Leg {index + 1}</span>
                    <button type="button" onClick={() => removeLeg(leg.id)} className="grid h-8 w-8 place-items-center rounded-full bg-white/10 text-lg font-medium text-white/70 transition hover:bg-white/20">
                      ×
                    </button>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="From node" value={leg.from_node} onChange={(value) => updateLeg(leg.id, { from_node: value })} />
                    <Field label="To node" value={leg.to_node} onChange={(value) => updateLeg(leg.id, { to_node: value })} />
                    <label className="grid gap-2 text-sm text-white/70">
                      Mode
                      <select className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-white outline-none focus:border-fern" value={leg.mode} onChange={(event) => updateLeg(leg.id, { mode: event.target.value as Mode })}>
                        {(Object.keys(modeMeta) as Mode[]).map((mode) => (
                          <option className="text-ink" value={mode} key={mode}>
                            {modeMeta[mode].label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <NumberField label="Weight (kg)" value={leg.weight_kg} min={0} onChange={(value) => updateLeg(leg.id, { weight_kg: value })} />
                    <label className="grid gap-2 text-sm text-white/70 md:col-span-2">
                      <span className="flex justify-between">
                        Load %
                        <strong className="text-white">{leg.load_pct}%</strong>
                      </span>
                      <input type="range" min="0" max="100" value={leg.load_pct} onChange={(event) => updateLeg(leg.id, { load_pct: Number(event.target.value) })} />
                    </label>
                    <label className="grid gap-2 text-sm text-white/70">
                      Fuel type
                      <select className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-white outline-none focus:border-fern" value={leg.fuel_type} onChange={(event) => updateLeg(leg.id, { fuel_type: event.target.value })}>
                        {Object.keys(factors[leg.mode] ?? {}).map((fuel) => (
                          <option className="text-ink" value={fuel} key={fuel}>
                            {fuel.replaceAll("_", " ")}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="grid gap-2 text-sm text-white/70">
                      Departure date
                      <input className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-white outline-none focus:border-fern" type="date" value={leg.departure_date} onChange={(event) => updateLeg(leg.id, { departure_date: event.target.value })} />
                    </label>
                    <label className="flex items-center gap-3 text-sm font-bold text-white md:col-span-2">
                      <input type="checkbox" checked={leg.is_reefer} onChange={(event) => updateLeg(leg.id, { is_reefer: event.target.checked })} />
                      Refrigerated container
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <button className="mt-5 w-full rounded-xl bg-fern px-5 py-4 font-semibold text-ink transition hover:-translate-y-0.5" disabled={loading}>
              {loading ? "Forecasting..." : "Run Forecast"}
            </button>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <SummaryPill label="Total legs" value={String(legs.length)} />
              <SummaryPill label="Total weight" value={`${totalWeight.toFixed(2)} kg`} />
            </div>
          </form>

          <section className="rounded-[1.5rem] border border-white/60 bg-white/70 p-5 shadow-panel backdrop-blur">
            {forecast ? (
              <div>
                <div className="grid gap-3 md:grid-cols-3">
                  <MetricCard label="Expected Emissions" value={formatKg(forecast.total_nominal_kg)} className="text-moss" />
                  <MetricCard label="Best Case" value={formatKg(forecast.total_low_kg)} className="text-harbor" />
                  <MetricCard label="Worst Case" value={formatKg(forecast.total_high_kg)} className="text-clay" />
                </div>

                <div className="mt-5 rounded-xl bg-gradient-to-r from-white/30 to-white/10 border border-ink/5 p-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <h3 className="text-sm font-semibold text-ink">
                      Forecast Confidence: <span className="capitalize">{forecast.overall_confidence === "low" ? "Limited" : forecast.overall_confidence === "medium" ? "Moderate" : "High"}</span>
                    </h3>
                    <button
                      type="button"
                      className="text-xs font-medium text-ink/50 hover:text-ink/70 transition"
                      aria-expanded={confidencePopoverOpen}
                      onMouseEnter={() => setConfidencePopoverOpen(true)}
                      onMouseLeave={() => setConfidencePopoverOpen(false)}
                      onFocus={() => setConfidencePopoverOpen(true)}
                      onBlur={() => setConfidencePopoverOpen(false)}
                      onClick={() => setConfidencePopoverOpen((current) => !current)}
                    >
                      {confidencePopoverOpen ? "Hide details" : "Show details"}
                    </button>
                  </div>
                  
                  {confidenceDetails.drivers.length > 0 ? (
                    <p className="text-sm text-ink/60 leading-6">
                      {confidenceDetails.drivers.map((d) => d.reason).join("; ")}
                    </p>
                  ) : (
                    <p className="text-sm text-ink/60 leading-6">Estimates use verified routing and emission factors.</p>
                  )}

                  {confidencePopoverOpen ? (
                    <div className="mt-4 pt-4 border-t border-ink/10">
                      {confidenceDetails.drivers.length > 0 && (
                        <div className="mb-4">
                          <p className="text-xs font-semibold text-ink/70 uppercase tracking-[0.08em] mb-2">Factors affecting confidence</p>
                          <div className="space-y-2">
                            {confidenceDetails.drivers.map((driver) => (
                              <div key={driver.legLabel} className="text-sm text-ink/60">
                                <p className="font-medium">{driver.legLabel}</p>
                                <p className="text-ink/50 text-xs mt-0.5">{driver.reason}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <p className="text-xs font-semibold text-ink/70 uppercase tracking-[0.08em] mb-2">How to improve precision</p>
                        <ul className="space-y-2">
                          {confidenceDetails.checklist.map((item) => (
                            <li key={item.label} className="flex gap-2 text-xs">
                              <span className={`shrink-0 mt-1 ${item.done ? "text-fern" : "text-ink/30"}`}>{item.done ? "✓" : "○"}</span>
                              <div className="flex-1">
                                <p className={`${item.done ? "text-ink/60" : "text-ink/60"}`}>{item.label}</p>
                                <p className="text-ink/40 text-[11px] mt-0.5">{item.note}</p>
                              </div>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div className="mt-5 grid gap-4">
                  {forecast.legs.map((leg, index) => (
                    <LegCard leg={leg} key={`${leg.from_node}-${leg.to_node}-${index}`} showLegend={index === 0} />
                  ))}
                </div>

                <div className="mt-6">
                  <button
                    type="button"
                    onClick={() => setDataSourcesExpanded(!dataSourcesExpanded)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-white/40 to-white/10 border border-ink/5 px-4 py-4 hover:bg-white/20 transition"
                  >
                    <div className="text-left">
                      <h3 className="font-semibold text-ink">Data Sources & Methodology</h3>
                      <p className="text-xs text-ink/50 mt-1">Forecast provenance and fallback systems</p>
                    </div>
                    <span className={`shrink-0 text-ink/50 transition-transform ${dataSourcesExpanded ? "rotate-180" : ""}`}>
                      ▼
                    </span>
                  </button>

                  {dataSourcesExpanded && (
                    <div className="mt-3 space-y-2 rounded-xl bg-white/40 border border-ink/5 p-4">
                      {dataSourceRows.map((row, idx) => (
                        <div key={row.sourceName} className="rounded-lg bg-white/60 px-3 py-3 border border-ink/5">
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div>
                              <p className="font-medium text-sm text-ink">{row.sourceName}</p>
                              <p className="text-xs text-ink/55 mt-1">{row.usedFor}</p>
                            </div>
                            <span className={`shrink-0 text-xs font-medium px-2 py-1 rounded-full whitespace-nowrap ${
                              row.status === "Active"
                                ? "bg-emerald-100/60 text-emerald-700"
                                : row.status === "Fallback"
                                  ? "bg-amber-100/60 text-amber-700"
                                  : "bg-stone-100/80 text-ink/50"
                            }`}>
                              {row.status}
                            </span>
                          </div>
                          <p className="text-xs text-ink/60">{row.note}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid min-h-[520px] place-items-center text-center">
                <div>
                  <svg className="mx-auto h-36 w-36" viewBox="0 0 160 160" role="img" aria-label="Forecast illustration">
                    <circle cx="80" cy="80" r="68" fill="#eff7db" />
                    <path d="M36 106c22-36 50-46 88-30" fill="none" stroke="#315c3f" strokeWidth="10" strokeLinecap="round" />
                    <path d="M50 92h42l18-28 14 46" fill="none" stroke="#193f4c" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="48" cy="108" r="9" fill="#c46f3d" />
                    <circle cx="112" cy="76" r="9" fill="#7aaa65" />
                  </svg>
                  <p className="mt-5 text-xl font-black text-ink">Add legs above and run your forecast</p>
                </div>
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm text-white/70">
      {label}
      <input className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-white outline-none focus:border-fern" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function NumberField({ label, value, min, onChange }: { label: string; value: number; min: number; onChange: (value: number) => void }) {
  return (
    <label className="grid gap-2 text-sm text-white/70">
      {label}
      <input className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-white outline-none focus:border-fern" type="number" min={min} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

function SummaryPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3">
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 font-semibold text-white">{value}</p>
    </div>
  );
}

function MetricCard({ label, value, className }: { label: string; value: string; className: string }) {
  return (
    <div className="rounded-xl bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-[0.08em] text-ink/40">{label}</p>
      <p className={`mt-2 text-2xl font-semibold ${className}`}>{value}</p>
    </div>
  );
}

function LegCard({ leg, showLegend = false }: { leg: LegForecast; showLegend?: boolean }) {
  const span = Math.max(leg.emissions_high_kg - leg.emissions_low_kg, 1);
  const nominalPercent = Math.min(100, Math.max(0, ((leg.emissions_nominal_kg - leg.emissions_low_kg) / span) * 100));
  const mode = leg.mode as Mode;
  const meta = getModeMeta(mode);

  return (
    <article className={`rounded-xl bg-white p-4 shadow-sm border ${leg.confidence === "low" ? "border-amber-200 bg-amber-50/30" : "border-ink/5"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-ink">
            <span className="mr-2">{meta.emoji}</span>
            {leg.from_node} → {leg.to_node}
          </h3>
          <p className={`mt-1 text-sm ${getDistanceSourceTone(leg.distance_source)}`}>
            {leg.distance_km.toFixed(2)} km <span className="capitalize">(via {getDistanceSourceLabel(leg.distance_source)})</span>
          </p>
        </div>
      </div>

      <div className="mt-4">
        {showLegend ? <p className="mb-2 text-[11px] font-medium tracking-[0.08em] text-ink/40">◀ Best case ——— Expected ——— Worst case ▶</p> : null}
        <div className="relative h-4 rounded-full bg-harbor/10">
          <div className="absolute inset-y-0 left-0 right-0 rounded-full bg-gradient-to-r from-harbor via-fern to-clay" />
          <span className="absolute -top-px -bottom-px z-[1] w-[4px] -translate-y-0 rounded-full border border-ink bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.5)]" style={{ left: `calc(${nominalPercent}% - 2px)` }} />
        </div>
        <div className="mt-2 flex justify-between text-xs font-medium text-ink/50">
          <span>{formatKg(leg.emissions_low_kg)}</span>
          <span>{formatKg(leg.emissions_nominal_kg)}</span>
          <span>{formatKg(leg.emissions_high_kg)}</span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {leg.corrections_applied.length > 0 ? (
          leg.corrections_applied.map((correction) => (
            <span key={correction} className="rounded-full bg-limewash px-3 py-1 text-xs font-medium text-moss">
              {correction}
            </span>
          ))
        ) : (
          <span className="rounded-full bg-ink/5 px-3 py-1 text-xs font-medium text-ink/40">no corrections</span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-ink/50">
        <span>via {leg.emission_factor_source === "climatiq" ? "Climatiq" : "GLEC local"}</span>
        {leg.weather_context ? (
          <span className="rounded-full bg-harbor/10 px-3 py-1 font-medium text-harbor/70">
            {Number(leg.weather_context.wind_speed_ms ?? 0).toFixed(2)} m/s · {Number(leg.weather_context.temp_c ?? 0).toFixed(2)}°C
          </span>
        ) : null}
      </div>
    </article>
  );
}
