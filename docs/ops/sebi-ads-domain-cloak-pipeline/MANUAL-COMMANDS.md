# Manual / one-off commands

These were run **outside** the main CLI during investigation (probe DB, validate cloak pattern, backfill links). Use the Data_pipeline_test venv.

```bash
cd /Users/tempus/Desktop/overwatch/Data_pipeline_test
.venv/bin/python
# or: .venv/bin/python - <<'PY' ...
```

Always set the tenant DB:

```python
import os
os.environ["DB_NAME"] = "SEBI-Data-Search"
from database.connection import connect_to_database, close_connection
db = connect_to_database()
```

---

## 1. Initial Ads / Domains inventory

```python
from collections import Counter
from urllib.parse import urlparse

print("Ads", db["Ads"].count_documents({}))
print("Domains", db["Domains"].count_documents({}))

c = Counter()
for a in db["Ads"].find({}, {"content.link_url": 1, "content.cards.link_url": 1}):
    urls = []
    lu = (a.get("content") or {}).get("link_url")
    if lu:
        urls.append(lu)
    for card in (a.get("content") or {}).get("cards") or []:
        if card.get("link_url"):
            urls.append(card["link_url"])
    for u in urls:
        h = urlparse(u if "://" in u else "https://" + u).hostname or ""
        c[h.lower()] += 1
print("top hosts", c.most_common(25))
```

---

## 2. HTTP fingerprint of reference cloak domain

Used to learn dummy vs scam before Playwright:

```python
import hashlib, json, re, requests

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
urls = [
    "https://mowdmcporvx.com/",
    "https://mowdmcporvx.com/?pEl8X=MI1_HT2",
    "https://mowdmcporvx.com/?pEl8X=ajtan_Haq",
    "https://mowdmcporvx.com/?pEl8X=MI2_HT2",
]

def fingerprint(html: str) -> dict:
    title = ""
    m = re.search(r"<title[^>]*>(.*?)</title>", html or "", re.I | re.S)
    if m:
        title = re.sub(r"\s+", " ", m.group(1)).strip()
    text = re.sub(r"<script[\s\S]*?</script>", " ", html or "", flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    scam_kw = ["invest", "profit", "trading", "earn", "withdraw", "quantum"]
    dummy_kw = ["watch", "exhibition", "gallery", "luxury", "timepiece"]
    return {
        "title": title[:120],
        "len": len(html or ""),
        "text_sha16": hashlib.sha256(text.encode()).hexdigest()[:16],
        "scam_hits": [k for k in scam_kw if k in text],
        "dummy_hits": [k for k in dummy_kw if k in text],
        "sample": text[:200],
    }

for u in urls:
    r = requests.get(u, timeout=20, headers={"User-Agent": UA}, allow_redirects=True)
    print(json.dumps({"url": u, "status": r.status_code, **fingerprint(r.text)}, indent=2))
```

---

## 3. Harvest cloak params already present on Domains / Ads

```python
from collections import Counter
from urllib.parse import urlparse, parse_qs

keys, pairs = Counter(), Counter()
for d in db["Domains"].find({}, {"discovery": 1}):
    disc = d.get("discovery") or {}
    urls = []
    if disc.get("first_seen_url"):
        urls.append(disc["first_seen_url"])
    for o in disc.get("occurrences") or []:
        if isinstance(o, dict) and o.get("url"):
            urls.append(o["url"])
    for u in urls:
        qs = parse_qs(urlparse(u).query, keep_blank_values=True)
        for k, vs in qs.items():
            kl = k.lower()
            if kl in ("pel8x", "ad_name", "adset_name", "jkm_id", "content_id"):
                keys[kl] += 1
                for v in vs:
                    if v:
                        pairs[(k, v)] += 1
print(keys.most_common())
print(pairs.most_common(40))
```

Observation: ads often had `pEl8X=szvnknir` and Meta templates `{{ad.name}}`; the **trial-and-error unlock tokens** (MI1_HT2, ajtan_Haq, …) were a separate list from operators.

---

## 4. Backfill `linked_ad_ids` after pair-cap truncation

After first `apply`, high-volume domains (e.g. `littleitaly.in`) could miss some `linked_ad_ids` because `ad_url_pairs` was capped. Full `ad_ids` from extract were pushed:

```python
import json
from pathlib import Path
from bson import ObjectId

domains = json.loads(Path("out/unique_domains_full.json").read_text())
fixed = 0
for entry in domains:
    name = entry["domain_name"]
    ad_ids = entry.get("ad_ids") or []
    if not ad_ids:
        continue
    oids = [ObjectId(a) for a in ad_ids]
    res = db["Domains"].update_one(
        {"domain_name": name},
        {"$addToSet": {"linked_ad_ids": {"$each": oids}}},
    )
    if res.modified_count:
        fixed += 1
print("domains modified", fixed)
```

(`apply.py` was later fixed to prefer full `ad_ids` on insert.)

---

## 5. Post-intel CSV export

```python
import csv
from pathlib import Path

rows = []
for d in db["Domains"].find({}).sort([("domain_name", 1)]):
    lst, wf = d.get("list") or {}, d.get("workflow") or {}
    ar = d.get("analysis_results") or {}
    whois, host, ssl, dns = ar.get("whois") or {}, ar.get("hosting") or {}, ar.get("ssl") or {}, ar.get("dns") or {}
    rows.append({
        "domain_name": d.get("domain_name"),
        "reachable": lst.get("is_reachable"),
        "visibility": wf.get("visibility_status"),
        "analysis_status": wf.get("analysis_status"),
        "ai_threat_score": lst.get("ai_threat_score"),
        "registrar": lst.get("registrar") or whois.get("registrar"),
        "hosting_provider": lst.get("hosting_provider") or host.get("provider"),
        "hosting_country": lst.get("hosting_country") or host.get("country"),
        "ssl_valid": lst.get("ssl_valid") if lst.get("ssl_valid") is not None else ssl.get("is_valid"),
        "linked_ad_count": len(d.get("linked_ad_ids") or []),
        "object_id": str(d["_id"]),
    })

out = Path("out/intel_summary.csv")
with out.open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
    w.writeheader()
    w.writerows(rows)
```

---

## 6. Verify rich cloak capture on one domain

```python
d = db["Domains"].find_one({"domain_name": "mowdmcporvx.com"})
cp = d["analysis_results"]["cloak_probe"]
print("unlocked", cp["unlocked"], "creatives", cp["creative_count"])
print("variant_urls", len(d["discovery"].get("variant_urls") or []))
print("primary shot", d["analysis_results"]["screenshot"]["s3_url"][:80])
for v in cp["variants"][:5]:
    print(v["label"], v["kind"], bool((v.get("screenshot") or {}).get("s3_url")), v["url"])
```

---

## 7. Stop a runaway text-only probe

Before re-running with screenshots:

```bash
pgrep -fl 'cli.py cloak-probe'
kill <pid>   # stop text-only batch so it cannot overwrite rich variants
```
