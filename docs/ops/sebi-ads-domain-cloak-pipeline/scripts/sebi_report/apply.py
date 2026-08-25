"""Upsert empty Domains frames + bidirectional Ads ↔ Domains links."""

from __future__ import annotations

import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from bson import ObjectId
from pymongo import ASCENDING, UpdateOne
from pymongo.database import Database

PIPELINE_ROOT = Path(
    __import__("os").environ.get(
        "PIPELINE_ROOT",
        "/Users/tempus/Desktop/overwatch/Data_pipeline_test",
    )
)
sys.path.insert(0, str(PIPELINE_ROOT))

from domain_analyzer import DOMAINS_COLLECTION, SCHEMA_VERSION  # noqa: E402


def _now() -> datetime:
    return datetime.now(UTC)


def _as_oid(value: str | ObjectId) -> ObjectId:
    if isinstance(value, ObjectId):
        return value
    return ObjectId(str(value))


def _empty_domain_doc(domain_name: str, url: str, entity_type: str, entity_id: str) -> dict[str, Any]:
    now = _now()
    eid = _as_oid(entity_id) if entity_type == "ad" else entity_id
    occurrence = {
        "entity_type": entity_type,
        "entity_id": eid,
        "url": url,
        "seen_at": now,
    }
    return {
        "schema_version": SCHEMA_VERSION,
        "domain_name": domain_name,
        "discovery": {
            "first_entity_type": entity_type,
            "first_entity_id": eid,
            "first_seen_url": url,
            "occurrences": [occurrence],
        },
        "linked_ad_ids": [eid] if entity_type == "ad" else [],
        "workflow": {
            "analysis_status": "pending",
            "review_status": "pending",
            "client_status": "open",
            "visibility_status": "unknown",
            "takedown_status": "none",
            "alerted_at": None,
        },
        "list": {
            "ai_threat_score": None,
            "review_threat_score": None,
            "effective_threat_score": None,
            "risk_rank": "safe",
            "threat_types": [],
            "violation_flags": [],
            "category": None,
            "registrar": None,
            "hosting_provider": None,
            "hosting_country": None,
            "is_reachable": None,
            "ssl_valid": None,
            "first_seen_at": now,
            "last_seen_at": now,
            "last_analyzed_at": None,
            "reviewed_at": None,
            "occurrence_count": 1,
        },
        "analysis_results": {},
        "ingestion": {
            "type": "sebi_ads_domain_extract",
            "source_url": url,
            "ingested_at": now,
        },
        "system": {"created_at": now, "updated_at": now},
    }


