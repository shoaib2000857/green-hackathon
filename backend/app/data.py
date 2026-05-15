from __future__ import annotations

from .schemas import Edge, Node, TransportMode


NODES: list[Node] = [
    Node(node_id="INMAA_PORT", name="Chennai Port", type="port", latitude=13.095, longitude=80.309, country="India"),
    Node(node_id="INMAA_AIR", name="Chennai Air Cargo", type="airport", latitude=12.994, longitude=80.170, country="India"),
    Node(node_id="INBLR_AIR", name="Bengaluru Air Cargo", type="airport", latitude=13.198, longitude=77.706, country="India"),
    Node(node_id="INDEL_RAIL", name="Delhi Rail Logistics Hub", type="rail", latitude=28.644, longitude=77.216, country="India"),
    Node(node_id="INNSA_PORT", name="Nhava Sheva Port", type="port", latitude=18.949, longitude=72.952, country="India"),
    Node(node_id="LKCMB_PORT", name="Colombo Port", type="port", latitude=6.948, longitude=79.844, country="Sri Lanka"),
    Node(node_id="SGSIN_PORT", name="Port of Singapore", type="port", latitude=1.265, longitude=103.820, country="Singapore"),
    Node(node_id="SGSIN_AIR", name="Changi Air Cargo", type="airport", latitude=1.364, longitude=103.991, country="Singapore"),
    Node(node_id="MYKUL_RAIL", name="Kuala Lumpur Inland Terminal", type="rail", latitude=3.139, longitude=101.687, country="Malaysia"),
    Node(node_id="THBKK_HUB", name="Bangkok Logistics Hub", type="inland_terminal", latitude=13.756, longitude=100.501, country="Thailand"),
    Node(node_id="VNSGN_PORT", name="Ho Chi Minh Port", type="port", latitude=10.776, longitude=106.700, country="Vietnam"),
    Node(node_id="VNHAN_RAIL", name="Hanoi Rail Terminal", type="rail", latitude=21.028, longitude=105.834, country="Vietnam"),
    Node(node_id="JPYOK_PORT", name="Port of Yokohama", type="port", latitude=35.443, longitude=139.638, country="Japan"),
    Node(node_id="JPTYO_AIR", name="Tokyo Air Cargo", type="airport", latitude=35.772, longitude=140.392, country="Japan"),
    Node(node_id="JPTYO_CITY", name="Tokyo Distribution Center", type="warehouse", latitude=35.676, longitude=139.650, country="Japan"),
    Node(node_id="CNSHA_PORT", name="Shanghai Port", type="port", latitude=31.230, longitude=121.473, country="China"),
    Node(node_id="CNHKG_AIR", name="Hong Kong Air Cargo", type="airport", latitude=22.308, longitude=113.918, country="China"),
]


def _edge(
    edge_id: str,
    source: str,
    target: str,
    mode: TransportMode,
    distance_km: float,
    travel_time_hr: float,
    base_cost_usd: float,
    factor: float,
    reliability: float,
    risk: float,
) -> Edge:
    return Edge(
        edge_id=edge_id,
        source_node=source,
        target_node=target,
        mode=mode,
        distance_km=distance_km,
        travel_time_hr=travel_time_hr,
        base_cost_usd=base_cost_usd,
        emission_factor_kg_per_tonne_km=factor,
        reliability=reliability,
        risk=risk,
    )


# Representative hackathon emission factors in kg CO2e per tonne-km.
TRUCK_FACTOR = 0.092
RAIL_FACTOR = 0.024
SEA_FACTOR = 0.014
AIR_FACTOR = 0.602

