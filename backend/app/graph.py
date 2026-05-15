from __future__ import annotations

from collections import defaultdict

import networkx as nx

from .carbon import calculate_leg_emissions
from .ingestion import load_runtime_graph
from .schemas import Edge, Node, RouteLeg


class LogisticsGraph:
    def __init__(
        self,
        nodes: list[Node],
        edges: list[Edge],
        metadata: dict | None = None,
    ) -> None:
        self.nodes = {node.node_id: node for node in nodes}
        self.edges = edges
        self.metadata = metadata or {}
        self.adjacency: dict[str, list[Edge]] = defaultdict(list)
        self.nx_graph = nx.MultiDiGraph()
        self._build()

    def _build(self) -> None:
        for node in self.nodes.values():
            self.nx_graph.add_node(node.node_id, **node.model_dump())

        for edge in self.edges:
            self.adjacency[edge.source_node].append(edge)
            self.nx_graph.add_edge(
                edge.source_node,
                edge.target_node,
                key=edge.edge_id,
                **edge.model_dump(),
            )

            reverse = edge.model_copy(
                update={
                    "edge_id": f"{edge.edge_id}R",
                    "source_node": edge.target_node,
                    "target_node": edge.source_node,
                }
            )
            self.adjacency[reverse.source_node].append(reverse)
            self.nx_graph.add_edge(
                reverse.source_node,
                reverse.target_node,
                key=reverse.edge_id,
                **reverse.model_dump(),
            )

    def resolve_node(self, query: str) -> Node:
        normalized = query.strip().lower()
        if normalized.upper() in self.nodes:
            return self.nodes[normalized.upper()]

        exact = [node for node in self.nodes.values() if node.name.lower() == normalized]
        if exact:
            return exact[0]

        contains = [
            node
            for node in self.nodes.values()
            if normalized in node.name.lower()
            or normalized in node.country.lower()
            or normalized in node.node_id.lower()
        ]
        if contains:
            return contains[0]

        raise ValueError(f"Unknown logistics node: {query}")

    def enumerate_paths(self, origin: str, destination: str, max_hops: int = 6, max_paths: int = 250) -> list[list[Edge]]:
        paths: list[list[Edge]] = []

        def dfs(current: str, visited: set[str], current_path: list[Edge]) -> None:
            if len(paths) >= max_paths:
                return
            if current == destination:
                paths.append(current_path.copy())
                return
            if len(current_path) >= max_hops:
                return

            for edge in self.adjacency.get(current, []):
                if edge.target_node in visited and edge.target_node != destination:
                    continue
                visited.add(edge.target_node)
                current_path.append(edge)
                dfs(edge.target_node, visited, current_path)
                current_path.pop()
                visited.discard(edge.target_node)

        dfs(origin, {origin}, [])
        return paths

    def edge_to_leg(self, edge: Edge, weight_kg: float) -> RouteLeg:
        source = self.nodes[edge.source_node]
        target = self.nodes[edge.target_node]
        return RouteLeg(
            from_node=edge.source_node,
            from_name=source.name,
            to_node=edge.target_node,
            to_name=target.name,
            mode=edge.mode,
            distance_km=edge.distance_km,
            travel_time_hr=edge.travel_time_hr,
            cost_usd=edge.base_cost_usd,
            emissions_kg=calculate_leg_emissions(edge, weight_kg),
            risk=edge.risk,
            reliability=edge.reliability,
        )


_runtime_nodes, _runtime_edges, _runtime_metadata = load_runtime_graph()
graph = LogisticsGraph(_runtime_nodes, _runtime_edges, _runtime_metadata)