def apply_empty_frames(
    db: Database,
    unique_domains: list[dict[str, Any]],
    *,
    dry_run: bool = False,
) -> dict[str, Any]:
    """
    Upsert Domains empty frames and set Ads.linked_domain_ids / Domains.linked_ad_ids.
    Does not run analysis. Leaves review_status=pending.
    """
    col = db[DOMAINS_COLLECTION]
    # Do not call ensure_domains_indexes — SEBI already has domain_name_unique.
    try:
        col.create_index([("linked_ad_ids", ASCENDING)], name="linked_ad_ids", background=True)
    except Exception:
        pass
    try:
        db["Ads"].create_index([("linked_domain_ids", ASCENDING)], name="linked_domain_ids", background=True)
    except Exception:
        pass
    try:
        col.create_index(
            [("discovery.occurrences.entity_id", ASCENDING)],
            name="occurrence_entity",
            background=True,
        )
    except Exception:
        pass

    inserted = 0
    updated = 0
    ads_linked = 0
    domain_id_by_name: dict[str, ObjectId] = {}

    # Prefetch existing
    names = [u["domain_name"] for u in unique_domains]
    for doc in col.find({"domain_name": {"$in": names}}, {"domain_name": 1, "discovery.occurrences": 1}):
        domain_id_by_name[doc["domain_name"]] = doc["_id"]

    for entry in unique_domains:
        name = entry["domain_name"]
        pairs = entry.get("ad_url_pairs") or []
        if not pairs:
            # fall back: one synthetic pair from sample + first ad
            sample = (entry.get("sample_urls") or [f"https://{name}/"])[0]
            ad_ids = entry.get("ad_ids") or []
            if not ad_ids:
                continue
            pairs = [{"ad_id": ad_ids[0], "url": sample, "source": "link"}]

        first = pairs[0]
        existing_id = domain_id_by_name.get(name)

        if existing_id is None:
            if dry_run:
                inserted += 1
                # placeholder oid for dry-run link accounting
                domain_id_by_name[name] = ObjectId()
            else:
                doc = _empty_domain_doc(
                    name,
                    first["url"],
                    "ad",
                    first["ad_id"],
                )
                all_ad_ids = entry.get("ad_ids") or sorted({p["ad_id"] for p in pairs})
                linked_ads = [_as_oid(a) for a in all_ad_ids]
                occs = []
                seen_occ: set[tuple[str, str]] = set()
                for p in pairs:
                    key = (p["ad_id"], p["url"])
                    if key not in seen_occ:
                        seen_occ.add(key)
                        occs.append(
                            {
                                "entity_type": "ad",
                                "entity_id": _as_oid(p["ad_id"]),
                                "url": p["url"],
                                "seen_at": _now(),
                            }
                        )
                doc["discovery"]["occurrences"] = occs
                doc["discovery"]["first_entity_id"] = _as_oid(first["ad_id"])
                doc["discovery"]["first_seen_url"] = first["url"]
                doc["linked_ad_ids"] = linked_ads
                doc["list"]["occurrence_count"] = len(occs)
                result = col.insert_one(doc)
                domain_id_by_name[name] = result.inserted_id
                inserted += 1
        else:
            # Existing domain — append new occurrences / linked ads (dedupe)
            if dry_run:
                updated += 1
            else:
                existing = col.find_one({"_id": existing_id}) or {}
                existing_occs = (existing.get("discovery") or {}).get("occurrences") or []
                existing_keys = {
                    (str(o.get("entity_id")), str(o.get("url")))
                    for o in existing_occs
                    if isinstance(o, dict)
                }
                new_occs = []
                new_ad_oids = []
                for p in pairs:
                    key = (p["ad_id"], p["url"])
                    if key not in existing_keys:
                        existing_keys.add(key)
                        new_occs.append(
                            {
                                "entity_type": "ad",
                                "entity_id": _as_oid(p["ad_id"]),
                                "url": p["url"],
                                "seen_at": _now(),
                            }
                        )
                    new_ad_oids.append(_as_oid(p["ad_id"]))

                update: dict[str, Any] = {
                    "$set": {
                        "list.last_seen_at": _now(),
                        "system.updated_at": _now(),
                    },
                    "$addToSet": {"linked_ad_ids": {"$each": new_ad_oids}},
                }
                if new_occs:
                    update["$push"] = {"discovery.occurrences": {"$each": new_occs}}
                    update["$inc"] = {"list.occurrence_count": len(new_occs)}
                col.update_one({"_id": existing_id}, update)
                updated += 1

        # Link ads → domain
        domain_oid = domain_id_by_name[name]
        ad_ids = sorted({p["ad_id"] for p in pairs} | set(entry.get("ad_ids") or []))
        if not dry_run and ad_ids:
            ops = [
                UpdateOne(
                    {"_id": ObjectId(aid)},
                    {
                        "$addToSet": {"linked_domain_ids": domain_oid},
                        "$set": {"system.updated_at": _now()},
                    },
                )
                for aid in ad_ids
            ]
            if ops:
                res = db["Ads"].bulk_write(ops, ordered=False)
                ads_linked += res.modified_count + res.upserted_count
        else:
            ads_linked += len(ad_ids)

    return {
        "dry_run": dry_run,
        "db_name": db.name,
        "domains_inserted": inserted,
        "domains_updated": updated,
        "unique_domains": len(unique_domains),
        "ads_link_ops": ads_linked,
        "domain_ids": {k: str(v) for k, v in domain_id_by_name.items()},
    }


def load_unique_domains(path: Path) -> list[dict[str, Any]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and "unique_domains" in data:
        return data["unique_domains"]
    raise ValueError(f"Unexpected extract file shape: {path}")
