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

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))
PIPELINE_ROOT = Path(
    os.environ.get("PIPELINE_ROOT", "/Users/tempus/Desktop/overwatch/Data_pipeline_test")
)
sys.path.insert(0, str(PIPELINE_ROOT))

from database.connection import close_connection, connect_to_database  # noqa: E402
from sebi_report.apply import apply_empty_frames, load_unique_domains  # noqa: E402
from sebi_report.analyze_intel import run_intel_batch  # noqa: E402
from sebi_report.cloak_probe import run_cloak_probe_batch  # noqa: E402
from sebi_report.extract import extract_unique_domains, write_extract_artifacts  # noqa: E402


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
        out_path = Path(args.out) / "cloak_probe_result.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(summary, indent=2, default=str), encoding="utf-8")

        # CSV: one row per domain result + unlocked urls
        csv_path = Path(args.out) / "cloak_probe_summary.csv"
        import csv as csv_mod

        with csv_path.open("w", newline="", encoding="utf-8") as f:
            w = csv_mod.writer(f)
            w.writerow(
                [
                    "domain_name",
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
                        r.get("unlocked"),
                        r.get("creative_count"),
                        r.get("bare_kind"),
                        r.get("best_url"),
                        r.get("screenshot_s3"),
                        "|".join(r.get("unlocked_params") or []),
                    ]
                )

        print(
            json.dumps(
                {
                    k: summary[k]
                    for k in ("ok", "total", "unlocked", "multi_creative", "pairs_tried", "archive")
                    if k in summary
                },
                indent=2,
            )
        )
        print(f"wrote {out_path}")
        print(f"wrote {csv_path}")
    finally:
        close_connection()
    return 0 if summary.get("ok") else 1


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

    args = parser.parse_args(argv)
    if args.cmd == "apply" and not args.from_file:
        args.from_file = str(Path(args.out) / "unique_domains_full.json")
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
