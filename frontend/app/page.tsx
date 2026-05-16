"use client";

import { FormEvent, useEffect, useState } from "react";
import { API_BASE_URL, Analytics, OptimizeResponse, RouteOption, getJSON, postJSON } from "../lib/api";
import CarbonPriceCalculator from "../components/CarbonPriceCalculator.jsx";
import RouteMap from "../components/RouteMap.jsx";

const priorities = [
  { value: "balanced", label: "Balanced" },
  { value: "carbon_first", label: "Carbon first" },
  { value: "express", label: "Express" },
  { value: "low_cost", label: "Low cost" },
  { value: "low_risk", label: "Low risk" }
];

const defaultDemo = {
  origin: "Chennai",
  destination: "Tokyo",
  weightKg: 1200,
  priority: "balanced"
};

const modeStyle: Record<string, string> = {
  sea: "bg-harbor text-white",
  rail: "bg-moss text-white",
  truck: "bg-clay text-white",
  air: "bg-ink text-white"
};

function adjustedCost(option: RouteOption, carbonPrice: number) {
  return option.total_cost_usd + (option.total_emissions_kg / 1000) * carbonPrice;
}

export default function DashboardPage() {
  const [origin, setOrigin] = useState(defaultDemo.origin);
  const [destination, setDestination] = useState(defaultDemo.destination);
  const [weightKg, setWeightKg] = useState(defaultDemo.weightKg);
  const [priority, setPriority] = useState(defaultDemo.priority);
  const [optimization, setOptimization] = useState<OptimizeResponse | null>(null);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [passportUrl, setPassportUrl] = useState<string | null>(null);
  const [carbonPrice, setCarbonPrice] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const loadInitialRoute = async () => {
      setLoading(true);
      try {
        const result = await postJSON<OptimizeResponse, unknown>("/optimize-route", {
          origin: defaultDemo.origin,
          destination: defaultDemo.destination,
          weight_kg: defaultDemo.weightKg,
          priority: defaultDemo.priority
        });
        setOptimization(result);
        setSelectedRoute(result.recommendation);
        setCarbonPrice(0);
      } catch (error) {
        setError(error instanceof Error ? error.message : "Route optimization failed");
      } finally {
        setLoading(false);
      }
    };

    void loadInitialRoute();
  }, []);

  async function runOptimization(event?: FormEvent) {
    event?.preventDefault();
    setLoading(true);
    setError(null);
    setPassportUrl(null);
    setCarbonPrice(0);
    try {
      const result = await postJSON<OptimizeResponse, unknown>("/optimize-route", {
        origin,
        destination,
        weight_kg: weightKg,
        priority
      });
      setOptimization(result);
      setSelectedRoute(result.recommendation);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Route optimization failed");
    } finally {
      setLoading(false);
    }
  }

  async function createShipment() {
    setLoading(true);
    setError(null);
    try {
      const shipment = await postJSON<{ shipment_id: string; passport_url: string }, unknown>("/shipments/create", {
        origin,
        destination,
        weight_kg: weightKg,
        priority
      });
      setPassportUrl(`/passport/${shipment.shipment_id}`);
      const scope3 = await getJSON<Analytics>("/analytics/scope3");
      setAnalytics(scope3);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Shipment creation failed");
    } finally {
      setLoading(false);
    }
  }

  const route = selectedRoute ?? optimization?.recommendation ?? null;
  const lowestCarbonAdjustedRouteId =
    carbonPrice > 0 && optimization && optimization.route_options.length > 0
      ? optimization.route_options.reduce((best, option) => {
          return adjustedCost(option, carbonPrice) < adjustedCost(best, carbonPrice) ? option : best;
        }, optimization.route_options[0])?.route_id
      : null;

  return (
    <main className="relative min-h-screen overflow-hidden px-5 py-6 md:px-10">
      <div className="grain" />
      <section className="relative mx-auto max-w-7xl">
        <header className="grid gap-6 rounded-[2rem] border border-white/50 bg-white/55 p-6 shadow-panel backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-9">
          <div>
            <p className="mb-4 inline-flex rounded-full border border-moss/20 bg-limewash px-4 py-2 text-sm font-semibold text-moss">
              Scope 3 logistics intelligence
            </p>
            <h1 className="display max-w-4xl text-5xl font-black leading-[0.93] text-ink md:text-7xl">
              Carbon Passport AI for multimodal freight decisions.
            </h1>
            <p className="mt-5 max-w-2xl text-lg leading-8 text-ink/70">
              Compare shipment routes by carbon, cost, time, and risk. Generate a verifiable digital passport for every logistics decision.
            </p>
          </div>

          <form onSubmit={runOptimization} className="rounded-[1.5rem] bg-ink p-5 text-white shadow-2xl">
            <div className="grid gap-3">
              <Field label="Origin" value={origin} onChange={setOrigin} />
              <Field label="Destination" value={destination} onChange={setDestination} />
              <label className="grid gap-2 text-sm text-white/70">
                Weight kg
                <input
                  className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none focus:border-fern"
                  type="number"
                  min="1"
                  value={weightKg}
                  onChange={(event) => setWeightKg(Number(event.target.value))}
                />
              </label>
              <label className="grid gap-2 text-sm text-white/70">
                Priority
                <select
                  className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none focus:border-fern"
                  value={priority}
                  onChange={(event) => setPriority(event.target.value)}
                >
                  {priorities.map((item) => (
                    <option className="text-ink" key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </select>
              </label>
              <button className="rounded-2xl bg-fern px-5 py-3 font-bold text-ink transition hover:translate-y-[-1px]" disabled={loading}>
                {loading ? "Optimizing..." : "Optimize route"}
              </button>
            </div>
          </form>
        </header>

        {error ? <div className="mt-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{error}</div> : null}

        {route ? (
          <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="rounded-[2rem] bg-white/70 p-6 shadow-panel backdrop-blur">
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-moss">Recommended route</p>
              <h2 className="display mt-2 text-4xl font-black capitalize text-ink">{route.strategy.replaceAll("_", " ")}</h2>
              <p className="mt-4 text-ink/70">{route.explanation}</p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                <Metric label="CO2e" value={`${route.total_emissions_kg.toFixed(1)} kg`} />
                <Metric label="Cost" value={`$${route.total_cost_usd.toLocaleString()}`} />
                <Metric label="Time" value={`${route.total_time_hr.toFixed(1)} hr`} />
                <Metric label="Carbon saved" value={`${route.carbon_saving_percent.toFixed(1)}%`} />
              </div>

              <button
                className="mt-6 w-full rounded-2xl bg-ink px-5 py-4 font-bold text-white transition hover:translate-y-[-1px]"
                onClick={createShipment}
                disabled={loading}
              >
                Create shipment passport
              </button>
              {passportUrl ? (
                <a className="mt-3 block rounded-2xl bg-limewash px-5 py-4 text-center font-bold text-moss" href={passportUrl}>
                  Open passport
                </a>
              ) : null}
            </div>

            <div className="rounded-[2rem] border border-white/50 bg-harbor p-6 text-white shadow-panel">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-bold uppercase tracking-[0.22em] text-white/55">Route map</p>
                  <h3 className="display mt-1 text-4xl font-black">Journey graph</h3>
                </div>
                <span className="rounded-full bg-white/10 px-4 py-2 text-sm">{route.legs.length} legs</span>
              </div>
              <RouteMap legs={route.legs} totalCO2e={route.total_emissions_kg} />
              <div className="relative mt-4 overflow-hidden rounded-[1.5rem] bg-white/10 p-5">
                <div className="relative grid gap-4">
                  {route.legs.map((leg, index) => (
                    <div key={`${leg.from_node}-${leg.to_node}-${index}`} className="grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-2xl bg-white/90 p-3 text-ink">
                      <span className={`rounded-full px-3 py-1 text-xs font-bold ${modeStyle[leg.mode]}`}>{leg.mode}</span>
                      <div>
                        <p className="font-bold">{leg.from_name} to {leg.to_name}</p>
                        <p className="text-sm text-ink/60">{leg.distance_km.toLocaleString()} km, {leg.emissions_kg.toFixed(1)} kg CO2e</p>
                      </div>
                      <span className="text-sm font-bold">{leg.travel_time_hr.toFixed(1)} hr</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        {optimization ? (
          <CarbonPriceCalculator
            routes={optimization.route_options}
            recommendedRoute={optimization.recommendation}
            carbonPrice={carbonPrice}
            onCarbonPriceChange={setCarbonPrice}
          />
        ) : null}

        {optimization ? (
          <section className="mt-6">
            <div className="mb-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-bold uppercase tracking-[0.22em] text-moss">Pareto-style options</p>
                <h2 className="display text-4xl font-black">Tradeoff routes</h2>
              </div>
              <p className="hidden text-sm text-ink/60 md:block">API base: {API_BASE_URL}</p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {optimization.route_options.map((option) => (
                <button
                  key={`${option.route_id}-${option.strategy}`}
                  onClick={() => setSelectedRoute(option)}
                  className={`rounded-[1.5rem] border p-5 text-left transition hover:translate-y-[-2px] ${
                    selectedRoute?.route_id === option.route_id
                      ? "border-moss bg-white shadow-panel"
                      : "border-white/60 bg-white/55 backdrop-blur"
                  } ${carbonPrice > 0 && lowestCarbonAdjustedRouteId === option.route_id ? "border-l-[3px] border-l-[#5DCAA5]" : ""}`}
                >
                  <p className="text-sm font-bold uppercase tracking-[0.18em] text-moss">{option.strategy.replaceAll("_", " ")}</p>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <span>{option.total_emissions_kg.toFixed(1)} kg CO2e</span>
                    <span>
                      ${option.total_cost_usd.toLocaleString()}
                      {carbonPrice > 0 ? (
                        <span className="mt-1 block text-[13px] text-ink/50">
                          incl. carbon tax: ${Math.round(adjustedCost(option, carbonPrice)).toLocaleString()}
                        </span>
                      ) : null}
                    </span>
                    <span>{option.total_time_hr.toFixed(1)} hr</span>
                    <span>Risk {(option.average_risk * 100).toFixed(0)}%</span>
                  </div>
                  <p className="mt-4 text-sm text-ink/60">{option.tradeoffs.join(". ")}.</p>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {analytics ? (
          <section className="mt-6 rounded-[2rem] bg-ink p-6 text-white">
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-white/50">Scope 3 snapshot</p>
            <div className="mt-4 grid gap-3 md:grid-cols-4">
              <Metric dark label="Shipments" value={analytics.shipment_count.toString()} />
              <Metric dark label="Total CO2e" value={`${analytics.total_emissions_kg.toFixed(1)} kg`} />
              <Metric dark label="Distance" value={`${analytics.total_distance_km.toFixed(0)} km`} />
              <Metric dark label="Avg per shipment" value={`${analytics.average_emissions_per_shipment_kg.toFixed(1)} kg`} />
            </div>
          </section>
        ) : null}
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-2 text-sm text-white/70">
      {label}
      <input
        className="rounded-2xl border border-white/10 bg-white/10 px-4 py-3 text-white outline-none focus:border-fern"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}

function Metric({ label, value, dark = false }: { label: string; value: string; dark?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 ${dark ? "bg-white/10" : "bg-limewash"}`}>
      <p className={`text-xs font-bold uppercase tracking-[0.18em] ${dark ? "text-white/50" : "text-moss/70"}`}>{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}
