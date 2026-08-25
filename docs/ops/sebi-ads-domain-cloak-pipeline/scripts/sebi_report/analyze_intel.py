"""Intel-only analysis batch: reachability + DNS/WHOIS/SSL/hosting (no page content)."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

PIPELINE_ROOT = Path(
    __import__("os").environ.get(
        "PIPELINE_ROOT",
        "/Users/tempus/Desktop/overwatch/Data_pipeline_test",
    )
)
sys.path.insert(0, str(PIPELINE_ROOT))

from domain_analyzer import DOMAINS_COLLECTION  # noqa: E402
from domain_analyzer.pipeline import analyze_one  # noqa: E402
from sebi_report.cloak_tokens import KNOWN_CLOAK_KEYS, KNOWN_CLOAK_PAIRS  # noqa: E402


def _url_has_known_cloak(url: str) -> bool:
    qs = parse_qs(urlparse(url).query, keep_blank_values=True)
    for key, values in qs.items():
        kl = key.lower()
        if kl not in KNOWN_CLOAK_KEYS:
            continue
        for v in values:
            for pk, pv in KNOWN_CLOAK_PAIRS:
                if pk.lower() == kl and v == pv:
                    return True
        # any value on a known cloak key still useful for later probing
        if kl in {"pel8x", "ad_name", "adset_name"}:
            return True
    return False


def pick_probe_url(doc: dict[str, Any]) -> str:
    """Prefer a discovered URL that already carries a cloak-ish query param."""
    discovery = doc.get("discovery") or {}
    candidates: list[str] = []
    first = discovery.get("first_seen_url")
    if isinstance(first, str) and first.strip():
        candidates.append(first.strip())
    for occ in discovery.get("occurrences") or []:
        if isinstance(occ, dict) and isinstance(occ.get("url"), str) and occ["url"].strip():
            candidates.append(occ["url"].strip())
    # Prefer known cloak
    for url in candidates:
        if _url_has_known_cloak(url):
            return url
    if candidates:
        return candidates[0]
    name = doc.get("domain_name") or ""
    return f"https://{name}/" if name else ""


def run_intel_batch(
    db,
    *,
    limit: int | None = None,
    force: bool = True,
    only_pending: bool = True,
) -> dict[str, Any]:
    query: dict[str, Any] = {}
    if only_pending:
        query["workflow.analysis_status"] = {"$in": ["pending", "failed"]}

    cursor = db[DOMAINS_COLLECTION].find(
        query,
        {
            "_id": 1,
            "domain_name": 1,
            "discovery": 1,
            "workflow.analysis_status": 1,
        },
    ).sort([("domain_name", 1)])

    docs = list(cursor)
    if limit is not None:
        docs = docs[:limit]

    results: list[dict[str, Any]] = []
    up = down = failed = skipped = 0

    for i, doc in enumerate(docs, 1):
        url = pick_probe_url(doc)
        name = doc.get("domain_name")
        print(f"[{i}/{len(docs)}] intel-only {name} ← {url[:80]}", flush=True)
        r = analyze_one(
            db,
            url=url,
            object_id=str(doc["_id"]),
            entity_type="ad",
            entity_id=None,
            mode="full",
            intel_only=True,
            no_media=True,
            headless=True,
            dry_run=False,
            force=force,
        )
        results.append(r)
        st = r.get("status")
        if st == "skipped":
            skipped += 1
        elif st == "failed":
            failed += 1
        else:
            # re-read reachability
            fresh = db[DOMAINS_COLLECTION].find_one(
                {"_id": doc["_id"]},
                {"list.is_reachable": 1, "workflow.visibility_status": 1},
            )
            reachable = (fresh or {}).get("list", {}).get("is_reachable")
            if reachable is True:
                up += 1
            elif reachable is False:
                down += 1
            print(
                f"    → {st} score={r.get('ai_threat_score')} "
                f"reachable={reachable} vis={(fresh or {}).get('workflow', {}).get('visibility_status')}",
                flush=True,
            )

    summary = {
        "ok": failed == 0,
        "total": len(docs),
        "analyzed": len(docs) - skipped - failed,
        "up": up,
        "down": down,
        "failed": failed,
        "skipped": skipped,
        "intel_only": True,
        "results": results,
    }
    return summary
