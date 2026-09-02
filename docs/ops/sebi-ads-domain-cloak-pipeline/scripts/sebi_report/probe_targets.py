"""Build cloak-probe target lists from Domains state."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

PIPELINE_ROOT = Path(
    __import__("os").environ.get(
        "PIPELINE_ROOT",
        "/Users/tempus/Desktop/overwatch/Data_pipeline_test",
    )
)
sys.path.insert(0, str(PIPELINE_ROOT))

from pymongo.database import Database  # noqa: E402

from domain_analyzer import DOMAINS_COLLECTION  # noqa: E402


def probe_target_query(
    *,
    new_only: bool = True,
    retry_not_unlocked: bool = False,
) -> dict[str, Any]:
    """Reachable domains worth probing.

    - new_only: never had cloak_probe
    - retry_not_unlocked: prior probe but unlocked != true (e.g. new tokens)
    """
    or_clauses: list[dict[str, Any]] = []
    if new_only:
        or_clauses.append({"analysis_results.cloak_probe": {"$exists": False}})
    if retry_not_unlocked:
        or_clauses.append(
            {
                "analysis_results.cloak_probe": {"$exists": True},
                "analysis_results.cloak_probe.unlocked": {"$ne": True},
            }
        )
    if not or_clauses:
        or_clauses.append({"analysis_results.cloak_probe": {"$exists": False}})

    return {
        "list.is_reachable": True,
        "$or": or_clauses,
    }


def list_probe_targets(
    db: Database,
    *,
    new_only: bool = True,
    retry_not_unlocked: bool = False,
) -> dict[str, Any]:
    query = probe_target_query(
        new_only=new_only,
        retry_not_unlocked=retry_not_unlocked,
    )
    docs = list(
        db[DOMAINS_COLLECTION]
        .find(
            query,
            {
                "domain_name": 1,
                "analysis_results.cloak_probe": 1,
            },
        )
        .sort([("domain_name", 1)])
    )

    new_no_probe: list[str] = []
    prior_not_unlocked: list[str] = []
    for doc in docs:
        name = doc["domain_name"]
        cp = (doc.get("analysis_results") or {}).get("cloak_probe")
        if cp is None:
            new_no_probe.append(name)
        else:
            prior_not_unlocked.append(name)

    all_names = sorted(set(new_no_probe) | set(prior_not_unlocked))
    return {
        "count": len(all_names),
        "new_no_probe": new_no_probe,
        "prior_not_unlocked": prior_not_unlocked,
        "domains": all_names,
        "query": query,
    }


def write_probe_targets(
    payload: dict[str, Any],
    out_dir: Path,
) -> tuple[Path, Path]:
    out_dir.mkdir(parents=True, exist_ok=True)
    json_path = out_dir / "cloak_probe_targets.json"
    txt_path = out_dir / "cloak_probe_targets.txt"
    json_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")
    txt_path.write_text(",".join(payload.get("domains") or []), encoding="utf-8")
    return json_path, txt_path
