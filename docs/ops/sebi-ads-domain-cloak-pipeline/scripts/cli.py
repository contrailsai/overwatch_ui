#!/usr/bin/env python3
"""
SEBI ads → Domains orchestrator (temp).

  # Dry-run extract only (writes out/)
  python cli.py extract --db SEBI-Data-Search

  # Upsert empty Domains frames + bidirectional links (no analysis)
  python cli.py apply --db SEBI-Data-Search

Uses Data_pipeline_test Mongo (.env) with DB_NAME overridden per --db.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
PIPELINE_ROOT = Path(
    os.environ.get("PIPELINE_ROOT", "/Users/tempus/Desktop/overwatch/Data_pipeline_test")
)
sys.path.insert(0, str(PIPELINE_ROOT))

from database.connection import close_connection, connect_to_database  # noqa: E402
from datetime import date, datetime, timedelta

from sebi_report.apply import apply_empty_frames, load_unique_domains  # noqa: E402
from sebi_report.analyze_intel import run_intel_batch  # noqa: E402
from sebi_report.bulk_review_cloak_ads import run_bulk_review_cloak_ads, write_bulk_review_artifact  # noqa: E402
from sebi_report.cloak_probe import run_cloak_probe_batch  # noqa: E402
from sebi_report.extract import extract_unique_domains, write_extract_artifacts  # noqa: E402
from sebi_report.probe_targets import list_probe_targets, write_probe_targets  # noqa: E402


def _set_db(name: str) -> None:
    os.environ["DB_NAME"] = name


def cmd_extract(args: argparse.Namespace) -> int:
    _set_db(args.db)
    db = connect_to_database()
    try:
        payload = extract_unique_domains(db)
        out = Path(args.out)
        write_extract_artifacts(payload, out)
        print(
            json.dumps(
                {
                    "ok": True,
                    "db": payload["db_name"],
                    "ads_scanned": payload["ads_scanned"],
                    "urls_seen": payload["urls_seen"],
                    "unique_domains": payload["unique_domain_count"],
                    "skipped_hosts": payload["skipped_host_count"],
                    "out": str(out),
                },
                indent=2,
            )
        )
    finally:
        close_connection()
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    _set_db(args.db)
    full_path = Path(args.from_file)
    if not full_path.exists():
        alt = Path(args.out) / "unique_domains_full.json"
        if alt.exists():
            full_path = alt
        else:
            print(f"missing extract file: {full_path}", file=sys.stderr)
            return 1

    domains = load_unique_domains(full_path)
    if domains and not domains[0].get("ad_url_pairs"):
        full = Path(args.out) / "unique_domains_full.json"
        if full.exists():
            domains = load_unique_domains(full)

    db = connect_to_database()
    try:
        result = apply_empty_frames(db, domains, dry_run=args.dry_run)
        out_path = Path(args.out) / "apply_result.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(result, indent=2, default=str), encoding="utf-8")
        print(json.dumps({k: v for k, v in result.items() if k != "domain_ids"}, indent=2))
        print(f"wrote {out_path}")
    finally:
        close_connection()
    return 0


def cmd_analyze_intel(args: argparse.Namespace) -> int:
    """Steps 1–3: online check + DNS/WHOIS/SSL/hosting. No Playwright content."""
    _set_db(args.db)
    db = connect_to_database()
    summary: dict = {}
    try:
        summary = run_intel_batch(
            db,
            limit=args.limit,
            force=not args.skip_fresh,
            only_pending=not args.all,
        )
        out_path = Path(args.out) / "intel_batch_result.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        slim = {
            **{k: v for k, v in summary.items() if k != "results"},
            "results": [
                {
                    "status": r.get("status"),
                    "domain_name": r.get("domain_name"),
                    "object_id": r.get("object_id"),
                    "ai_threat_score": r.get("ai_threat_score"),
                    "error": r.get("error"),
                }
                for r in summary.get("results") or []
            ],
        }
        out_path.write_text(json.dumps(slim, indent=2, default=str), encoding="utf-8")
        print(
            json.dumps(
                {k: slim[k] for k in ("ok", "total", "analyzed", "up", "down", "failed", "skipped")},
                indent=2,
            )
        )
        print(f"wrote {out_path}")
    finally:
        close_connection()
    return 0 if summary.get("ok") else 1


def cmd_cloak_probe(args: argparse.Namespace) -> int:
    """Step 4: Playwright trial of known cloak params on reachable domains."""
    _set_db(args.db)
    db = connect_to_database()
    summary: dict = {}
    try:
        names = None
        if args.domains:
            names = [x.strip() for x in args.domains.split(",") if x.strip()]
        summary = run_cloak_probe_batch(
            db,
            limit=args.limit,
            domain_names=names,
            headless=not args.headed,
            only_up=not args.all,
            write_mongo=not args.no_write,
        )
        _write_cloak_probe_artifacts(summary, Path(args.out))
        print(
            json.dumps(
                {
                    k: summary[k]
                    for k in ("ok", "total", "unlocked", "multi_creative", "view_profile", "pairs_tried", "archive")
                    if k in summary
                },
                indent=2,
            )
        )
    finally:
        close_connection()
    return 0 if summary.get("ok") else 1


def _write_cloak_probe_artifacts(summary: dict, out: Path) -> None:
    out_path = out / "cloak_probe_result.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")

    csv_path = out / "cloak_probe_summary.csv"
    import csv as csv_mod

    with csv_path.open("w", newline="", encoding="utf-8") as f:
        w = csv_mod.writer(f)
        w.writerow(
            [
                "domain_name",
                "view_profile",
                "unlocked",
                "creative_count",
                "bare_kind",
                "best_url",
                "screenshot_s3",
                "unlocked_params",
            ]
        )
        for r in summary.get("results") or []:
            w.writerow(
                [
                    r.get("domain_name"),
                    r.get("view_profile"),
                    r.get("unlocked"),
                    r.get("creative_count"),
                    r.get("bare_kind"),
                    r.get("best_url"),
                    r.get("screenshot_s3"),
                    "|".join(r.get("unlocked_params") or []),
                ]
            )
    print(f"wrote {out_path}")
    print(f"wrote {csv_path}")


def cmd_list_probe_targets(args: argparse.Namespace) -> int:
    """List reachable domains that still need cloak-probe."""
    _set_db(args.db)
    db = connect_to_database()
    try:
        payload = list_probe_targets(
            db,
            new_only=not args.retry_not_unlocked_only,
            retry_not_unlocked=args.retry_not_unlocked or args.retry_not_unlocked_only,
        )
        if args.retry_not_unlocked_only:
            payload["domains"] = payload.get("prior_not_unlocked") or []
            payload["count"] = len(payload["domains"])
        json_path, txt_path = write_probe_targets(payload, Path(args.out))
        print(
            json.dumps(
                {
                    "ok": True,
                    "count": payload["count"],
                    "new_no_probe": len(payload.get("new_no_probe") or []),
                    "prior_not_unlocked": len(payload.get("prior_not_unlocked") or []),
                    "targets_json": str(json_path),
                    "targets_txt": str(txt_path),
                },
                indent=2,
            )
        )
    finally:
        close_connection()
    return 0


def cmd_run_new(args: argparse.Namespace) -> int:
    """Extract → apply → intel (pending) → cloak-probe new reachable domains."""
    _set_db(args.db)
    out = Path(args.out)
    run_summary: dict[str, Any] = {"ok": True, "db": args.db, "steps": {}}

    # 1) extract
    db = connect_to_database()
    try:
        payload = extract_unique_domains(db)
        write_extract_artifacts(payload, out)
        run_summary["steps"]["extract"] = {
            "ads_scanned": payload["ads_scanned"],
            "urls_seen": payload["urls_seen"],
            "unique_domains": payload["unique_domain_count"],
            "skipped_hosts": payload["skipped_host_count"],
        }
        print(
            json.dumps({"step": "extract", **run_summary["steps"]["extract"]}, indent=2),
            flush=True,
        )
    finally:
        close_connection()

    # 2) apply
    full_path = out / "unique_domains_full.json"
    if not full_path.exists():
        print(f"missing extract file: {full_path}", file=sys.stderr)
        return 1
    domains = load_unique_domains(full_path)
    db = connect_to_database()
    try:
        apply_result = apply_empty_frames(db, domains, dry_run=args.dry_run)
        apply_path = out / "apply_result.json"
        apply_path.write_text(json.dumps(apply_result, indent=2, default=str), encoding="utf-8")
        run_summary["steps"]["apply"] = {
            k: apply_result[k]
            for k in ("domains_inserted", "domains_updated", "unique_domains", "ads_link_ops")
            if k in apply_result
        }
        print(json.dumps({"step": "apply", **run_summary["steps"]["apply"]}, indent=2), flush=True)
    finally:
        close_connection()

    # 3) intel pending/failed
    db = connect_to_database()
    try:
        intel_summary = run_intel_batch(
            db,
            limit=args.limit,
            force=not args.skip_fresh_intel,
            only_pending=True,
        )
        intel_path = out / "intel_batch_result.json"
        slim_intel = {
            **{k: v for k, v in intel_summary.items() if k != "results"},
            "results": [
                {
                    "status": r.get("status"),
                    "domain_name": r.get("domain_name"),
                    "object_id": r.get("object_id"),
                    "ai_threat_score": r.get("ai_threat_score"),
                    "error": r.get("error"),
                }
                for r in intel_summary.get("results") or []
            ],
        }
        intel_path.write_text(json.dumps(slim_intel, indent=2, default=str), encoding="utf-8")
        run_summary["steps"]["analyze_intel"] = {
            k: slim_intel[k]
            for k in ("ok", "total", "analyzed", "up", "down", "failed", "skipped")
            if k in slim_intel
        }
        print(
            json.dumps({"step": "analyze_intel", **run_summary["steps"]["analyze_intel"]}, indent=2),
            flush=True,
        )
    finally:
        close_connection()

    # 4) probe targets
    db = connect_to_database()
    try:
        targets = list_probe_targets(
            db,
            new_only=not args.retry_not_unlocked_only,
            retry_not_unlocked=args.retry_not_unlocked or args.retry_not_unlocked_only,
        )
        if args.retry_not_unlocked_only:
            targets["domains"] = targets.get("prior_not_unlocked") or []
            targets["count"] = len(targets["domains"])
        write_probe_targets(targets, out)
        run_summary["steps"]["probe_targets"] = {
            "count": targets["count"],
            "new_no_probe": len(targets.get("new_no_probe") or []),
            "prior_not_unlocked": len(targets.get("prior_not_unlocked") or []),
            "domains": targets.get("domains") or [],
        }
        print(json.dumps({"step": "probe_targets", **run_summary["steps"]["probe_targets"]}, indent=2), flush=True)
    finally:
        close_connection()

    domain_names = targets.get("domains") or []
    if args.skip_probe or not domain_names:
        run_summary["steps"]["cloak_probe"] = {
            "skipped": True,
            "reason": "no targets" if not domain_names else "--skip-probe",
            "total": 0,
        }
        run_path = out / "run_new_result.json"
        run_path.write_text(json.dumps(run_summary, indent=2, default=str), encoding="utf-8")
        print(json.dumps({"step": "cloak_probe", **run_summary["steps"]["cloak_probe"]}, indent=2))
        print(f"wrote {run_path}")
        return 0

    # 5) cloak-probe
    db = connect_to_database()
    probe_summary: dict = {}
    try:
        probe_summary = run_cloak_probe_batch(
            db,
            limit=args.limit,
            domain_names=domain_names,
            headless=not args.headed,
            only_up=True,
            write_mongo=not args.no_write,
        )
        _write_cloak_probe_artifacts(probe_summary, out)
        run_summary["steps"]["cloak_probe"] = {
            k: probe_summary[k]
            for k in ("ok", "total", "unlocked", "multi_creative", "view_profile", "pairs_tried", "archive")
            if k in probe_summary
        }
        print(json.dumps({"step": "cloak_probe", **run_summary["steps"]["cloak_probe"]}, indent=2))
    finally:
        close_connection()

    run_path = out / "run_new_result.json"
    run_path.write_text(json.dumps(run_summary, indent=2, default=str), encoding="utf-8")
    print(f"wrote {run_path}")
    return 0 if probe_summary.get("ok") else 1


def _parse_ymd(value: str) -> datetime:
    return datetime.strptime(value, "%Y-%m-%d")


def _resolve_bulk_review_dates(args: argparse.Namespace) -> tuple[datetime, datetime]:
    if args.today:
        day = date.today()
        return datetime(day.year, day.month, day.day), datetime(day.year, day.month, day.day) + timedelta(days=1)
    start_str = args.start or date.today().isoformat()
    end_str = args.end or (date.today() + timedelta(days=1)).isoformat()
    start = _parse_ymd(start_str)
    end = _parse_ymd(end_str)
    return start, end


def cmd_bulk_review_cloak(args: argparse.Namespace) -> int:
    """Bulk-review library ads (+ profiles) landing on cloak-unlocked scam domains."""
    _set_db(args.db)
    start, end = _resolve_bulk_review_dates(args)
    if end <= start:
        print("--end must be after --start", file=sys.stderr)
        return 1

    db = connect_to_database()
    try:
        result = run_bulk_review_cloak_ads(
            db,
            start=start,
            end=end,
            dry_run=not args.apply,
            reviewer_email=args.reviewer,
            only_pending=not args.include_reviewed,
            with_profiles=not args.ads_only,
            cloak_unlocked_only=not args.include_unproven_scam,
        )
        out_path = Path(args.out) / "bulk_review_cloak_result.json"
        write_bulk_review_artifact(result, out_path)
        summary = {
            "ok": result.get("ok"),
            "dry_run": result.get("dry_run"),
            "date_range": result.get("date_range"),
            "cloak_unlocked_only": result.get("cloak_unlocked_only"),
            "with_profiles": result.get("with_profiles"),
            "stats": result.get("stats"),
            "scam_domains_loaded": result.get("scam_domains_loaded"),
            "ads_to_review": len(result.get("targets") or []),
            "profiles_to_review": len(result.get("unique_profile_ids") or []),
            "apply_ads": {
                k: result["apply"][k]
                for k in ("dry_run", "reviewer_email", "skipped", "errors")
                if k in result.get("apply", {})
            },
        }
        for key in ("would_update", "updated"):
            if key in result.get("apply", {}):
                summary["apply_ads"][key] = result["apply"][key]
        if result.get("profile_apply"):
            summary["apply_profiles"] = {
                k: result["profile_apply"][k]
                for k in ("dry_run", "skipped", "errors")
                if k in result["profile_apply"]
            }
            for key in ("would_update", "updated"):
                if key in result["profile_apply"]:
                    summary["apply_profiles"][key] = result["profile_apply"][key]
        print(json.dumps(summary, indent=2))
        print(f"wrote {out_path}")
    finally:
        close_connection()
    return 0


def _add_common(p: argparse.ArgumentParser) -> None:
    p.add_argument("--db", default="SEBI-Data-Search")
    p.add_argument("--out", default=str(ROOT / "out"), help="Artifact directory")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="SEBI ads domain extract / empty-frame apply")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_ext = sub.add_parser("extract", help="Dry-run: list unique domains from Ads")
    _add_common(p_ext)
    p_ext.set_defaults(func=cmd_extract)

    p_app = sub.add_parser("apply", help="Upsert empty Domains frames + link Ads")
    _add_common(p_app)
    p_app.add_argument(
        "--from-file",
        default=None,
        help="Path to unique_domains_full.json (default: out/unique_domains_full.json)",
    )
    p_app.add_argument("--dry-run", action="store_true")
    p_app.set_defaults(func=cmd_apply)

    p_intel = sub.add_parser(
        "analyze-intel",
        help="Intel-only: reachability + DNS/WHOIS/SSL/hosting (no page content)",
    )
    _add_common(p_intel)
    p_intel.add_argument("--limit", type=int, default=None)
    p_intel.add_argument(
        "--all",
        action="store_true",
        help="Include already-completed domains (default: pending/failed only)",
    )
    p_intel.add_argument(
        "--skip-fresh",
        action="store_true",
        help="Respect 7-day TTL skip (default: force re-intel)",
    )
    p_intel.set_defaults(func=cmd_analyze_intel)

    p_cloak = sub.add_parser(
        "cloak-probe",
        help="Playwright: bare vs known cloak params; detect dummy vs scam unlock",
    )
    _add_common(p_cloak)
    p_cloak.add_argument("--limit", type=int, default=None)
    p_cloak.add_argument(
        "--domains",
        default=None,
        help="Comma-separated domain_name list (default: all reachable)",
    )
    p_cloak.add_argument("--all", action="store_true", help="Include non-reachable domains")
    p_cloak.add_argument("--headed", action="store_true")
    p_cloak.add_argument("--no-write", action="store_true", help="Do not update Mongo")
    p_cloak.set_defaults(func=cmd_cloak_probe)

    p_targets = sub.add_parser(
        "list-probe-targets",
        help="List reachable domains that still need cloak-probe",
    )
    _add_common(p_targets)
    p_targets.add_argument(
        "--retry-not-unlocked",
        action="store_true",
        help="Also include prior probes where unlocked != true",
    )
    p_targets.add_argument(
        "--retry-not-unlocked-only",
        action="store_true",
        help="Only prior non-unlocked domains (exclude never-probed)",
    )
    p_targets.set_defaults(func=cmd_list_probe_targets)

    p_run = sub.add_parser(
        "run-new",
        help="Extract → apply → intel (pending) → cloak-probe new reachable domains",
    )
    _add_common(p_run)
    p_run.add_argument("--limit", type=int, default=None)
    p_run.add_argument("--dry-run", action="store_true", help="Dry-run apply step only")
    p_run.add_argument(
        "--skip-fresh-intel",
        action="store_true",
        help="Respect 7-day intel TTL (default: force re-intel on pending)",
    )
    p_run.add_argument(
        "--retry-not-unlocked",
        action="store_true",
        help="Also re-probe reachable domains where unlocked != true",
    )
    p_run.add_argument(
        "--retry-not-unlocked-only",
        action="store_true",
        help="Probe only prior non-unlocked domains (skip never-probed filter alone)",
    )
    p_run.add_argument(
        "--skip-probe",
        action="store_true",
        help="Stop after intel + target list (no Playwright)",
    )
    p_run.add_argument("--headed", action="store_true")
    p_run.add_argument("--no-write", action="store_true", help="Probe without Mongo writes")
    p_run.set_defaults(func=cmd_run_new)

    p_review = sub.add_parser(
        "bulk-review-cloak",
        help="Bulk-review library cloak ads + ad profiles (dry-run by default)",
    )
    _add_common(p_review)
    p_review.add_argument(
        "--today",
        action="store_true",
        help="Review ads sourced today (overrides --start/--end)",
    )
    p_review.add_argument("--start", default=None, help="Inclusive start date (YYYY-MM-DD, list.sourced_at)")
    p_review.add_argument(
        "--end",
        default=None,
        help="Exclusive end date (YYYY-MM-DD). E.g. 2026-09-03 includes all of Sep 2.",
    )
    p_review.add_argument("--apply", action="store_true", help="Write reviews to Mongo (default: dry-run)")
    p_review.add_argument("--reviewer", default="sebi-reviewer@contrails.ai")
    p_review.add_argument(
        "--include-reviewed",
        action="store_true",
        help="Include ads already marked reviewed (default: pending only)",
    )
    p_review.add_argument(
        "--ads-only",
        action="store_true",
        help="Review ads only; skip linked Ad_profiles",
    )
    p_review.add_argument(
        "--include-unproven-scam",
        action="store_true",
        help="Also match Domains with scam category but no cloak unlock (default: unlocked only)",
    )
    p_review.set_defaults(func=cmd_bulk_review_cloak)

    args = parser.parse_args(argv)
    if args.cmd == "apply" and not args.from_file:
        args.from_file = str(Path(args.out) / "unique_domains_full.json")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
