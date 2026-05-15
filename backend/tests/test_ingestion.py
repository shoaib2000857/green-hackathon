from app.data import EDGES, NODES
from app.ingestion import load_runtime_graph, save_graph_artifact


def test_runtime_graph_loads_generated_artifact(tmp_path, monkeypatch) -> None:
    output = tmp_path / "logistics_graph.json"
    save_graph_artifact(
        output,
        [NODES[0], NODES[1]],
        [EDGES[0]],
        {"graph_source": "ingested", "sources": ["test artifact"]},
    )

    monkeypatch.setenv("USE_INGESTED_GRAPH", "true")
    monkeypatch.setenv("LOGISTICS_GRAPH_PATH", str(output))

    nodes, edges, metadata = load_runtime_graph()

    assert metadata["graph_source"] == "ingested"
    assert metadata["artifact_path"] == str(output)
    assert [node.node_id for node in nodes] == ["INMAA_PORT", "INMAA_AIR"]
    assert [edge.edge_id for edge in edges] == ["E001"]


def test_runtime_graph_falls_back_when_artifact_is_missing(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("USE_INGESTED_GRAPH", "true")
    monkeypatch.setenv("LOGISTICS_GRAPH_PATH", str(tmp_path / "missing.json"))

    nodes, edges, metadata = load_runtime_graph()

    assert metadata["graph_source"] == "built_in_seed"
    assert metadata["fallback_reason"] == "missing"
    assert len(nodes) == len(NODES)
    assert len(edges) == len(EDGES)
