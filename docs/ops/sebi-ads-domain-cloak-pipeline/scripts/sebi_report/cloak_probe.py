"""Cloak-param Playwright probe with per-variant screenshots + media.

Visits bare URL + known cloak tokens; archives evidence per variant;
dedupes media by text_sha16 (same creative shares archive).
"""

from __future__ import annotations

import hashlib
import re
import sys
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

PIPELINE_ROOT = Path(
    __import__("os").environ.get(
        "PIPELINE_ROOT",
        "/Users/tempus/Desktop/overwatch/Data_pipeline_test",
    )
)
sys.path.insert(0, str(PIPELINE_ROOT))

from bson import ObjectId  # noqa: E402
from pymongo.database import Database  # noqa: E402

from domain_analyzer import DOMAINS_COLLECTION  # noqa: E402
from domain_analyzer.media import archive_media  # noqa: E402
from domain_analyzer.page_text import PAGE_TEXT_JS, extract_page_text_from_snapshot  # noqa: E402
from domain_analyzer.s3_paths import db_name_from_env, screenshot_key  # noqa: E402
from sebi_report.cloak_tokens import KNOWN_CLOAK_PAIRS  # noqa: E402
from storage.s3_client import upload_bytes_to_s3  # noqa: E402

# Also seen widely in SEBI ad destinations (often still the dummy shell).
EXTRA_PAIRS: list[tuple[str, str]] = [
    ("pEl8X", "szvnknir"),
]

DUMMY_MARKERS = (
    "horology",
    "luxury watch",
    "timepiece",
    "watch boutique",
    "exhibition",
    "museum",
    "gallery",
    "showroom",
    "authorized luxury",
    "swiss horology",
    "vanguard horology",
    "ragahorology",
    "private request viewing",
    "collectors",
)

SCAM_MARKERS = (
    "invest",
    "investment",
    "profit",
    "earn",
    "earning",
    "withdraw",
    "quantum",
    "₹",
    "rs.",
    "rs ",
    "per month",
    "per day",
    "initial investment",
    "registration",
    "trading",
    "forex",
    "crypto",
    "mutual fund",
    "stock market",
    "sebi",
    "nirmala",
    "sudha murthy",
    "modi",
    "guaranteed return",
)

NAV_TIMEOUT_MS = 25_000
SETTLE_MS = 2_500
VIEWPORT = {"width": 1440, "height": 900}
UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

MEDIA_CANDIDATES_JS = """
() => {
  const images = [];
  for (const img of document.querySelectorAll('img[src]')) {
    const src = img.currentSrc || img.src;
    if (!src || src.startsWith('data:')) continue;
    images.push({
      source_url: src,
      alt: img.alt || '',
      width: img.naturalWidth || 0,
      height: img.naturalHeight || 0,
    });
  }
  const og = document.querySelector('meta[property="og:image"]');
  if (og && og.content) {
    images.push({ source_url: og.content, alt: '', in_og: true, width: 0, height: 0 });
  }
  const videos = [];
  for (const v of document.querySelectorAll('video source[src], video[src]')) {
    const src = v.src || v.getAttribute('src');
    if (src) videos.push({ source_url: src });
  }
  return { images, videos };
}
"""


def all_probe_pairs() -> list[tuple[str, str]]:
    seen: set[tuple[str, str]] = set()
    out: list[tuple[str, str]] = []
    for pair in [*KNOWN_CLOAK_PAIRS, *EXTRA_PAIRS]:
        if pair not in seen:
            seen.add(pair)
            out.append(pair)
    return out


def build_url(domain_name: str, pair: tuple[str, str] | None = None) -> str:
    base = f"https://{domain_name}/"
    if not pair:
        return base
    key, value = pair
    return f"{base}?{urlencode({key: value})}"


def _label_for_pair(pair: tuple[str, str] | None) -> str:
    if not pair:
        return "bare"
    return f"{pair[0]}={pair[1]}"


def _safe_shot_label(label: str) -> str:
    return re.sub(r"[^a-zA-Z0-9._-]+", "-", label)[:80] or "variant"


