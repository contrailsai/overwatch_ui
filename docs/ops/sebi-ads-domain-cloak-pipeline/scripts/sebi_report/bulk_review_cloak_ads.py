"""Bulk-submit ad reviews for library ads landing on known cloak scam domains."""

from __future__ import annotations

import json
import re
from datetime import UTC, datetime
from typing import Any
from urllib.parse import parse_qs, urlparse

from bson import ObjectId
from pymongo.database import Database

from sebi_report.cloak_tokens import KNOWN_CLOAK_KEYS, KNOWN_CLOAK_PAIRS
from sebi_report.extract import iter_ad_urls

try:
    from domain_analyzer.identity import canonicalize_domain_name, normalize_url
except ImportError:
    from urllib.parse import urlparse as _urlparse

    def normalize_url(url: str) -> str:
        return url.strip()

    def canonicalize_domain_name(url: str) -> str | None:
        host = _urlparse(url).netloc.lower()
        return host[4:] if host.startswith("www.") else host or None

LIBRARY_URL_RE = re.compile(r"/ads/library", re.I)
FEED_URL_RE = re.compile(
    r"/share/|/posts/|/reels/|permalink\.php|story_fbid|fbid|facebook\.com/\d+/posts/",
    re.I,
)

# Mirrors ad_id 6a8bfc930bca585c02ba82ce (library cloak scam review template).
REVIEW_TEMPLATE = {
    "threat_score": 96,
    "threat_types": ["investment-scams", "fraud"],
    "legal_codes": [
        {"code": "IT ACT 2000 - SECTION 66D", "reasoning": ""},
        {"code": "BNS 2023 - Section 318(4)", "reasoning": ""},
    ],
    "is_aigc": False,
    "flags": {
        "investment-scams": True,
        "hate-speech": False,
        "misinformation": False,
        "fraud": True,
        "asset-misuse": False,
    },
    "poi_names": [],
    "reasoning": "",
    "simple_report_description": None,
    "reviewer_comments": "",
    "face_present": False,
    "name_present": False,
}

DEFAULT_REVIEWER = "sebi-reviewer@contrails.ai"

# Meta Ads Library unresolved dynamic params — not real cloak unlock tokens.
META_TEMPLATE_VALUE_RE = re.compile(r"\{\{[^}]+\}\}")


def _is_meta_template_value(value: str) -> bool:
    return bool(META_TEMPLATE_VALUE_RE.search(value or ""))


def _risk_rank_from_score(score: int) -> str:
    if score > 80:
        return "high"
    if score > 50:
        return "medium"
    if score > 20:
        return "low"
    return "safe"


def ad_channel(ad: dict[str, Any]) -> str:
    stored = ad.get("channel")
    if stored in ("library", "ads_library"):
        return "library"
    if stored == "feed":
        return "feed"
    if stored == "ingestion":
        return "ingestion"
    if ad.get("submitted_url"):
        return "ingestion"
    ingestion_type = str((ad.get("ingestion") or {}).get("type") or "")
    if ingestion_type in ("facebook_share_post", "client_request", "client_requested_link"):
        return "ingestion"
    url = (
        ad.get("original_url")
        or ad.get("original_link")
        or (ad.get("ingestion") or {}).get("source_url")
        or ""
    )
    if LIBRARY_URL_RE.search(url):
        return "library"
    if FEED_URL_RE.search(url):
        return "feed"
    return "feed"


def url_has_known_cloak(url: str) -> bool:
    """True only when the URL carries a resolved known cloak key/value pair."""
    qs = parse_qs(urlparse(url).query, keep_blank_values=True)
    for key, values in qs.items():
        kl = key.lower()
        if kl not in KNOWN_CLOAK_KEYS:
            continue
        for value in values:
            if _is_meta_template_value(value):
                continue
            for pair_key, pair_value in KNOWN_CLOAK_PAIRS:
                if pair_key.lower() == kl and value == pair_value:
                    return True
    return False


