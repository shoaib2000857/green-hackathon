export const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Mode = "truck" | "rail" | "sea" | "air";

export type RouteLeg = {
  from_node: string;
  from_name: string;
  to_node: string;
  to_name: string;
  mode: Mode;
  distance_km: number;
  travel_time_hr: number;
  cost_usd: number;
  emissions_kg: number;
  risk: number;
  reliability: number;
};

export type RouteOption = {
  route_id: string;
  strategy: string;
  score: number;
  total_distance_km: number;
  total_time_hr: number;
  total_cost_usd: number;
  total_emissions_kg: number;
  average_risk: number;
  carbon_saving_percent: number;
  legs: RouteLeg[];
  explanation: string;
  tradeoffs: string[];
};

export type OptimizeResponse = {
  origin: { node_id: string; name: string; country: string; type: string };
  destination: { node_id: string; name: string; country: string; type: string };
  weight_kg: number;
  recommendation: RouteOption;
  route_options: RouteOption[];
};

export type Shipment = {
  shipment_id: string;
  origin: { name: string; country: string };
  destination: { name: string; country: string };
  weight_kg: number;
  priority: string;
  selected_route: RouteOption;
  created_at: string;
  passport_url: string;
};

export type Passport = {
  shipment: Shipment;
  total_emissions_kg: number;
  total_cost_usd: number;
  total_time_hr: number;
  modes_used: Mode[];
  legs: RouteLeg[];
  ledger: Array<{
    leg_index: number;
    payload_hash: string;
    previous_hash: string;
    entry_hash: string;
    created_at: string;
  }>;
  verification_status: "verified" | "tampered";
  audit_summary: Record<string, string | number | null>;
};

export type Analytics = {
  shipment_count: number;
  total_emissions_kg: number;
  total_distance_km: number;
  emissions_by_mode: Record<string, number>;
  emissions_by_lane: Record<string, number>;
  average_emissions_per_shipment_kg: number;
};

export async function postJSON<TResponse, TBody>(path: string, body: TBody): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<TResponse>;
}

export async function getJSON<TResponse>(path: string): Promise<TResponse> {
  const response = await fetch(`${API_BASE_URL}${path}`, { cache: "no-store" });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed with ${response.status}`);
  }
  return response.json() as Promise<TResponse>;
}

