#!/usr/bin/env python3
"""Deploy Overwatch, Scraping, and AIGC Grafana dashboards via API."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from typing import Any

PROM_DS = {"type": "prometheus", "uid": "prometheus_ds"}
LOKI_DS = {"type": "loki", "uid": "loki_ds"}
TEMPO_DS = {"type": "tempo", "uid": "tempo_ds"}


def prom_target(expr: str, legend: str = "{{service}}") -> dict[str, Any]:
    return {
        "datasource": PROM_DS,
        "editorMode": "code",
        "expr": expr,
        "legendFormat": legend,
        "range": True,
        "refId": "A",
    }


def timeseries_panel(
    pid: int,
    title: str,
    expr: str,
    x: int,
    y: int,
    w: int = 12,
    h: int = 8,
    legend: str = "{{service}}",
) -> dict[str, Any]:
    return {
        "id": pid,
        "type": "timeseries",
        "title": title,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "datasource": PROM_DS,
        "fieldConfig": {"defaults": {"unit": "short"}, "overrides": []},
        "options": {"legend": {"displayMode": "list", "placement": "bottom"}},
        "targets": [prom_target(expr, legend)],
    }


def stat_panel(
    pid: int,
    title: str,
    expr: str,
    x: int,
    y: int,
    w: int = 6,
    h: int = 4,
    unit: str = "percentunit",
) -> dict[str, Any]:
    return {
        "id": pid,
        "type": "stat",
        "title": title,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "datasource": PROM_DS,
        "fieldConfig": {
            "defaults": {"unit": unit, "thresholds": {"mode": "absolute", "steps": [{"color": "green", "value": None}]}},
            "overrides": [],
        },
        "options": {"reduceOptions": {"calcs": ["lastNotNull"]}, "colorMode": "value"},
        "targets": [prom_target(expr, "")],
    }


def table_panel(pid: int, title: str, expr: str, x: int, y: int, w: int = 12, h: int = 8) -> dict[str, Any]:
    return {
        "id": pid,
        "type": "table",
        "title": title,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "datasource": PROM_DS,
        "fieldConfig": {"defaults": {}, "overrides": []},
        "options": {"showHeader": True},
        "targets": [prom_target(expr, "{{span_name}}")],
    }


def logs_panel(pid: int, title: str, expr: str, x: int, y: int, w: int = 24, h: int = 8) -> dict[str, Any]:
    return {
        "id": pid,
        "type": "logs",
        "title": title,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "datasource": LOKI_DS,
        "targets": [{"datasource": LOKI_DS, "expr": expr, "refId": "A"}],
    }


def traces_panel(pid: int, title: str, query: str, x: int, y: int, w: int = 24, h: int = 10) -> dict[str, Any]:
    return {
        "id": pid,
        "type": "traces",
        "title": title,
        "gridPos": {"h": h, "w": w, "x": x, "y": y},
        "datasource": TEMPO_DS,
        "targets": [
            {
                "datasource": TEMPO_DS,
                "query": query,
                "queryType": "traceql",
                "refId": "A",
            }
        ],
    }


def row_panel(pid: int, title: str, y: int) -> dict[str, Any]:
    return {
        "id": pid,
        "type": "row",
        "title": title,
        "gridPos": {"h": 1, "w": 24, "x": 0, "y": y},
        "collapsed": False,
        "panels": [],
    }


ERROR_RATE = (
    'sum by (service) (rate(traces_spanmetrics_calls_total{service=~"$service",status_code="STATUS_CODE_ERROR"}[5m]))'
    ' / sum by (service) (rate(traces_spanmetrics_calls_total{service=~"$service"}[5m]))'
)
P95 = (
    "histogram_quantile(0.95, sum by (service, le) (rate(traces_spanmetrics_latency_bucket{service=~\"$service\"}[5m])))"
)


def service_variable(services: list[str]) -> dict[str, Any]:
    return {
        "name": "service",
        "type": "custom",
        "label": "Service",
        "multi": True,
        "includeAll": True,
        "current": {"selected": True, "text": "All", "value": "$__all"},
        "options": [{"selected": True, "text": "All", "value": "$__all"}]
        + [{"selected": True, "text": s, "value": s} for s in services],
        "query": ",".join(services),
    }


def fixed_service_variable(service: str) -> dict[str, Any]:
    return {
        "name": "service",
        "type": "custom",
        "hide": 2,
        "query": service,
        "current": {"selected": True, "text": service, "value": service},
        "options": [{"selected": True, "text": service, "value": service}],
    }


def base_dashboard(uid: str, title: str, tags: list[str], services: list[str], fixed: str | None = None) -> dict[str, Any]:
    templating = (
        {"list": [fixed_service_variable(fixed)]}
        if fixed
        else {"list": [service_variable(services)]}
    )
    return {
        "uid": uid,
        "title": title,
        "tags": tags,
        "timezone": "browser",
        "schemaVersion": 39,
        "version": 1,
        "refresh": "30s",
        "time": {"from": "now-24h", "to": "now"},
        "templating": templating,
        "panels": [],
    }


def overview_panels(start_id: int, y: int, use_variable: bool = True) -> tuple[list[dict], int]:
    svc = '$service' if use_variable else 'overwatch-client-app'
    filter_expr = '{service=~"$service"}' if use_variable else '{service="' + svc + '"}'
    panels = [
        row_panel(start_id, "Overview", y),
        timeseries_panel(
            start_id + 1,
            "Span rate",
            f'sum by (service) (rate(traces_spanmetrics_calls_total{filter_expr}[5m]))',
            0,
            y + 1,
            12,
            8,
        ),
        stat_panel(start_id + 2, "Error rate", ERROR_RATE if use_variable else ERROR_RATE.replace('$service', svc), 12, y + 1),
        timeseries_panel(
            start_id + 3,
            "P95 latency",
            P95 if use_variable else P95.replace('$service', svc),
            0,
            y + 9,
            12,
            8,
            "{{service}}",
        ),
        stat_panel(
            start_id + 4,
            "Span volume (range)",
            f'sum by (service) (increase(traces_spanmetrics_calls_total{filter_expr}[$__range]))',
            12,
            y + 9,
            6,
            8,
            "short",
        ),
    ]
    return panels, y + 17


def build_overwatch() -> dict[str, Any]:
    d = base_dashboard(
        "overwatch-platform",
        "Overwatch — Platform",
        ["overwatch", "traces"],
        ["overwatch-client-app", "overwatch-content-moderation", "overwatch-pdf-service"],
    )
    panels: list[dict] = []
    panels.extend(overview_panels(1, 0)[0])

    y = 17
    panels.append(row_panel(10, "overwatch-client-app", y))
    y += 1
    panels.extend(
        [
            table_panel(
                11,
                "Top spans",
                'topk(15, sum by (span_name) (rate(traces_spanmetrics_calls_total{service="overwatch-client-app"}[5m])))',
                0,
                y,
            ),
            timeseries_panel(
                12,
                "HTTP status codes",
                'sum by (http_status_code) (rate(traces_spanmetrics_calls_total{service="overwatch-client-app",http_status_code!=""}[5m]))',
                12,
                y,
                12,
                8,
                "{{http_status_code}}",
            ),
            timeseries_panel(
                13,
                "Report wait outcomes",
                'sum by (outcome, report_format) (rate(report_wait_session_outcomes_total[$__rate_interval]))',
                0,
                y + 8,
                12,
                8,
                "{{outcome}} / {{report_format}}",
            ),
            logs_panel(
                14,
                "Report wait logs (HTTP fallback)",
                '{job=~".+"} |= "report_wait_telemetry" | json | http_server_fallback_count > 0',
                0,
                y + 16,
            ),
            traces_panel(
                15,
                "Report wait traces",
                '{ resource.service.name = "overwatch-client-app" && name = "telemetry.report_wait.flush" }',
                0,
                y + 24,
            ),
        ]
    )
    y += 34

    panels.append(row_panel(20, "overwatch-content-moderation", y))
    y += 1
    panels.extend(
        [
            table_panel(
                21,
                "Top spans",
                'topk(10, sum by (span_name) (rate(traces_spanmetrics_calls_total{service="overwatch-content-moderation"}[5m])))',
                0,
                y,
            ),
            timeseries_panel(
                22,
                "SQS / Gemini rate",
                'sum(rate(traces_spanmetrics_calls_total{service="overwatch-content-moderation",span_name=~"process_sqs_record|gemini.generate_content"}[5m]))',
                12,
                y,
                12,
                8,
                "rate",
            ),
            stat_panel(
                23,
                "Error rate",
                'sum(rate(traces_spanmetrics_calls_total{service="overwatch-content-moderation",status_code="STATUS_CODE_ERROR"}[5m])) / sum(rate(traces_spanmetrics_calls_total{service="overwatch-content-moderation"}[5m]))',
                0,
                y + 8,
            ),
        ]
    )
    y += 12

    panels.append(row_panel(30, "overwatch-pdf-service", y))
    y += 1
    panels.extend(
        [
            table_panel(
                31,
                "Top spans",
                'topk(10, sum by (span_name) (rate(traces_spanmetrics_calls_total{service="overwatch-pdf-service"}[5m])))',
                0,
                y,
            ),
            timeseries_panel(
                32,
                "PDF job throughput",
                'rate(traces_spanmetrics_calls_total{service="overwatch-pdf-service",span_name="sqs.process generate-pdf"}[5m])',
                12,
                y,
                12,
                8,
                "jobs/s",
            ),
            timeseries_panel(
                33,
                "S3 read rate",
                'rate(traces_spanmetrics_calls_total{service="overwatch-pdf-service",span_name="S3.GetObject"}[5m])',
                0,
                y + 8,
                12,
                8,
                "ops/s",
            ),
        ]
    )
    y += 16

    panels.append(row_panel(40, "Dependencies (service graph)", y))
    y += 1
    panels.append(
        timeseries_panel(
            41,
            "Service graph edges",
            'sum by (client, server) (rate(traces_service_graph_request_total[5m]))',
            0,
            y,
            24,
            8,
            "{{client}} → {{server}}",
        )
    )
    y += 8
    panels.append(
        traces_panel(
            42,
            "Traces (selected services)",
            '{ resource.service.name =~ "$service" }',
            0,
            y,
        )
    )

    d["panels"] = panels
    return d


def build_scraping() -> dict[str, Any]:
    d = base_dashboard(
        "scraping-main-server",
        "Scraping — main_server",
        ["scraping", "traces"],
        [],
        fixed="main_server",
    )
    panels: list[dict] = [
        row_panel(1, "Pipeline health", 0),
        timeseries_panel(
            2,
            "Span rate",
            'rate(traces_spanmetrics_calls_total{service="main_server"}[5m])',
            0,
            1,
            12,
            8,
            "spans/s",
        ),
        stat_panel(
            3,
            "Error rate",
            'sum(rate(traces_spanmetrics_calls_total{service="main_server",status_code="STATUS_CODE_ERROR"}[5m])) / sum(rate(traces_spanmetrics_calls_total{service="main_server"}[5m]))',
            12,
            1,
        ),
        timeseries_panel(
            4,
            "P95 latency",
            'histogram_quantile(0.95, sum by (le) (rate(traces_spanmetrics_latency_bucket{service="main_server"}[5m])))',
            0,
            9,
            12,
            8,
            "p95",
        ),
        row_panel(10, "Core operations", 17),
        timeseries_panel(
            11,
            "Scrape attempts",
            'rate(traces_spanmetrics_calls_total{service="main_server",span_name="main_server.scrape_attempt"}[5m])',
            0,
            18,
            12,
            8,
            "rate",
        ),
        timeseries_panel(
            12,
            "Process message",
            'rate(traces_spanmetrics_calls_total{service="main_server",span_name="main_server.process_message"}[5m])',
            12,
            18,
            12,
            8,
            "rate",
        ),
        table_panel(
            13,
            "Top spans",
            'topk(10, sum by (span_name) (rate(traces_spanmetrics_calls_total{service="main_server"}[5m])))',
            0,
            26,
        ),
        row_panel(20, "Drill-down", 34),
        timeseries_panel(
            21,
            "Error spans",
            'rate(traces_spanmetrics_calls_total{service="main_server",status_code="STATUS_CODE_ERROR"}[5m])',
            0,
            35,
            12,
            8,
            "errors/s",
        ),
        traces_panel(
            22,
            "Traces",
            '{ resource.service.name = "main_server" }',
            0,
            43,
        ),
    ]
    d["panels"] = panels
    return d


def build_aigc() -> dict[str, Any]:
    d = base_dashboard(
        "aigc-api",
        "AIGC API — Inference & UI",
        ["aigc", "traces"],
        [],
        fixed="aigc-api",
    )
    panels: list[dict] = [
        row_panel(1, "API health", 0),
        timeseries_panel(
            2,
            "Request rate",
            'sum(rate(traces_spanmetrics_calls_total{service="aigc-api"}[5m]))',
            0,
            1,
            12,
            8,
            "req/s",
        ),
        stat_panel(
            3,
            "Error rate",
            'sum(rate(traces_spanmetrics_calls_total{service="aigc-api",status_code="STATUS_CODE_ERROR"}[5m])) / sum(rate(traces_spanmetrics_calls_total{service="aigc-api"}[5m]))',
            12,
            1,
        ),
        timeseries_panel(
            4,
            "P95 inference latency",
            'histogram_quantile(0.95, sum by (le) (rate(traces_spanmetrics_latency_bucket{service="aigc-api",span_name=~"TritonClient.RunInference|TritonInference"}[5m])))',
            0,
            9,
            12,
            8,
            "p95",
        ),
        row_panel(10, "Inference path", 17),
        timeseries_panel(
            11,
            "Triton inference rate",
            'sum(rate(traces_spanmetrics_calls_total{service="aigc-api",span_name=~"TritonClient.RunInference|TritonInference"}[5m]))',
            0,
            18,
            12,
            8,
            "inferences/s",
        ),
        timeseries_panel(
            12,
            "Preprocess rate",
            'rate(traces_spanmetrics_calls_total{service="aigc-api",span_name="PreprocessImage"}[5m])',
            12,
            18,
            12,
            8,
            "ops/s",
        ),
        table_panel(
            13,
            "Top spans (inference)",
            'topk(10, sum by (span_name) (rate(traces_spanmetrics_calls_total{service="aigc-api",span_name=~"Triton.*|PreprocessImage"}[5m])))',
            0,
            26,
        ),
        traces_panel(
            14,
            "Inference traces",
            '{ resource.service.name = "aigc-api" && name =~ "Triton.*|PreprocessImage" }',
            0,
            34,
        ),
        row_panel(20, "UI / HTTP surface", 44),
        timeseries_panel(
            21,
            "UI traffic (GET /)",
            'rate(traces_spanmetrics_calls_total{service="aigc-api",span_name="GET /"}[5m])',
            0,
            45,
            12,
            8,
            "req/s",
        ),
        timeseries_panel(
            22,
            "Traffic (excl. scanners)",
            'sum(rate(traces_spanmetrics_calls_total{service="aigc-api",span_name!~".*\\\\.env.*|PROPFIND.*"}[5m]))',
            12,
            45,
            12,
            8,
            "req/s",
        ),
        table_panel(
            23,
            "Non-inference HTTP",
            'topk(20, sum by (span_name) (rate(traces_spanmetrics_calls_total{service="aigc-api",span_name!~"Triton.*|PreprocessImage"}[5m])))',
            0,
            53,
        ),
        row_panel(30, "Drill-down", 61),
        traces_panel(
            31,
            "All traces",
            '{ resource.service.name = "aigc-api" }',
            0,
            62,
        ),
    ]
    d["panels"] = panels
    return d


DASHBOARDS = [
    ("overwatch", build_overwatch()),
    ("scraping", build_scraping()),
    ("aigc", build_aigc()),
]


def load_config() -> tuple[str, str]:
    mcp_path = os.path.expanduser("~/.cursor/mcp.json")
    with open(mcp_path, encoding="utf-8") as f:
        env = json.load(f)["mcpServers"]["grafana"]["env"]
    return env["GRAFANA_URL"].rstrip("/"), env["GRAFANA_SERVICE_ACCOUNT_TOKEN"]


def deploy(url: str, token: str, folder_uid: str, dashboard: dict) -> dict:
    payload = {"dashboard": dashboard, "folderUid": folder_uid, "overwrite": True}
    body = json.dumps(payload)
    result = subprocess.run(
        [
            "curl",
            "-sS",
            "-X",
            "POST",
            "-H",
            f"Authorization: Bearer {token}",
            "-H",
            "Content-Type: application/json",
            "-d",
            body,
            f"{url}/api/dashboards/db",
        ],
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr)
    data = json.loads(result.stdout)
    if "uid" not in data.get("dashboard", data) and data.get("status") != "success":
        raise RuntimeError(f"Deploy failed: {result.stdout}")
    return data


def main() -> int:
    url, token = load_config()
    results = []
    for folder_uid, dash in DASHBOARDS:
        print(f"Deploying {dash['title']} to folder {folder_uid}...")
        resp = deploy(url, token, folder_uid, dash)
        uid = resp.get("uid") or resp.get("dashboard", {}).get("uid")
        url_path = resp.get("url", "")
        results.append({"folder": folder_uid, "uid": uid, "url": url_path, "title": dash["title"]})
        print(json.dumps(resp, indent=2)[:800])

    out_path = os.path.join(
        os.path.dirname(__file__), "..", "docs", "grafana-dashboards-deployed.json"
    )
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2)
    print(f"\nWrote {out_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
