#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import ssl
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

DEFAULT_HEADERS = {
    "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}

UNLOCODE_PUBLICATIONS_URL = "https://unlocode.unece.org/publications/"
OURAIRPORTS_AIRPORTS_URL = "https://davidmegginson.github.io/ourairports-data/airports.csv"
OURAIRPORTS_COUNTRIES_URL = "https://davidmegginson.github.io/ourairports-data/countries.csv"
WPI_QUERY_URL = "https://vcps.nga.mil/nauticalpubs-feature/rest/services/WPI/World_Port_Index_Viewer/MapServer/0/query"


def main() -> None:
    parser = argparse.ArgumentParser(description="Download public logistics datasets into data/raw.")
    parser.add_argument("--output-dir", default="data/raw")
    parser.add_argument("--skip-unlocode", action="store_true")
    parser.add_argument("--skip-ourairports", action="store_true")
    parser.add_argument("--skip-world-port-index", action="store_true")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    downloaded: dict[str, str] = {}
    warnings: dict[str, str] = {}
    if not args.skip_unlocode:
        safe_download(downloaded, warnings, "unlocode", output_dir / "unlocode.zip", lambda: download_unlocode(output_dir))
    if not args.skip_ourairports:
        safe_download(
            downloaded,
            warnings,
            "ourairports_airports",
            output_dir / "ourairports_airports.csv",
            lambda: download_file(OURAIRPORTS_AIRPORTS_URL, output_dir / "ourairports_airports.csv"),
        )
        safe_download(
            downloaded,
            warnings,
            "ourairports_countries",
            output_dir / "ourairports_countries.csv",
            lambda: download_file(OURAIRPORTS_COUNTRIES_URL, output_dir / "ourairports_countries.csv"),
        )
    if not args.skip_world_port_index:
        safe_download(
            downloaded,
            warnings,
            "world_port_index",
            output_dir / "world_port_index.geojson",
            lambda: download_world_port_index(output_dir / "world_port_index.geojson"),
        )

    payload: dict[str, object] = {"downloaded": downloaded}
    if warnings:
        payload["warnings"] = warnings
    print(json.dumps(payload, indent=2))


def download_unlocode(output_dir: Path) -> Path:
    html = fetch_text(UNLOCODE_PUBLICATIONS_URL)
    matches = re.findall(
        r'href="(https://opensource\.unicc\.org[^"]+/jobs/artifacts/[^"]+\?job=package-release)"',
        html,
        flags=re.IGNORECASE,
    )
    if not matches:
        raise RuntimeError("Could not locate the UN/LOCODE release download link on the publications page.")
    preferred = next((url for url in matches if "/main/" not in url), matches[0])
    url = urllib.parse.urljoin(UNLOCODE_PUBLICATIONS_URL, preferred)
    return download_file(url, output_dir / "unlocode.zip")


def download_world_port_index(destination: Path) -> Path:
    params = {
        "where": "1=1",
        "outFields": "*",
        "f": "geojson",
        "returnGeometry": "true",
    }
    url = f"{WPI_QUERY_URL}?{urllib.parse.urlencode(params)}"
    return download_file(url, destination)


def download_file(url: str, destination: Path) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with open_url(url) as response:
        destination.write_bytes(response.read())
    return destination


def fetch_text(url: str) -> str:
    with open_url(url) as response:
        return response.read().decode("utf-8", errors="replace")


def open_url(url: str):
    request = urllib.request.Request(url, headers=DEFAULT_HEADERS)
    last_error: Exception | None = None
    for attempt in range(3):
        for context in (None, ssl._create_unverified_context()):
            try:
                if context is None:
                    return urllib.request.urlopen(request, timeout=60)
                return urllib.request.urlopen(request, timeout=60, context=context)
            except (urllib.error.URLError, ConnectionResetError, TimeoutError, ssl.SSLError) as exc:
                last_error = exc
                if attempt < 2:
                    time.sleep(1.5 * (attempt + 1))
                continue
    if last_error is not None:
        raise last_error
    raise RuntimeError(f"Failed to open URL: {url}")


def safe_download(
    downloaded: dict[str, str],
    warnings: dict[str, str],
    key: str,
    destination: Path,
    action,
) -> None:
    try:
        downloaded[key] = str(action())
    except Exception as exc:
        if destination.exists() and destination.stat().st_size > 0:
            downloaded[key] = str(destination)
            warnings[key] = f"using existing file after refresh failed: {exc}"
            return
        warnings[key] = f"download failed: {exc}"


if __name__ == "__main__":
    main()
