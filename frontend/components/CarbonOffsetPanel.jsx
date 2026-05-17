"use client";

import { useMemo, useState } from "react";

const DEFAULT_OFFSET_RATE = 15;
const ANNUAL_TREE_CO2_KG = 21.77;
const CAR_CO2_PER_KM_KG = 0.21;
const SHORT_FLIGHT_CO2_KG = 255;
const SME_LOGISTICS_ANNUAL_FOOTPRINT_KG = 50000;

function formatMoney(value) {
  return Number(value).toFixed(2);
}

function TreesIcon({ className = "h-7 w-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M8 19h8" />
      <path d="M12 16v5" />
      <path d="M7 16a4 4 0 0 1-1.5-7.7 4.5 4.5 0 0 1 8.8-1.1A4.5 4.5 0 0 1 17 16Z" />
      <path d="M17 16a3 3 0 0 0 1.1-5.8 3.4 3.4 0 0 0-6.1-1.7" />
    </svg>
  );
}

function TreeIcon({ className = "h-[18px] w-[18px]" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 13v8" />
      <path d="M9 21h6" />
      <path d="M12 3 7 9h3l-4 5h12l-4-5h3z" />
    </svg>
  );
}

function CarIcon({ className = "h-7 w-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M7 17h10" />
      <path d="M5 17V9l2-4h10l2 4v8" />
      <path d="M5 11h14" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="16.5" cy="17.5" r="1.5" />
    </svg>
  );
}

function PlaneIcon({ className = "h-7 w-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 3 9 10 4 8l-1 2 4 3-4 4 2 2 4-4 3 4 2-1-2-5 7-7a2.1 2.1 0 0 0-3-3Z" />
    </svg>
  );
}

function CheckIcon({ className = "h-7 w-7" }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="m9 12 2 2 4-5" />
    </svg>
  );
}

export default function CarbonOffsetPanel({ totalCO2eKg, passportId, onOffsetConfirmed }) {
  const [offsetRate, setOffsetRate] = useState(DEFAULT_OFFSET_RATE);
  const [confirmed, setConfirmed] = useState(false);
  const roundedCO2e = Number(totalCO2eKg.toFixed(1));
  const treesEquivalent = Math.round(totalCO2eKg / ANNUAL_TREE_CO2_KG);
  const carKm = Math.round(totalCO2eKg / CAR_CO2_PER_KM_KG);
  const flights = (totalCO2eKg / SHORT_FLIGHT_CO2_KG).toFixed(1);
  const offsetCost = (totalCO2eKg / 1000) * offsetRate;
  const visibleTreeCount = Math.min(treesEquivalent, 20);
  const additionalTrees = Math.max(treesEquivalent - visibleTreeCount, 0);
  const footprintPercent = Math.min((totalCO2eKg / SME_LOGISTICS_ANNUAL_FOOTPRINT_KG) * 100, 100);

  const treeIcons = useMemo(() => Array.from({ length: visibleTreeCount }, (_, index) => index), [visibleTreeCount]);

  function confirmOffset() {
    if (confirmed) {
      return;
    }

    setConfirmed(true);
    onOffsetConfirmed({
      passportId,
      totalCO2eKg,
      offsetRate,
      offsetCost
    });
  }

  return (
    <section className="mt-8 rounded-[2rem] bg-mist p-5 shadow-panel">
      <div>
        <p className="section-label text-moss/70">Carbon footprint in perspective</p>
        <p className="body-copy mt-2 text-sm text-ink/70">This shipment emitted {roundedCO2e.toFixed(1)} kg CO2e. Here's what that means:</p>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <EquivalencyCard icon={<TreesIcon />} value={`${treesEquivalent.toLocaleString()} trees`} label="planted for 1 year to offset this shipment" />
        <EquivalencyCard icon={<CarIcon />} value={`${carKm.toLocaleString()} km`} label="driven by an average car" />
        <EquivalencyCard icon={<PlaneIcon />} value={`${flights} short flights`} label="economy class equivalent" />
      </div>

      <div className="mt-6 grid gap-5 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-2xl bg-white/60 p-5">
          <p className="section-label text-moss/70">Offset this shipment</p>
          <p className="metric-xl numeric mt-3 text-ink">Estimated offset cost: ${formatMoney(offsetCost)}</p>
          <p className="mt-1 text-xs text-ink/50">Gold Standard registry rate ~${DEFAULT_OFFSET_RATE}/tonne</p>

          <label className="mt-5 grid gap-2 text-sm font-semibold text-ink/75 numeric">
            Adjust offset rate: ${offsetRate}/tonne CO2e
            <input
              type="range"
              min="10"
              max="50"
              step="1"
              value={offsetRate}
              onChange={(event) => setOffsetRate(Number(event.target.value))}
              className="offset-range w-full"
              style={{ "--offset-fill": `${((offsetRate - 10) / 40) * 100}%` }}
            />
          </label>

          {confirmed ? (
            <div className="carbon-neutral-confirm mt-5 flex items-center justify-center gap-3 rounded-2xl bg-[#EAF3DE] px-5 py-4 text-center font-bold text-[#3B6D11]">
              <CheckIcon />
              <span>Offset confirmed — passport marked Carbon Neutral</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={confirmOffset}
              className="mt-5 w-full rounded-2xl bg-[#1a2e2a] px-5 py-4 font-bold text-white transition hover:translate-y-[-1px]"
            >
              Offset this shipment — ${formatMoney(offsetCost)}
            </button>
          )}

          <p className="mt-3 text-xs leading-5 text-ink/50">
            In a real deployment, this connects to Patch API or Gold Standard registry. For this demo, clicking marks the passport as Carbon Neutral.
          </p>
        </div>

        <div className="rounded-2xl bg-white/60 p-5">
          <p className="section-label text-moss/70">Your impact</p>
          <div className="mt-4 flex flex-wrap gap-1.5 text-[#6b8f3a]">
            {treeIcons.map((index) => (
              <span key={index} className="offset-tree-icon" style={{ animationDelay: `${index * 75}ms` }}>
                <TreeIcon />
              </span>
            ))}
            {additionalTrees > 0 ? <span className="ml-1 self-center text-xs font-semibold text-ink/45 numeric">+{additionalTrees.toLocaleString()} more</span> : null}
          </div>
          <p className="metric-md numeric mt-4 text-ink/55">{treesEquivalent.toLocaleString()} trees sequestering carbon for 1 year</p>

          <div className="mt-5">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-white">
              <div className="h-full rounded-full bg-[#8aab4a]" style={{ width: `${footprintPercent}%` }} />
            </div>
            <p className="mt-2 text-xs text-ink/50">vs. avg. SME logistics company annual footprint</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function EquivalencyCard({ icon, value, label }) {
  return (
    <div className="rounded-2xl bg-white/60 p-4">
      <div className="text-[#6b8f3a]">{icon}</div>
      <p className="metric-xl numeric mt-3 text-ink">{value}</p>
      <p className="body-muted mt-2 text-sm text-ink/55">{label}</p>
    </div>
  );
}
