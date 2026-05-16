from fastapi.testclient import TestClient

from app.main import app


def test_dev_frontend_origins_are_allowed_for_preflight() -> None:
    client = TestClient(app)

    for origin in ("http://localhost:3000", "http://127.0.0.1:3000"):
        response = client.options(
            "/optimize-route",
            headers={
                "Origin": origin,
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin
