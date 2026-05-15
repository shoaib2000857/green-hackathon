from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any

from .data import EDGES, NODES
from .schemas import Edge, Node

DEFAULT_GRAPH_PATH = Path("data/logistics_graph.json")


def graph_artifact_path() -> Path:
    return Path(os.getenv("LOGISTICS_GRAPH_PATH", str(DEFAULT_GRAPH_PATH)))


def load_runtime_graph() -> tuple[list[Node], list[Edge], dict[str, Any]]:
    if os.getenv("USE_INGESTED_GRAPH", "true").lower() != "true":
        return NODES, EDGES, _fallback_metadata("disabled")

    path = graph_artifact_path()
    if not path.exists():
        return NODES, EDGES, _fallback_metadata("missing")

    try:
        artifact = json.loads(path.read_text(encoding="utf-8"))
        nodes = [Node.model_validate(item) for item in artifact.get("nodes", [])]
        edges = [Edge.model_validate(item) for item in artifact.get("edges", [])]
    except Exception as exc:
        return NODES, EDGES, _fallback_metadata("invalid", str(exc))

    if not nodes or not edges:
        return NODES, EDGES, _fallback_metadata("empty")

    metadata = artifact.get("metadata", {})
    metadata.setdefault("artifact_path", str(path))
    metadata.setdefault("graph_source", "ingested")
    return nodes, edges, metadata


def save_graph_artifact(path: Path, nodes: list[Node], edges: list[Edge], metadata: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "metadata": metadata,
        "nodes": [node.model_dump(mode="json") for node in nodes],
        "edges": [edge.model_dump(mode="json") for edge in edges],
    }
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def _fallback_metadata(reason: str, error: str | None = None) -> dict[str, Any]:
    metadata: dict[str, Any] = {
        "graph_source": "built_in_seed",
        "fallback_reason": reason,
        "artifact_path": str(graph_artifact_path()),
        "node_count": len(NODES),
        "edge_count": len(EDGES),
        "sources": [
            "Built-in demo logistics hubs and lanes",
            "Representative GLEC/Climatiq-style emission factors",
            "Synthetic cost, time, reliability, and risk estimates",
        ],
    }
    if error:
        metadata["error"] = error
    return metadata

