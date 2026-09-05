# Scripts

Run with the `Data_pipeline_test` virtualenv. Mongo/AWS settings come from that project's `.env`.

```bash
export PIPELINE_ROOT=/Users/tempus/Desktop/overwatch/Data_pipeline_test
cd "$(dirname "$0")"
"$PIPELINE_ROOT/.venv/bin/python" cli.py --help
```

## One-shot: new domains only

Processes new Ads landers end-to-end (extract → apply → intel on pending → cloak-probe on **reachable domains never probed before**):

```bash
./run_new.sh
# or:
"$PIPELINE_ROOT/.venv/bin/python" cli.py run-new --db SEBI-Data-Search
```

Options:

| Flag | Effect |
|------|--------|
| `--skip-probe` | Stop after intel; writes target list only |
| `--retry-not-unlocked` | Also re-probe prior `unlocked != true` hosts (new tokens) |
| `--retry-not-unlocked-only` | Only re-probe non-unlocked; skip never-probed filter |
| `--limit N` | Cap intel/probe batch size |
| `--no-write` | Probe dry-run (no Mongo writes) |

Preview targets without running the full pipeline:

```bash
"$PIPELINE_ROOT/.venv/bin/python" cli.py list-probe-targets --db SEBI-Data-Search
```

Artifacts land in `./out/` (`run_new_result.json`, `cloak_probe_targets.txt`, etc.).

## Cloak probe (standalone)

Mobile Android token probing lives in **`Data_pipeline_test/domain_analyzer/`** — one Mongo connection per batch:

```bash
DB_NAME=SEBI-Data-Search "$PIPELINE_ROOT/.venv/bin/python" \
  "$PIPELINE_ROOT/domain_analyzer/run_cloak_probe.py" \
  --retry-not-unlocked-only \
  --out ./out
```

Resume from a targets file (single connection, no per-domain reconnect):

```bash
./resume_mobile_probe.sh 25   # 0-based start index
```

Skip known-bad hosts by default (`economicinsight360.com`, `ipomoeazenithlau.quest`); override with `--skip-domains`.

## Cloak probe device profile

Probes run in **Android mobile view** (Playwright `Pixel 5` preset) so device-gated scam landers are captured. Desktop-only cloaks that still render on mobile continue to unlock; new mobile-only cloaks are detected.

Re-probe domains that failed under the old desktop profile:

```bash
"$PIPELINE_ROOT/.venv/bin/python" cli.py run-new \
  --db SEBI-Data-Search \
  --retry-not-unlocked-only
```

## Cloak tokens

Add new unlock pairs to both:

- [`../known_cloak_params.txt`](../known_cloak_params.txt) (reference list)
- [`sebi_report/cloak_tokens.py`](sebi_report/cloak_tokens.py) `KNOWN_CLOAK_PAIRS` (used by probe)

## Bulk-review pending ads on reviewed domains

Reviews **pending** ads (library + feed by default) whose destination domain already has
`workflow.review_status: reviewed`. Also reviews linked Ad_profiles.

```bash
# Dry-run first
./bulk_review_reviewed_domains.sh --start 2026-09-03 --end 2026-09-05

# Write reviews
./bulk_review_reviewed_domains.sh --start 2026-09-03 --end 2026-09-05 --apply

# Today only
./bulk_review_reviewed_domains.sh --today --apply

# One domain
./bulk_review_reviewed_domains.sh --start 2026-09-03 --end 2026-09-05 --domains ilnkarip.com --apply
```

Equivalent CLI:

```bash
"$PIPELINE_ROOT/.venv/bin/python" cli.py bulk-review-reviewed-domains \
  --db SEBI-Data-Search --start 2026-09-03 --end 2026-09-05 --apply
```

Artifact: `out/bulk_review_reviewed_domains_result.json`.

## Subcommands

`extract`, `apply`, `analyze-intel`, `cloak-probe`, `list-probe-targets`, `run-new`,
`bulk-review-cloak`, `bulk-review-reviewed-domains`.

See parent [README.md](../README.md) for the full pipeline story.
