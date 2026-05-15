CREATE TABLE nodes (
    node_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    country TEXT NOT NULL
);

CREATE TABLE edges (
    edge_id SERIAL PRIMARY KEY,
    source_node TEXT NOT NULL REFERENCES nodes(node_id),
    target_node TEXT NOT NULL REFERENCES nodes(node_id),
    mode TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    travel_time_hr DOUBLE PRECISION NOT NULL,
    cost_usd DOUBLE PRECISION NOT NULL,
    co2e_kg DOUBLE PRECISION NOT NULL,
    reliability DOUBLE PRECISION NOT NULL,
    risk DOUBLE PRECISION NOT NULL
);

CREATE TABLE shipments (
    shipment_id TEXT PRIMARY KEY,
    origin TEXT NOT NULL REFERENCES nodes(node_id),
    destination TEXT NOT NULL REFERENCES nodes(node_id),
    weight_kg DOUBLE PRECISION NOT NULL,
    priority TEXT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipment_legs (
    leg_id SERIAL PRIMARY KEY,
    shipment_id TEXT NOT NULL REFERENCES shipments(shipment_id),
    from_node TEXT NOT NULL REFERENCES nodes(node_id),
    to_node TEXT NOT NULL REFERENCES nodes(node_id),
    mode TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    emissions_kg DOUBLE PRECISION NOT NULL,
    timestamp TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shipment_ledger (
    ledger_id SERIAL PRIMARY KEY,
    shipment_id TEXT NOT NULL REFERENCES shipments(shipment_id),
    leg_index INTEGER NOT NULL,
    payload_hash TEXT NOT NULL,
    previous_hash TEXT NOT NULL,
    entry_hash TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

