#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

UNLOCODE_INDEX_URL = "https://unece.org/trade/cefact/UNLOCODE-Download"
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
    if not args.skip_unlocode:
        downloaded["unlocode"] = str(download_unlocode(output_dir))
    if not args.skip_ourairports:
        downloaded["ourairports_airports"] = str(download_file(OURAIRPORTS_AIRPORTS_URL, output_dir / "ourairports_airports.csv"))
        downloaded["ourairports_countries"] = str(download_file(OURAIRPORTS_COUNTRIES_URL, output_dir / "ourairports_countries.csv"))
    if not args.skip_world_port_index:
        downloaded["world_port_index"] = str(download_world_port_index(output_dir / "world_port_index.geojson"))

    print(json.dumps(downloaded, indent=2))


def download_unlocode(output_dir: Path) -> Path:
    html = fetch_text(UNLOCODE_INDEX_URL)
    match = re.search(r'href="([^"]+csv[^"]*zip[^"]*)"', html, flags=re.IGNORECASE)
    if not match:
        match = re.search(r'href="([^"]+UNLOCODE[^"]+CSV[^"]*)"', html, flags=re.IGNORECASE)
    if not match:
        raise RuntimeError("Could not locate the UN/LOCODE CSV download link on the UNECE download page.")
    url = urllib.parse.urljoin(UNLOCODE_INDEX_URL, match.group(1))
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
    with urllib.request.urlopen(url, timeout=60) as response:
        destination.write_bytes(response.read())
    return destination


def fetch_text(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as response:
        return response.read().decode("utf-8", errors="replace")


if __name__ == "__main__":
    main()
