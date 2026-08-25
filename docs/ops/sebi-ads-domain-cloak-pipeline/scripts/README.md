# Scripts

Run with the `Data_pipeline_test` virtualenv. Mongo/AWS settings come from that project's `.env`.

```bash
export PIPELINE_ROOT=/Users/tempus/Desktop/overwatch/Data_pipeline_test
cd "$(dirname "$0")"
"$PIPELINE_ROOT/.venv/bin/python" cli.py --help
"$PIPELINE_ROOT/.venv/bin/python" cli.py extract --db SEBI-Data-Search --out ../samples-out
```

Subcommands: `extract`, `apply`, `analyze-intel`, `cloak-probe`.

See parent [README.md](../README.md) for the full pipeline story.
