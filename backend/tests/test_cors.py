from app.main import DEFAULT_CORS_ORIGINS, cors_origins


def test_default_dev_frontend_origins_are_allowed(monkeypatch) -> None:
    monkeypatch.delenv("CORS_ALLOW_ORIGINS", raising=False)

    origins = cors_origins()

    assert "http://localhost:3000" in origins
    assert "http://127.0.0.1:3000" in origins
    assert origins == DEFAULT_CORS_ORIGINS


def test_configured_cors_origins_are_trimmed(monkeypatch) -> None:
    monkeypatch.setenv("CORS_ALLOW_ORIGINS", " http://localhost:3000, http://127.0.0.1:3001,, ")

    assert cors_origins() == ["http://localhost:3000", "http://127.0.0.1:3001"]
