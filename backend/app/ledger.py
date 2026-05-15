from __future__ import annotations

import hashlib
import json
from datetime import UTC, datetime

from .schemas import LedgerEntry, RouteLeg

GENESIS_HASH = "0" * 64


class HashChainLedger:
    def __init__(self) -> None:
        self._entries: dict[str, list[LedgerEntry]] = {}

    def append_leg(self, shipment_id: str, leg: RouteLeg, timestamp: datetime | None = None) -> LedgerEntry:
        entries = self._entries.setdefault(shipment_id, [])
        previous_hash = entries[-1].entry_hash if entries else GENESIS_HASH
        created_at = timestamp or datetime.now(UTC)
        payload = {
            "shipment_id": shipment_id,
            "leg_index": len(entries) + 1,
            "from_node": leg.from_node,
            "to_node": leg.to_node,
            "mode": leg.mode.value,
            "distance_km": leg.distance_km,
            "emissions_kg": leg.emissions_kg,
            "timestamp": created_at.isoformat(),
        }
        payload_hash = _sha256(payload)
        entry_hash = _sha256({"previous_hash": previous_hash, "payload_hash": payload_hash})
        entry = LedgerEntry(
            leg_index=len(entries) + 1,
            payload_hash=payload_hash,
            previous_hash=previous_hash,
            entry_hash=entry_hash,
            created_at=created_at,
        )
        entries.append(entry)
        return entry

    def entries_for(self, shipment_id: str) -> list[LedgerEntry]:
        return list(self._entries.get(shipment_id, []))

    def verify(self, shipment_id: str) -> bool:
        previous_hash = GENESIS_HASH
        for entry in self._entries.get(shipment_id, []):
            expected = _sha256({"previous_hash": previous_hash, "payload_hash": entry.payload_hash})
            if entry.previous_hash != previous_hash or entry.entry_hash != expected:
                return False
            previous_hash = entry.entry_hash
        return True


def _sha256(payload: object) -> str:
    normalized = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


ledger = HashChainLedger()