def load_scam_domains(db: Database) -> set[str]:
    """Domains confirmed as cloak scam via Domains analysis (probe unlock or scam class)."""
    names: set[str] = set()
    for doc in db["Domains"].find(
        {
            "$or": [
                {"analysis_results.cloak_probe.unlocked": True},
                {"analysis_results.content_classification.category": "scam"},
            ]
        },
        {"domain_name": 1},
    ):
        name = doc.get("domain_name")
        if isinstance(name, str) and name.strip():
            names.add(name.strip())
    return names


def build_review_details(*, reviewed_at: datetime | None = None) -> dict[str, Any]:
    now = reviewed_at or datetime.now(UTC).replace(tzinfo=None)
    return {
        **REVIEW_TEMPLATE,
        "reviewed_at": now.isoformat(timespec="milliseconds") + "Z",
    }


def ad_matches_cloak(ad: dict[str, Any], scam_domains: set[str]) -> tuple[bool, set[str], str | None]:
    """Match only when a destination domain is a confirmed cloak scam in Domains."""
    hit_domains: set[str] = set()
    match_kind: str | None = None
    for raw_url, _ in iter_ad_urls(ad):
        norm = normalize_url(raw_url) or raw_url
        domain_name = canonicalize_domain_name(norm)
        if not domain_name or domain_name not in scam_domains:
            continue
        hit_domains.add(domain_name)
        match_kind = "url_param" if url_has_known_cloak(norm) else "domain"
    return bool(hit_domains), hit_domains, match_kind


def collect_bulk_review_targets(
    db: Database,
    *,
    start: datetime,
    end: datetime,
    only_pending: bool = True,
) -> dict[str, Any]:
    scam_domains = load_scam_domains(db)
    query: dict[str, Any] = {"list.sourced_at": {"$gte": start, "$lt": end}}
    if only_pending:
        query["workflow.review_status"] = {"$ne": "reviewed"}

    projection = {
        "_id": 1,
        "platform_ad_id": 1,
        "original_url": 1,
        "channel": 1,
        "ingestion": 1,
        "submitted_url": 1,
        "content.link_url": 1,
        "content.cards.link_url": 1,
        "workflow.review_status": 1,
        "list.sourced_at": 1,
    }

    stats = {
        "total_in_range": 0,
        "skipped_feed": 0,
        "skipped_ingestion": 0,
        "skipped_non_library": 0,
        "library_no_cloak": 0,
        "library_cloak_match": 0,
    }
    targets: list[dict[str, Any]] = []

    for ad in db["Ads"].find(query, projection):
        stats["total_in_range"] += 1
        channel = ad_channel(ad)
        if channel == "feed":
            stats["skipped_feed"] += 1
            continue
        if channel == "ingestion":
            stats["skipped_ingestion"] += 1
            continue
        if channel != "library":
            stats["skipped_non_library"] += 1
            continue

        matched, hit_domains, match_kind = ad_matches_cloak(ad, scam_domains)
        if not matched:
            stats["library_no_cloak"] += 1
            continue

        stats["library_cloak_match"] += 1
        targets.append(
            {
                "ad_id": str(ad["_id"]),
                "platform_ad_id": ad.get("platform_ad_id"),
                "domains": sorted(hit_domains),
                "match_kind": match_kind,
                "sourced_at": str((ad.get("list") or {}).get("sourced_at")),
                "review_status_before": (ad.get("workflow") or {}).get("review_status"),
            }
        )

    return {
        "scam_domains_loaded": len(scam_domains),
        "stats": stats,
        "targets": targets,
    }