def classify_blob(title: str, body: str) -> dict[str, Any]:
    blob = f"{title}\n{body}".lower()
    dummy_hits = [m for m in DUMMY_MARKERS if m in blob]
    scam_hits = [m for m in SCAM_MARKERS if m in blob]
    text_sha = hashlib.sha256(blob.encode("utf-8", errors="ignore")).hexdigest()[:16]
    kind = "unknown"
    if scam_hits and len(scam_hits) >= 2:
        kind = "scam"
    elif dummy_hits and not scam_hits:
        kind = "dummy"
    elif scam_hits and dummy_hits:
        kind = "scam" if len(scam_hits) >= len(dummy_hits) else "mixed"
    elif dummy_hits:
        kind = "dummy"
    elif scam_hits:
        kind = "scam"
    return {
        "kind": kind,
        "dummy_hits": dummy_hits[:8],
        "scam_hits": scam_hits[:12],
        "text_sha16": text_sha,
        "title": (title or "")[:200],
        "excerpt": re.sub(r"\s+", " ", body or "").strip()[:280],
        "body_len": len(body or ""),
    }


def _upload_screenshot(
    png: bytes,
    *,
    domain_name: str,
    run_id: str,
    label: str,
    source_url: str,
) -> dict[str, Any]:
    db_name = db_name_from_env()
    # screenshot_key already prefixes non-full labels with "variant-"
    shot_label = "full" if label == "bare" else _safe_shot_label(label)
    key = screenshot_key(db_name, domain_name, run_id, label=shot_label)
    url, _ = upload_bytes_to_s3(png, key, content_type="image/png")
    return {
        "s3_url": url,
        "captured_at": datetime.now(UTC).isoformat(),
        "source_url": source_url,
        "width": VIEWPORT["width"],
        "height": None,
        "content_type": "image/png",
        "sha256": hashlib.sha256(png).hexdigest(),
        "label": label,
    }


def capture_variant(
    page,
    url: str,
    *,
    domain_name: str,
    run_id: str,
    label: str,
    param_key: str | None,
    param_value: str | None,
    archive: bool = True,
) -> dict[str, Any]:
    out: dict[str, Any] = {
        "label": label,
        "param_key": param_key,
        "param_value": param_value,
        "param": label if label != "bare" else None,
        "url": url,
        "error": None,
        "final_url": url,
        "status": None,
        "screenshot": None,
        "media": {"images": [], "videos": [], "skipped": []},
        "media_candidates": {"images": [], "videos": []},
        "page_text": {},
    }
    try:
        resp = page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        out["status"] = resp.status if resp else None
        try:
            page.wait_for_timeout(SETTLE_MS)
        except Exception:  # noqa: BLE001
            pass
        out["final_url"] = page.url

        page_snapshot: dict[str, Any] = {}
        try:
            raw_snap = page.evaluate(PAGE_TEXT_JS)
            page_snapshot = extract_page_text_from_snapshot(
                raw_snap if isinstance(raw_snap, dict) else {}
            )
        except Exception:  # noqa: BLE001
            try:
                page_snapshot = {"title": page.title() or "", "paragraphs": [], "headings": []}
            except Exception:  # noqa: BLE001
                page_snapshot = {}

        out["page_text"] = page_snapshot
        title = page_snapshot.get("title") or ""
        body = " ".join(page_snapshot.get("paragraphs") or [])
        if not body:
            try:
                body = page.evaluate(
                    """() => {
                      const root = document.querySelector('main, article, [role="main"]') || document.body;
                      if (!root) return '';
                      const clone = root.cloneNode(true);
                      for (const sel of ['script','style','noscript','svg']) {
                        clone.querySelectorAll(sel).forEach(el => el.remove());
                      }
                      return (clone.innerText || '').slice(0, 25000);
                    }"""
                ) or ""
            except Exception:  # noqa: BLE001
                body = ""
        out.update(classify_blob(title, str(body)))

        try:
            out["media_candidates"] = page.evaluate(MEDIA_CANDIDATES_JS) or {
                "images": [],
                "videos": [],
            }
        except Exception:  # noqa: BLE001
            out["media_candidates"] = {"images": [], "videos": []}

        if archive:
            try:
                png = page.screenshot(full_page=True, type="png")
                out["screenshot"] = _upload_screenshot(
                    png,
                    domain_name=domain_name,
                    run_id=run_id,
                    label=label,
                    source_url=url,
                )
            except Exception as exc:  # noqa: BLE001
                out["screenshot"] = {"error": str(exc)[:200], "source_url": url}

    except Exception as exc:  # noqa: BLE001
        out["error"] = str(exc)[:300]
        out.update(classify_blob("", ""))
        out["kind"] = "error"
    return out


def _empty_media() -> dict[str, Any]:
    return {"images": [], "videos": [], "skipped": []}


