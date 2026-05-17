"use client";

const referencePoints = [
  { value: 0, label: "$0", detail: "No pricing", left: "0%" },
  { value: 30, label: "$30", detail: "Current voluntary", left: "15%" },
  { value: 85, label: "$85", detail: "EU CBAM 2026 est.", left: "42.5%" },
  { value: 150, label: "$150", detail: "Net-zero target", left: "75%" }
];

function adjustedCost(route, carbonPrice) {
  if (!route) {
    return 0;
  }

  return route.total_cost_usd + (route.total_emissions_kg / 1000) * carbonPrice;
}

function formatCurrency(value) {
  return `$${Math.round(value).toLocaleString()}`;
}

function findExpressRoute(routes) {
  return routes.find((route) => route.strategy.toLowerCase().includes("express")) ?? routes[0] ?? null;
}

export default function CarbonPriceCalculator({ routes, recommendedRoute, carbonPrice, onCarbonPriceChange }) {
  const routeOptions = routes ?? [];
  const expressRoute = findExpressRoute(routeOptions);
  const paretoTrueCost = adjustedCost(recommendedRoute, carbonPrice);
  const expressTrueCost = adjustedCost(expressRoute, carbonPrice);
  const premium = expressTrueCost - paretoTrueCost;
  const savings = Math.abs(premium);
  const fillPercent = (carbonPrice / 200) * 100;
  const premiumIsPositive = premium > 0;

  const contextText =
    carbonPrice === 0
      ? "No carbon pricing active. Routes ranked by freight cost only."
      : carbonPrice < 50
        ? `At $${carbonPrice}/tonne, the green route saves ${formatCurrency(savings)} over Express.`
        : carbonPrice < 100
          ? `EU CBAM territory. Green route now ${formatCurrency(savings)} cheaper than Express including tax.`
          : `At this price, choosing air freight costs ${formatCurrency(savings)} more than sea. The green route wins on every metric.`;

  return (
    <section className="mt-6 rounded-[2rem] bg-mist p-6 shadow-panel backdrop-blur">
      <div>
        <p className="section-label text-moss">Carbon price simulator</p>
        <h2 className="dashboard-title mt-2 text-ink md:text-[3.25rem]">True-cost lens</h2>
        <p className="body-copy mt-2 text-sm text-ink/65">Adjust the carbon tax rate to see true total cost across all routes</p>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[3fr_2fr]">
        <div className="rounded-[1.5rem] bg-white/60 p-5">
          <label htmlFor="carbon-price" className="metric-md text-ink">
            Carbon price: ${carbonPrice} / tonne CO2e
          </label>
          <div className="relative mt-6 pb-14">
            <input
              id="carbon-price"
              aria-label="Carbon price per tonne in USD"
              type="range"
              min="0"
              max="200"
              step="1"
              value={carbonPrice}
              onChange={(event) => onCarbonPriceChange(Number(event.target.value))}
              className="carbon-range w-full"
              style={{ "--carbon-fill": `${fillPercent}%` }}
            />
            <div className="absolute left-0 right-0 top-8 h-11">
              {referencePoints.map((point) => {
                const isActive = Math.abs(carbonPrice - point.value) <= 3;

                return (
                  <div
                    key={point.value}
                    className="absolute top-0 flex -translate-x-1/2 flex-col items-center text-center first:translate-x-0"
                    style={{ left: point.left }}
                  >
                    <span className={`h-3 w-px ${isActive ? "bg-fern" : "bg-ink/25"}`} />
                    <span className={`mt-2 text-xs numeric ${isActive ? "font-semibold text-fern" : "font-medium text-ink/55"}`}>
                      {point.label}
                    </span>
                    <span className={`text-[11px] leading-tight ${isActive ? "font-semibold text-fern" : "text-ink/45"}`}>{point.detail}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <SummaryMetric label="Pareto tradeoff total" title="Best route true cost" value={formatCurrency(paretoTrueCost)} />
          <SummaryMetric label="Express total" title="Express route true cost" value={formatCurrency(expressTrueCost)} />
          <SummaryMetric
            label="Green savings"
            title="Carbon tax premium"
            value={formatCurrency(premium)}
            tone={premiumIsPositive ? "green" : "amber"}
          />
          <p aria-live="polite" className="border-l-4 border-fern py-2 pl-4 text-sm font-semibold leading-6 text-ink/75">
            {contextText}
          </p>
        </div>
      </div>
    </section>
  );
}

function SummaryMetric({ label, title, value, tone = "default" }) {
  const toneClass = tone === "green" ? "bg-[#EAF3DE] text-[#3B6D11]" : tone === "amber" ? "bg-amber-50 text-amber-800" : "bg-limewash text-ink";

  return (
    <div className={`rounded-2xl p-4 ${toneClass}`}>
      <p className="section-label opacity-75">{label}</p>
      <p className="body-copy mt-1 text-sm font-semibold opacity-75">{title}</p>
      <p className="metric-xl numeric mt-2">{value}</p>
    </div>
  );
}
