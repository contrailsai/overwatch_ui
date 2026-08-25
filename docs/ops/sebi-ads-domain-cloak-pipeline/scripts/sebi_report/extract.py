"""Extract unique destination domains from Ads (dry-run artifacts only)."""

from __future__ import annotations

import csv
import json
import sys
from collections import defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

PIPELINE_ROOT = Path(
    __import__("os").environ.get(
        "PIPELINE_ROOT",
        "/Users/tempus/Desktop/overwatch/Data_pipeline_test",
    )
)
sys.path.insert(0, str(PIPELINE_ROOT))

from domain_analyzer.identity import (  # noqa: E402
    canonicalize_domain_name,
    is_social_or_tracker_host,
    normalize_url,
)
from sebi_report.skip_hosts import should_skip_domain  # noqa: E402


def iter_ad_urls(ad: dict[str, Any]) -> list[tuple[str, str]]:
    """Return list of (url, source) where source is 'link' or 'card'."""
    out: list[tuple[str, str]] = []
    content = ad.get("content") or {}
    link = content.get("link_url")
    if isinstance(link, str) and link.strip():
        out.append((link.strip(), "link"))
    for card in content.get("cards") or []:
        if not isinstance(card, dict):
            continue
        cu = card.get("link_url")
        if isinstance(cu, str) and cu.strip():
            out.append((cu.strip(), "card"))
    return out


def extract_unique_domains(db) -> dict[str, Any]:
    domains: dict[str, dict[str, Any]] = {}
    skipped: dict[str, dict[str, Any]] = defaultdict(
        lambda: {"count": 0, "reason": None, "sample_urls": [], "ad_ids": set()}
    )
    proposed_links: dict[str, dict[str, Any]] = {}
    ads_scanned = 0
    urls_seen = 0

    cursor = db["Ads"].find(
        {},
        {
            "_id": 1,
            "ad_profile_id": 1,
            "platform_ad_id": 1,
            "content.link_url": 1,
            "content.cards.link_url": 1,
        },
    )

    for ad in cursor:
        ads_scanned += 1
        ad_id = str(ad["_id"])
        profile_id = str(ad["ad_profile_id"]) if ad.get("ad_profile_id") else None
        link_entry = proposed_links.setdefault(
            ad_id,
            {
                "ad_id": ad_id,
                "ad_profile_id": profile_id,
                "platform_ad_id": ad.get("platform_ad_id"),
                "domains": [],
            },
        )
        seen_for_ad: set[str] = set()

        for raw_url, source in iter_ad_urls(ad):
            urls_seen += 1
            norm = normalize_url(raw_url)
            domain_name = canonicalize_domain_name(norm or raw_url)
            skip, reason = should_skip_domain(
                domain_name,
                is_social=is_social_or_tracker_host(norm or raw_url),
            )
            if skip:
                bucket = skipped[domain_name or raw_url]
                bucket["count"] += 1
                bucket["reason"] = reason
                if len(bucket["sample_urls"]) < 3:
                    bucket["sample_urls"].append(norm or raw_url)
                bucket["ad_ids"].add(ad_id)
                continue

            if domain_name not in domains:
                domains[domain_name] = {
                    "domain_name": domain_name,
                    "sample_urls": [],
                    "sources": set(),
                    "ad_ids": set(),
                    "ad_profile_ids": set(),
                    "ad_url_pairs": [],  # for apply: (ad_id, url)
                }
            entry = domains[domain_name]
            entry["sources"].add(source)
            entry["ad_ids"].add(ad_id)
            if profile_id:
                entry["ad_profile_ids"].add(profile_id)
            if norm and norm not in entry["sample_urls"] and len(entry["sample_urls"]) < 5:
                entry["sample_urls"].append(norm)
            if len(entry["ad_url_pairs"]) < 5000:
                entry["ad_url_pairs"].append({"ad_id": ad_id, "url": norm or raw_url, "source": source})

            if domain_name not in seen_for_ad:
                seen_for_ad.add(domain_name)
                link_entry["domains"].append(domain_name)

    # serialize sets
    unique_list = []
    for name in sorted(domains.keys()):
        e = domains[name]
        unique_list.append(
            {
                "domain_name": name,
                "sample_urls": e["sample_urls"],
                "sources": sorted(e["sources"]),
                "ad_count": len(e["ad_ids"]),
                "ad_ids": sorted(e["ad_ids"]),
                "ad_profile_ids": sorted(e["ad_profile_ids"]),
                "ad_url_pairs": e["ad_url_pairs"],
            }
        )

    skipped_list = []
    for name, e in sorted(skipped.items(), key=lambda kv: -kv[1]["count"]):
        skipped_list.append(
            {
                "domain_name": name,
                "reason": e["reason"],
                "count": e["count"],
                "sample_urls": e["sample_urls"],
                "ad_count": len(e["ad_ids"]),
            }
        )

    proposed = [v for v in proposed_links.values() if v["domains"]]

    return {
        "extracted_at": datetime.now(UTC).isoformat(),
        "db_name": db.name,
        "ads_scanned": ads_scanned,
        "urls_seen": urls_seen,
        "unique_domain_count": len(unique_list),
        "skipped_host_count": len(skipped_list),
        "unique_domains": unique_list,
        "skipped": skipped_list,
        "proposed_links": proposed,
    }


def write_extract_artifacts(payload: dict[str, Any], out_dir: Path) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)

    unique = payload["unique_domains"]
    # JSON without huge ad_url_pairs for human review file; keep full for apply
    summary_unique = [
        {
            "domain_name": u["domain_name"],
            "sample_urls": u["sample_urls"],
            "sources": u["sources"],
            "ad_count": u["ad_count"],
            "ad_ids": u["ad_ids"],
            "ad_profile_ids": u["ad_profile_ids"],
        }
        for u in unique
    ]

    (out_dir / "unique_domains.json").write_text(
        json.dumps(
            {
                **{k: v for k, v in payload.items() if k not in ("unique_domains", "skipped", "proposed_links")},
                "unique_domains": summary_unique,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    (out_dir / "unique_domains_full.json").write_text(
        json.dumps(payload["unique_domains"], indent=2),
        encoding="utf-8",
    )
    (out_dir / "skipped.json").write_text(
        json.dumps(payload["skipped"], indent=2),
        encoding="utf-8",
    )
    (out_dir / "proposed_links.json").write_text(
        json.dumps(payload["proposed_links"], indent=2),
        encoding="utf-8",
    )

    with (out_dir / "unique_domains.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["domain_name", "ad_count", "sources", "sample_url"])
        for u in unique:
            w.writerow(
                [
                    u["domain_name"],
                    u["ad_count"],
                    "|".join(u["sources"]),
                    (u["sample_urls"] or [""])[0],
                ]
            )