def probe_domain(
    browser,
    domain_name: str,
    pairs: list[tuple[str, str]],
    *,
    archive: bool = True,
) -> dict[str, Any]:
    run_id = str(uuid.uuid4())
    context = browser.new_context(
        viewport=VIEWPORT,
        user_agent=UA,
        locale="en-IN",
        ignore_https_errors=True,
    )
    context.add_init_script(
        "Object.defineProperty(navigator, 'webdriver', { get: () => undefined });"
    )
    page = context.new_page()
    page.set_default_timeout(NAV_TIMEOUT_MS)

    bare = capture_variant(
        page,
        build_url(domain_name, None),
        domain_name=domain_name,
        run_id=run_id,
        label="bare",
        param_key=None,
        param_value=None,
        archive=archive,
    )

    variants: list[dict[str, Any]] = [bare]
    for pair in pairs:
        key, value = pair
        label = _label_for_pair(pair)
        # Never upload same-as-bare evidence: classify first, archive only if unique.
        v = capture_variant(
            page,
            build_url(domain_name, pair),
            domain_name=domain_name,
            run_id=run_id,
            label=label,
            param_key=key,
            param_value=value,
            archive=False,
        )
        v["differs_from_bare"] = bool(
            v.get("text_sha16")
            and bare.get("text_sha16")
            and v["text_sha16"] != bare["text_sha16"]
            and v.get("kind") != "error"
        )
        if v["differs_from_bare"] and archive and not v.get("error"):
            try:
                png = page.screenshot(full_page=True, type="png")
                v["screenshot"] = _upload_screenshot(
                    png,
                    domain_name=domain_name,
                    run_id=run_id,
                    label=label,
                    source_url=v.get("url") or "",
                )
            except Exception as exc:  # noqa: BLE001
                v["screenshot"] = {"error": str(exc)[:200], "source_url": v.get("url")}
        else:
            v["screenshot"] = None
            if not v["differs_from_bare"]:
                v["media_candidates"] = {"images": [], "videos": []}
        variants.append(v)

    context.close()

    bare["differs_from_bare"] = False

    # Persist only bare + landers whose page differs from bare.
    unique_variants = [bare] + [
        v for v in variants[1:] if v.get("differs_from_bare")
    ]

    # Archive media once per unique text_sha16 (unique landers only).
    media_by_sha: dict[str, dict[str, Any]] = {}
    if archive:
        for v in unique_variants:
            sha = v.get("text_sha16") or ""
            if not sha or v.get("kind") == "error":
                v["media"] = _empty_media()
                continue
            if sha in media_by_sha:
                v["media"] = media_by_sha[sha]
                continue
            candidates = v.get("media_candidates") or {"images": [], "videos": []}
            try:
                archived = archive_media(
                    candidates,
                    domain_name=domain_name,
                    run_id=run_id,
                    page_url=v.get("final_url") or v.get("url") or "",
                )
            except Exception as exc:  # noqa: BLE001
                archived = {
                    "images": [],
                    "videos": [],
                    "skipped": [{"source_url": None, "reason": str(exc)[:200]}],
                }
            media_by_sha[sha] = archived
            v["media"] = archived
    else:
        for v in unique_variants:
            v["media"] = _empty_media()

    # Drop bulky candidates from stored payload
    for v in unique_variants:
        v.pop("media_candidates", None)

    unlocked = [
        v
        for v in unique_variants
        if v.get("label") != "bare"
        and v.get("differs_from_bare")
        and v.get("kind") in ("scam", "mixed")
    ]
    if not unlocked:
        unlocked = [
            v
            for v in unique_variants
            if v.get("label") != "bare"
            and v.get("kind") == "scam"
            and v.get("differs_from_bare")
        ]

    creatives: dict[str, dict[str, Any]] = {}
    for v in unlocked:
        sha = v.get("text_sha16") or "unknown"
        if sha not in creatives:
            creatives[sha] = {
                "text_sha16": sha,
                "kind": v.get("kind"),
                "title": v.get("title"),
                "excerpt": v.get("excerpt"),
                "params": [],
                "urls": [],
                "representative_url": v.get("url"),
                "screenshot": v.get("screenshot"),
                "media": v.get("media") or _empty_media(),
                "scam_hits": v.get("scam_hits") or [],
            }
        creatives[sha]["params"].append(v.get("param") or v.get("label"))
        creatives[sha]["urls"].append(v.get("url"))

    def slim_variant(v: dict[str, Any]) -> dict[str, Any]:
        return {
            "label": v.get("label"),
            "param_key": v.get("param_key"),
            "param_value": v.get("param_value"),
            "param": v.get("param"),
            "url": v.get("url"),
            "final_url": v.get("final_url"),
            "status": v.get("status"),
            "kind": v.get("kind"),
            "differs_from_bare": v.get("differs_from_bare"),
            "text_sha16": v.get("text_sha16"),
            "title": v.get("title"),
            "excerpt": v.get("excerpt"),
            "dummy_hits": v.get("dummy_hits"),
            "scam_hits": v.get("scam_hits"),
            "body_len": v.get("body_len"),
            "error": v.get("error"),
            "screenshot": v.get("screenshot"),
            "media": v.get("media") or _empty_media(),
            "page_text": v.get("page_text") or {},
        }

    best = unlocked[0] if unlocked else (bare if bare.get("kind") != "error" else None)

    return {
        "domain_name": domain_name,
        "run_id": run_id,
        "probed_at": datetime.now(UTC).isoformat(),
        "bare": slim_variant(bare),
        "variants": [slim_variant(v) for v in unique_variants],
        "unlocked": bool(unlocked),
        "unlocked_params": [v.get("param") or v.get("label") for v in unlocked],
        "creative_count": len(creatives),
        "creatives": list(creatives.values()),
        "best_unlocked": slim_variant(best) if best else None,
    }