EDGES: list[Edge] = [
    _edge("E001", "INMAA_PORT", "INMAA_AIR", TransportMode.truck, 24, 1.2, 55, TRUCK_FACTOR, 0.96, 0.05),
    _edge("E002", "INMAA_PORT", "INBLR_AIR", TransportMode.truck, 350, 8.0, 380, TRUCK_FACTOR, 0.91, 0.12),
    _edge("E003", "INMAA_PORT", "INDEL_RAIL", TransportMode.rail, 2180, 52, 760, RAIL_FACTOR, 0.88, 0.16),
    _edge("E004", "INDEL_RAIL", "INNSA_PORT", TransportMode.rail, 1400, 34, 620, RAIL_FACTOR, 0.87, 0.18),
    _edge("E005", "INMAA_PORT", "LKCMB_PORT", TransportMode.sea, 1290, 42, 410, SEA_FACTOR, 0.89, 0.20),
    _edge("E006", "LKCMB_PORT", "SGSIN_PORT", TransportMode.sea, 2750, 82, 780, SEA_FACTOR, 0.86, 0.23),
    _edge("E007", "INMAA_PORT", "SGSIN_PORT", TransportMode.sea, 2920, 92, 920, SEA_FACTOR, 0.90, 0.19),
    _edge("E008", "INNSA_PORT", "SGSIN_PORT", TransportMode.sea, 3940, 124, 1190, SEA_FACTOR, 0.87, 0.22),
    _edge("E009", "INMAA_AIR", "SGSIN_AIR", TransportMode.air, 2920, 5.4, 3920, AIR_FACTOR, 0.94, 0.08),
    _edge("E010", "INBLR_AIR", "SGSIN_AIR", TransportMode.air, 3180, 5.7, 4180, AIR_FACTOR, 0.93, 0.09),
    _edge("E011", "SGSIN_PORT", "SGSIN_AIR", TransportMode.truck, 28, 1.4, 70, TRUCK_FACTOR, 0.97, 0.04),
    _edge("E012", "SGSIN_PORT", "MYKUL_RAIL", TransportMode.rail, 360, 8.5, 260, RAIL_FACTOR, 0.91, 0.11),
    _edge("E013", "MYKUL_RAIL", "THBKK_HUB", TransportMode.rail, 1460, 38, 540, RAIL_FACTOR, 0.84, 0.20),
    _edge("E014", "THBKK_HUB", "VNSGN_PORT", TransportMode.truck, 850, 24, 720, TRUCK_FACTOR, 0.80, 0.28),
    _edge("E015", "SGSIN_PORT", "VNSGN_PORT", TransportMode.sea, 1090, 38, 360, SEA_FACTOR, 0.91, 0.16),
    _edge("E016", "VNSGN_PORT", "VNHAN_RAIL", TransportMode.rail, 1720, 42, 610, RAIL_FACTOR, 0.83, 0.22),
    _edge("E017", "SGSIN_PORT", "JPYOK_PORT", TransportMode.sea, 5320, 162, 1660, SEA_FACTOR, 0.86, 0.24),
    _edge("E018", "VNSGN_PORT", "JPYOK_PORT", TransportMode.sea, 4380, 136, 1440, SEA_FACTOR, 0.84, 0.26),
    _edge("E019", "CNSHA_PORT", "JPYOK_PORT", TransportMode.sea, 1760, 54, 620, SEA_FACTOR, 0.89, 0.18),
    _edge("E020", "SGSIN_PORT", "CNSHA_PORT", TransportMode.sea, 3810, 118, 1240, SEA_FACTOR, 0.85, 0.25),
    _edge("E021", "JPYOK_PORT", "JPTYO_CITY", TransportMode.truck, 36, 1.8, 90, TRUCK_FACTOR, 0.96, 0.06),
    _edge("E022", "JPYOK_PORT", "JPTYO_AIR", TransportMode.truck, 95, 2.8, 140, TRUCK_FACTOR, 0.94, 0.08),
    _edge("E023", "JPTYO_AIR", "JPTYO_CITY", TransportMode.truck, 72, 2.2, 130, TRUCK_FACTOR, 0.95, 0.07),
    _edge("E024", "SGSIN_AIR", "JPTYO_AIR", TransportMode.air, 5310, 7.2, 6820, AIR_FACTOR, 0.93, 0.10),
    _edge("E025", "CNHKG_AIR", "JPTYO_AIR", TransportMode.air, 2900, 4.6, 3840, AIR_FACTOR, 0.92, 0.12),
    _edge("E026", "SGSIN_AIR", "CNHKG_AIR", TransportMode.air, 2580, 4.0, 3260, AIR_FACTOR, 0.91, 0.11),
    _edge("E027", "VNSGN_PORT", "CNHKG_AIR", TransportMode.truck, 1620, 45, 1210, TRUCK_FACTOR, 0.77, 0.31),
]