def apply_bulk_reviews(
    db: Database,
    targets: list[dict[str, Any]],
    *,
    reviewer_email: str = DEFAULT_REVIEWER,
    dry_run: bool = True,
) -> dict[str, Any]:
    reviewed_at = datetime.now(UTC).replace(tzinfo=None)
    review_details = build_review_details(reviewed_at=reviewed_at)
    score = review_details["threat_score"]
    risk_rank = _risk_rank_from_score(score)
    updated = 0
    skipped = 0
    errors: list[dict[str, str]] = []

    for target in targets:
        ad_id = target["ad_id"]
        if dry_run:
            updated += 1
            continue

        try:
            oid = ObjectId(ad_id)
        except Exception:
            errors.append({"ad_id": ad_id, "error": "invalid ObjectId"})
            skipped += 1
            continue

        existing = db["Ads"].find_one({"_id": oid}, {"workflow.review_status": 1, "workflow.alerted_at": 1})
        if not existing:
            errors.append({"ad_id": ad_id, "error": "not found"})
            skipped += 1
            continue
        if (existing.get("workflow") or {}).get("review_status") == "reviewed":
            skipped += 1
            continue

        preserved_reviewed_at = reviewed_at
        db["Ads"].update_one(
            {"_id": oid},
            {
                "$set": {
                    "review_details": review_details,
                    "workflow.review_status": "reviewed",
                    "workflow.client_status": existing.get("workflow", {}).get("client_status") or "open",
                    "workflow.alerted_at": existing.get("workflow", {}).get("alerted_at") or reviewed_at,
                    "content_reviewed_by": reviewer_email,
                    "list.review_threat_score": score,
                    "list.effective_threat_score": score,
                    "list.risk_rank": risk_rank,
                    "list.reviewed_at": preserved_reviewed_at,
                    "list.threat_types": review_details["threat_types"],
                    "list.violation_flags": review_details["threat_types"],
                    "system.updated_at": reviewed_at,
                }
            },
        )
        updated += 1

    return {
        "dry_run": dry_run,
        "reviewer_email": reviewer_email,
        "would_update" if dry_run else "updated": updated,
        "skipped": skipped,
        "errors": errors,
        "review_template": REVIEW_TEMPLATE,
    }


def run_bulk_review_cloak_ads(
    db: Database,
    *,
    start: datetime,
    end: datetime,
    dry_run: bool = True,
    reviewer_email: str = DEFAULT_REVIEWER,
    only_pending: bool = True,
) -> dict[str, Any]:
    collected = collect_bulk_review_targets(
        db,
        start=start,
        end=end,
        only_pending=only_pending,
    )
    apply_result = apply_bulk_reviews(
        db,
        collected["targets"],
        reviewer_email=reviewer_email,
        dry_run=dry_run,
    )
    return {
        "ok": True,
        "date_range": {"start": start.isoformat(), "end_exclusive": end.isoformat()},
        "dry_run": dry_run,
        **collected,
        "apply": apply_result,
    }


def write_bulk_review_artifact(payload: dict[str, Any], out_path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(payload, indent=2, default=str), encoding="utf-8")


def revert_bulk_reviews(
    db: Database,
    ad_ids: list[str],
    *,
    reviewer_email: str = DEFAULT_REVIEWER,
    dry_run: bool = True,
) -> dict[str, Any]:
    """Undo automated bulk reviews and restore pending workflow state."""
    reverted = 0
    skipped = 0
    errors: list[dict[str, str]] = []
    now = datetime.now(UTC).replace(tzinfo=None)

    for ad_id in ad_ids:
        try:
            oid = ObjectId(ad_id)
        except Exception:
            errors.append({"ad_id": ad_id, "error": "invalid ObjectId"})
            skipped += 1
            continue

        existing = db["Ads"].find_one(
            {"_id": oid},
            {"content_reviewed_by": 1, "workflow.review_status": 1, "review_details.threat_score": 1},
        )
        if not existing:
            errors.append({"ad_id": ad_id, "error": "not found"})
            skipped += 1
            continue
        if existing.get("content_reviewed_by") != reviewer_email:
            skipped += 1
            continue
        if (existing.get("workflow") or {}).get("review_status") != "reviewed":
            skipped += 1
            continue

        if dry_run:
            reverted += 1
            continue

        db["Ads"].update_one(
            {"_id": oid},
            {
                "$unset": {"review_details": "", "content_reviewed_by": ""},
                "$set": {
                    "workflow.review_status": "pending",
                    "workflow.alerted_at": None,
                    "list.review_threat_score": None,
                    "list.effective_threat_score": None,
                    "list.risk_rank": None,
                    "list.reviewed_at": None,
                    "list.threat_types": [],
                    "list.violation_flags": [],
                    "system.updated_at": now,
                },
            },
        )
        reverted += 1

    return {
        "dry_run": dry_run,
        "reviewer_email": reviewer_email,
        "would_revert" if dry_run else "reverted": reverted,
        "skipped": skipped,
        "errors": errors,
    }