def write_probe_to_mongo(db: Database, domain_id: ObjectId, probe: dict[str, Any]) -> None:
    """Merge cloak_probe + primary screenshot/media/page_text; keep intel modules."""
    now = datetime.now(UTC)
    variants = probe.get("variants") or []
    creatives = probe.get("creatives") or []
    best = probe.get("best_unlocked")

    variant_urls = [
        {
            "url": v.get("url"),
            "param": v.get("param") or v.get("label"),
            "kind": v.get("kind"),
            "label": v.get("label"),
        }
        for v in variants
        if v.get("url")
    ]

    set_doc: dict[str, Any] = {
        "analysis_results.cloak_probe": {
            "probed_at": probe.get("probed_at"),
            "run_id": probe.get("run_id"),
            "unlocked": probe.get("unlocked"),
            "unlocked_params": probe.get("unlocked_params") or [],
            "creative_count": probe.get("creative_count") or 0,
            "creatives": creatives,
            "variants": variants,
            "bare": probe.get("bare"),
        },
        "discovery.variant_urls": variant_urls,
        "discovery.cloak_unlocked": bool(probe.get("unlocked")),
        "discovery.unlocked_params": probe.get("unlocked_params") or [],
        "system.updated_at": now,
        "list.last_analyzed_at": now,
    }

    # Slim capture.variants for PRD consumers
    set_doc["analysis_results.capture"] = {
        "run_id": probe.get("run_id"),
        "user_agent": UA,
        "variants": [
            {
                "label": v.get("label"),
                "title": v.get("title"),
                "url": v.get("url"),
                "kind": v.get("kind"),
                "screenshot_s3_url": (v.get("screenshot") or {}).get("s3_url"),
            }
            for v in variants
        ],
        "error": None,
    }

    if best:
        shot = best.get("screenshot")
        if shot and shot.get("s3_url"):
            set_doc["analysis_results.screenshot"] = shot
        media = best.get("media") or _empty_media()
        set_doc["analysis_results.media"] = media
        pt = best.get("page_text") or {}
        if not pt.get("title"):
            pt = {
                "title": best.get("title") or "",
                "meta_description": "",
                "og_title": "",
                "og_description": "",
                "canonical_url": best.get("url") or "",
                "headings": [],
                "paragraphs": [best.get("excerpt") or ""] if best.get("excerpt") else [],
                "language": "en",
            }
        set_doc["analysis_results.page_text"] = pt
        set_doc["analysis_results.content_classification"] = {
            "title": best.get("title"),
            "summary": best.get("excerpt"),
            "excerpt": best.get("excerpt"),
            "category": "scam" if best.get("kind") in ("scam", "mixed") else (best.get("kind") or "unknown"),
            "labels": (
                ["cloaking", "investment_scam"]
                if probe.get("unlocked")
                else ([best.get("kind")] if best.get("kind") else [])
            ),
            "threat_types": (
                ["cloaking", "investment_fraud"] if probe.get("unlocked") else []
            ),
            "poi_names": [],
            "spoofed_brands": [],
            "cloak_param": best.get("param"),
            "source_url": best.get("url"),
            "source": "cloak_probe",
        }
        if probe.get("unlocked"):
            set_doc["list.category"] = "scam"
            set_doc["list.threat_types"] = ["cloaking", "investment_fraud"]
            set_doc["list.violation_flags"] = ["cloaking", "investment_fraud"]
            set_doc["list.ai_threat_score"] = 95
            set_doc["list.effective_threat_score"] = 95
            set_doc["list.risk_rank"] = "high"

    db[DOMAINS_COLLECTION].update_one({"_id": domain_id}, {"$set": set_doc})


