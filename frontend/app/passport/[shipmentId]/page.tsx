"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { API_BASE_URL, Passport, getJSON } from "../../../lib/api";

export default function PassportPage() {
  const params = useParams<{ shipmentId: string }>();
  const [passport, setPassport] = useState<Passport | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!params.shipmentId) {
      return;
    }
    getJSON<Passport>(`/shipments/${params.shipmentId}/passport`)
      .then(setPassport)
      .catch((error) => setError(error instanceof Error ? error.message : "Passport not found"));
  }, [params.shipmentId]);

  if (error) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="rounded-[2rem] bg-white/80 p-8 shadow-panel">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-red-700">Passport error</p>
          <h1 className="display mt-2 text-4xl font-black">Unable to load shipment</h1>
          <p className="mt-4 text-ink/70">{error}</p>
        </div>
      </main>
    );
  }

  if (!passport) {
    return (
      <main className="grid min-h-screen place-items-center p-6">
        <div className="rounded-[2rem] bg-white/80 p-8 shadow-panel">Loading passport...</div>
      </main>
    );
  }

  return (
    <main className="relative min-h-screen px-5 py-6 md:px-10">
      <div className="grain" />
      <section className="relative mx-auto max-w-5xl rounded-[2.4rem] bg-white/72 p-6 shadow-panel backdrop-blur md:p-9">
        <div className="grid gap-6 md:grid-cols-[1fr_auto]">
          <div>
            <p className="text-sm font-bold uppercase tracking-[0.22em] text-moss">Digital carbon passport</p>
            <h1 className="display mt-2 text-5xl font-black md:text-7xl">{passport.shipment.shipment_id}</h1>
            <p className="mt-4 text-lg text-ink/70">
              {passport.shipment.origin.name} to {passport.shipment.destination.name}, {passport.shipment.weight_kg.toLocaleString()} kg freight.
            </p>
          </div>
          <div className="rounded-[1.5rem] bg-limewash p-4 text-center">
            <img
              alt="Shipment passport QR"
              className="h-40 w-40 rounded-2xl bg-white object-contain"
              src={`${API_BASE_URL}/shipments/${passport.shipment.shipment_id}/passport/qr`}
            />
            <p className="mt-3 text-sm font-bold capitalize text-moss">{passport.verification_status}</p>
          </div>
        </div>

        <div className="mt-8 grid gap-3 md:grid-cols-4">
          <Metric label="Total CO2e" value={`${passport.total_emissions_kg.toFixed(1)} kg`} />
          <Metric label="Total cost" value={`$${passport.total_cost_usd.toLocaleString()}`} />
          <Metric label="Transit time" value={`${passport.total_time_hr.toFixed(1)} hr`} />
          <Metric label="Ledger entries" value={`${passport.ledger.length}`} />
        </div>

        <section className="mt-8 rounded-[2rem] bg-ink p-5 text-white">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-bold uppercase tracking-[0.22em] text-white/50">Shipment history</p>
              <h2 className="display mt-1 text-4xl font-black">Verified route legs</h2>
            </div>
            <span className="rounded-full bg-white/10 px-4 py-2 text-sm">{passport.modes_used.join(" + ")}</span>
          </div>
          <div className="mt-5 grid gap-3">
            {passport.legs.map((leg, index) => (
              <div key={`${leg.from_node}-${leg.to_node}-${index}`} className="rounded-2xl bg-white/10 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold">{leg.from_name} to {leg.to_name}</p>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-bold uppercase text-ink">{leg.mode}</span>
                </div>
                <p className="mt-2 text-sm text-white/60">
                  {leg.distance_km.toLocaleString()} km, {leg.travel_time_hr.toFixed(1)} hr, {leg.emissions_kg.toFixed(1)} kg CO2e
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-moss">Tamper-evident audit trail</p>
          <div className="mt-4 grid gap-3">
            {passport.ledger.map((entry) => (
              <div key={entry.entry_hash} className="rounded-2xl border border-ink/10 bg-white/70 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="font-bold">Leg {entry.leg_index}</p>
                  <p className="text-sm text-ink/50">{new Date(entry.created_at).toLocaleString()}</p>
                </div>
                <p className="mt-2 break-all font-mono text-xs text-ink/60">{entry.entry_hash}</p>
              </div>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-limewash p-4">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-moss/70">{label}</p>
      <p className="mt-2 text-2xl font-black">{value}</p>
    </div>
  );
}