def run_cloak_probe_batch(
    db: Database,
    *,
    limit: int | None = None,
    domain_names: list[str] | None = None,
    headless: bool = True,
    only_up: bool = True,
    write_mongo: bool = True,
    archive: bool = True,
) -> dict[str, Any]:
    from playwright.sync_api import sync_playwright

    query: dict[str, Any] = {}
    if domain_names:
        query["domain_name"] = {"$in": domain_names}
    elif only_up:
        query["list.is_reachable"] = True

    docs = list(
        db[DOMAINS_COLLECTION]
        .find(query, {"_id": 1, "domain_name": 1})
        .sort([("domain_name", 1)])
    )
    if limit is not None:
        docs = docs[:limit]

    pairs = all_probe_pairs()
    results: list[dict[str, Any]] = []
    unlocked_n = 0
    multi_creative_n = 0

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        try:
            for i, doc in enumerate(docs, 1):
                name = doc["domain_name"]
                print(
                    f"[{i}/{len(docs)}] probe+capture {name} "
                    f"({len(pairs)+1} urls, archive={archive})",
                    flush=True,
                )
                try:
                    probe = probe_domain(browser, name, pairs, archive=archive)
                except Exception as exc:  # noqa: BLE001
                    probe = {
                        "domain_name": name,
                        "error": str(exc),
                        "unlocked": False,
                        "unlocked_params": [],
                        "creative_count": 0,
                        "creatives": [],
                        "bare": {},
                        "variants": [],
                        "best_unlocked": None,
                    }
                if write_mongo and not probe.get("error"):
                    write_probe_to_mongo(db, doc["_id"], probe)
                if probe.get("unlocked"):
                    unlocked_n += 1
                    if (probe.get("creative_count") or 0) > 1:
                        multi_creative_n += 1
                    best = probe.get("best_unlocked") or {}
                    shot = (best.get("screenshot") or {}).get("s3_url") or ""
                    print(
                        f"    UNLOCKED creatives={probe.get('creative_count')} "
                        f"params={probe.get('unlocked_params')[:4]} "
                        f"shot={'yes' if shot else 'no'} "
                        f"title={(best.get('title') or '')[:60]}",
                        flush=True,
                    )
                else:
                    bare = probe.get("bare") or {}
                    print(
                        f"    no unlock (bare={bare.get('kind')}) "
                        f"shot={'yes' if (bare.get('screenshot') or {}).get('s3_url') else 'no'}",
                        flush=True,
                    )

                results.append(
                    {
                        "domain_name": name,
                        "object_id": str(doc["_id"]),
                        "unlocked": probe.get("unlocked"),
                        "creative_count": probe.get("creative_count"),
                        "unlocked_params": probe.get("unlocked_params"),
                        "bare_kind": (probe.get("bare") or {}).get("kind"),
                        "bare_title": (probe.get("bare") or {}).get("title"),
                        "best_title": (probe.get("best_unlocked") or {}).get("title"),
                        "best_url": (probe.get("best_unlocked") or {}).get("url"),
                        "screenshot_s3": (
                            ((probe.get("best_unlocked") or {}).get("screenshot") or {}).get(
                                "s3_url"
                            )
                        ),
                        "variant_count": len(probe.get("variants") or []),
                        "error": probe.get("error"),
                        "creatives": [
                            {
                                "text_sha16": c.get("text_sha16"),
                                "title": c.get("title"),
                                "params": c.get("params"),
                                "urls": c.get("urls"),
                                "representative_url": c.get("representative_url"),
                            }
                            for c in (probe.get("creatives") or [])
                        ],
                    }
                )
        finally:
            browser.close()

    return {
        "ok": True,
        "total": len(docs),
        "unlocked": unlocked_n,
        "multi_creative": multi_creative_n,
        "pairs_tried": [f"{k}={v}" for k, v in pairs],
        "archive": archive,
        "results": results,
    }
