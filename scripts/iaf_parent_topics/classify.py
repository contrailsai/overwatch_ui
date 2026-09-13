#!/usr/bin/env python3
"""Assign reviewed IAF posts to event-level topics under fixed parent pillars.

Mirrors tmp/Rajsthan_Content_Moderation/src/rj_database_building/daily.py but:
  - reads Posts from Mongo (AirForce-Data-Search)
  - writes parent/child docs to the `topics` collection Overwatch nexus reads

Usage:
  export GEMINI_API_KEY=...
  python scripts/iaf_parent_topics/classify.py --dry-run
  python scripts/iaf_parent_topics/classify.py --db AirForce-Data-Search
  python scripts/iaf_parent_topics/classify.py --reviewed-on 2026-09-13
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from bson import ObjectId
from dotenv import load_dotenv
from google import genai
from google.genai import types
from pymongo import MongoClient

ROOT = Path(__file__).resolve().parents[2]
TAXONOMY_PATH = Path(__file__).resolve().parent / "taxonomy.json"
BATCH_SIZE = 40
MAX_NEW_TOPICS_PER_BATCH = 8
MAX_ATTEMPTS = 4
MAX_SEED_ASSIGN_FRACTION = 0.35
# Locked to Rajasthan catalog.json / .env.example (gemini-2.5-flash, not lite).
MODEL_NAME = "gemini-2.5-flash"
CREATED_BY = "iaf_parent_topics_pipeline"

PROMPT = """SYSTEM ROLE:
You maintain a stable Indian Air Force OSINT narrative database with FIXED
parent pillars and a persistent EVENT-LEVEL canonical topic catalog.

There are only {pillar_count} parent pillars because this corpus is small
(~200 reviewed posts). Pillars are parents only. They never grow. Topics are
children under a pillar. Each pillar should collect distinct event-level
topics (a named dogfight claim, a specific speech, a POW clip). A pillar is
not a topic. Do not collapse a pillar into one catch-all topic.

There are NO subtopics in this database.

PILLARS:
{pillars}

EXISTING EVENT TOPICS (assign to these when the same event already exists):
{topics}

RESIDUAL CATCH-ALLS (not real topics; do not use as t except last resort):
{residual_ids}

NEW POSTS:
{posts}

RULES:
- Every P### alias must appear exactly once.
- t must be an event-level T##### from EXISTING EVENT TOPICS or a declared N# key.
- NEVER put a pillar_id or P000xx parent id in t or r. Parent IDs are not child topics.
- NEVER use residual catch-alls ({residual_ids}) as t unless the post has no distinct event hook.
- If EXISTING EVENT TOPICS is empty or does not contain this post's event,
  create an N# topic. Same event → reuse that N# for every matching post.
- Different events under the SAME pillar MUST be different topics.
- Name each N# after the specific event, not the pillar name.
- Select the primary news hook, not every mention.
- Different language, platform, source, sentiment, or reporting format does
  not justify a new topic.
- Prefer fewer, reusable event topics over a new N# for every post.
- At most {max_new_topics} entries in new_topics (N1..N8).
- r may contain existing event-level T##### IDs only. If none, use [].
- Do not put N# keys in r.
- Do not create or rename pillars.
- Keep the response compact: one short object per post, no prose.

SPECIAL PILLAR ROUTING (dominant hook → which parent the N# belongs to):
{routing}

Return ONLY valid JSON:
{{
  "new_topics": [
    {{
      "k": "N1",
      "name": "Concise event-level topic name",
      "summary": "One sentence definition",
      "pillar_id": "existing_pillar_id"
    }}
  ],
  "posts": [
    {{"p": "P001", "t": "N1", "r": []}}
  ]
}}
"""

MODERATION_SAFETY_SETTINGS = [
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_HARASSMENT,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_HATE_SPEECH,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
    types.SafetySetting(
        category=types.HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
        threshold=types.HarmBlockThreshold.BLOCK_NONE,
    ),
]


def load_env() -> None:
    load_dotenv(ROOT / ".env.local")
    load_dotenv(ROOT / ".env")


def now() -> datetime:
    return datetime.now(timezone.utc)


def load_taxonomy() -> dict[str, Any]:
    return json.loads(TAXONOMY_PATH.read_text(encoding="utf-8"))


def get_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise RuntimeError("GEMINI_API_KEY is required")
    return genai.Client(api_key=api_key)


def _is_retryable(exc: BaseException) -> bool:
    try:
        from google.genai import errors as genai_errors
    except ImportError:
        genai_errors = None
    if genai_errors is not None:
        if isinstance(exc, genai_errors.ServerError):
            return True
        if isinstance(exc, genai_errors.APIError) and getattr(exc, "code", None) in (429, 500, 502, 503, 504):
            return True
    msg = str(exc).lower()
    return any(t in msg for t in ("429", "502", "503", "504", "rate limit", "unavailable", "bad gateway"))


def parse_json_object(text: str) -> dict[str, Any]:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise
        obj = json.loads(text[start : end + 1])
    if not isinstance(obj, dict):
        raise ValueError("JSON root must be an object")
    return obj


def generate_json(client: genai.Client, prompt: str, *, max_attempts: int = 5) -> dict[str, Any]:
    config = types.GenerateContentConfig(
        temperature=0,
        max_output_tokens=16000,
        response_mime_type="application/json",
        safety_settings=MODERATION_SAFETY_SETTINGS,
        thinking_config=types.ThinkingConfig(thinking_budget=0),
    )
    last_err = ""
    for attempt in range(1, max_attempts + 1):
        try:
            resp = client.models.generate_content(
                model=MODEL_NAME,
                contents=[prompt],
                config=config,
            )
        except Exception as exc:
            if not _is_retryable(exc) or attempt >= max_attempts:
                raise
            delay = 5 * (2 ** (attempt - 1))
            print(f"  Gemini error (attempt {attempt}/{max_attempts}): {exc}. Retry in {delay}s")
            time.sleep(delay)
            continue
        text = _response_text(resp)
        if not text:
            last_err = "empty response"
        else:
            try:
                return parse_json_object(text)
            except (json.JSONDecodeError, ValueError) as exc:
                last_err = str(exc)
        if attempt < max_attempts:
            delay = 5 * (2 ** (attempt - 1))
            print(f"  Bad JSON (attempt {attempt}/{max_attempts}): {last_err}. Retry in {delay}s")
            time.sleep(delay)
    raise ValueError(f"Could not parse Gemini JSON after {max_attempts} attempts: {last_err}")


def _response_text(response) -> str:
    chunks: list[str] = []
    for cand in getattr(response, "candidates", None) or []:
        content = getattr(cand, "content", None)
        for part in getattr(content, "parts", None) or []:
            text = getattr(part, "text", None)
            if text and not getattr(part, "thought", False):
                chunks.append(text)
    if chunks:
        return "".join(chunks).strip()
    return (getattr(response, "text", None) or "").strip()


def post_card(doc: dict[str, Any]) -> dict[str, Any]:
    caption = str((doc.get("content") or {}).get("caption") or "").strip()
    analysis = doc.get("analysis_results") or {}
    review = doc.get("review_details") or {}
    reasoning = str(analysis.get("reasoning") or review.get("reasoning") or "")[:700]
    anti = str(analysis.get("anti_india_reasoning") or "")[:280]
    misinfo = str(analysis.get("misinformation_explanation") or "")[:280]
    pois = review.get("poi_names") or analysis.get("poi_names") or []
    threats = (doc.get("list") or {}).get("threat_types") or review.get("threat_types") or []
    return {
        "post_id": str(doc["_id"]),
        "caption": caption[:900],
        "reasoning": reasoning,
        "anti_india": anti,
        "misinfo": misinfo,
        "pois": pois[:12],
        "threats": threats,
        "posted_at": (doc.get("list") or {}).get("posted_at"),
        "platform": doc.get("platform") or "",
        "url": doc.get("original_url") or "",
    }


POST_PROJECTION = {
    "content.caption": 1,
    "analysis_results.reasoning": 1,
    "analysis_results.anti_india_reasoning": 1,
    "analysis_results.misinformation_explanation": 1,
    "analysis_results.poi_names": 1,
    "review_details.reasoning": 1,
    "review_details.poi_names": 1,
    "review_details.threat_types": 1,
    "list.threat_types": 1,
    "list.posted_at": 1,
    "list.reviewed_at": 1,
    "platform": 1,
    "original_url": 1,
}


def utc_day_bounds(day: str) -> tuple[datetime, datetime]:
    start = datetime.strptime(day, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    return start, start + timedelta(days=1)


def load_reviewed_posts(coll, query: dict[str, Any] | None = None) -> list[dict[str, Any]]:
    match = {"workflow.review_status": "reviewed"}
    if query:
        match.update(query)
    docs = list(coll.find(match, POST_PROJECTION))
    return [post_card(d) for d in docs]


def catalog_from_mongo(topics: list[dict[str, Any]], taxonomy: dict[str, Any]) -> dict[str, Any]:
    pillar_by_id = {p["pillar_id"]: p for p in taxonomy["pillars"]}
    parent_ids = {p["topic_id"] for p in taxonomy["pillars"]}
    out: dict[str, Any] = {}
    for t in topics:
        tid = t.get("topic_id")
        if not tid or tid in parent_ids:
            continue
        out[tid] = {
            "topic_id": tid,
            "name": t.get("title") or tid,
            "summary": t.get("narrative") or "",
            "pillar_id": t.get("pillar_id") or t.get("category"),
            "pillar_name": (pillar_by_id.get(t.get("pillar_id") or t.get("category")) or {}).get("name", ""),
            "seed": bool(t.get("seed")),
            "post_ids": [str(x) for x in (t.get("posts") or [])],
            "parent_topic_id": t.get("parent_topic_id"),
            "poi_names": [str(n) for n in (t.get("poi_names") or []) if n],
            "first_posted_at": t.get("first_posted_at"),
            "last_posted_at": t.get("last_posted_at"),
        }
    return {"topics": out}


def topic_cards(catalog: dict[str, Any]) -> list[dict[str, Any]]:
    topics = sorted(
        (t for t in catalog["topics"].values() if not t.get("seed")),
        key=lambda t: (t.get("pillar_name", ""), t.get("name", "")),
    )
    return [
        {
            "topic_id": t["topic_id"],
            "name": t["name"],
            "summary": t.get("summary", ""),
            "pillar_id": t.get("pillar_id"),
            "pillar_name": t.get("pillar_name"),
        }
        for t in topics
    ]


def seed_topic_ids(catalog: dict[str, Any]) -> set[str]:
    return {tid for tid, t in catalog["topics"].items() if t.get("seed")}


def next_topic_id(existing: set[str]) -> str:
    numbers = [
        int(m.group(1))
        for tid in existing
        if (m := re.fullmatch(r"T(\d+)", tid))
    ]
    n = max(numbers, default=0) + 1
    while f"T{n:05d}" in existing:
        n += 1
    return f"T{n:05d}"


def alias_posts(posts: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], dict[str, str]]:
    cards = []
    aliases = {}
    for i, post in enumerate(posts, 1):
        alias = f"P{i:03d}"
        aliases[alias] = post["post_id"]
        card = {
            "post_id": alias,
            "content": post.get("caption") or "",
        }
        if post.get("reasoning"):
            card["narrative"] = post["reasoning"][:400]
        if post.get("pois"):
            card["subjects"] = ", ".join(str(x) for x in post["pois"])
        if post.get("anti_india"):
            card["anti_india"] = post["anti_india"][:220]
        cards.append(card)
    return cards, aliases


def normalize_alias(value: Any, valid_aliases: set[str]) -> str:
    alias = str(value).strip().upper()
    match = re.fullmatch(r"P0*(\d+)", alias)
    if match:
        candidate = f"P{int(match.group(1)):03d}"
        if candidate in valid_aliases:
            return candidate
    return alias


def validate_payload(
    payload: dict[str, Any],
    valid_aliases: set[str],
    valid_topic_ids: set[str],
    valid_pillar_ids: set[str],
    residual_seed_ids: set[str],
) -> list[str]:
    new_topics = payload.get("new_topics")
    posts = payload.get("posts")
    if not isinstance(new_topics, list):
        return ["new_topics must be a list"]
    if not isinstance(posts, list):
        return ["posts must be a list"]
    issues: list[str] = []
    new_keys: list[str] = []
    for topic in new_topics:
        if not isinstance(topic, dict):
            issues.append("new topic must be an object")
            continue
        key = str(topic.get("k") or "").strip()
        new_keys.append(key)
        if not re.fullmatch(r"N[1-8]", key):
            issues.append(f"invalid new-topic key {key!r}")
        if not str(topic.get("name") or "").strip():
            issues.append(f"new topic {key!r} is missing a name")
        if topic.get("pillar_id") not in valid_pillar_ids:
            issues.append(f"new topic {key!r} uses unknown pillar {topic.get('pillar_id')!r}")
    if len(new_keys) != len(set(new_keys)):
        issues.append("new-topic keys must be unique")
    if len(new_topics) > MAX_NEW_TOPICS_PER_BATCH:
        issues.append(f"too many new topics: {len(new_topics)}")

    allowed = valid_topic_ids | set(new_keys)
    aliases: list[str] = []
    seed_hits = 0
    for item in posts:
        if not isinstance(item, dict):
            issues.append("post mapping must be an object")
            continue
        alias = str(item.get("p") or "").strip()
        target = str(item.get("t") or "").strip()
        aliases.append(alias)
        if target in residual_seed_ids:
            seed_hits += 1
        if target not in allowed:
            issues.append(f"post {alias!r} uses unknown target {target!r}")
    missing = sorted(valid_aliases - set(aliases))
    unknown = sorted(set(aliases) - valid_aliases)
    if missing:
        issues.append(f"missing {len(missing)} aliases: {missing[:10]}")
    if unknown:
        issues.append(f"unknown aliases: {unknown[:10]}")
    n_posts = len(valid_aliases)
    seed_cap = max(5, int(MAX_SEED_ASSIGN_FRACTION * n_posts))
    if n_posts >= 20 and seed_hits > seed_cap:
        issues.append(
            f"{seed_hits}/{n_posts} posts dumped on residual catch-alls; create event-level N# topics"
        )
    event_topics_exist = bool(valid_topic_ids - residual_seed_ids)
    if n_posts >= 20 and not new_keys and not event_topics_exist:
        issues.append("EXISTING EVENT TOPICS is empty: create N# event-level topics")
    return issues


def sanitize_payload(
    payload: dict[str, Any],
    valid_aliases: set[str],
    catalog: dict[str, Any],
    valid_pillar_ids: set[str],
    fallback: str,
) -> dict[str, Any]:
    valid_topic_ids = set(catalog["topics"])
    new_topics = []
    new_keys = set()
    for raw in payload.get("new_topics") or []:
        if not isinstance(raw, dict) or len(new_topics) >= MAX_NEW_TOPICS_PER_BATCH:
            continue
        key = str(raw.get("k") or "").strip()
        if (
            not re.fullmatch(r"N[1-8]", key)
            or key in new_keys
            or not str(raw.get("name") or "").strip()
            or raw.get("pillar_id") not in valid_pillar_ids
        ):
            continue
        new_keys.add(key)
        new_topics.append(
            {
                "k": key,
                "name": str(raw["name"]).strip(),
                "summary": str(raw.get("summary") or "").strip(),
                "pillar_id": raw["pillar_id"],
            }
        )
    seen = set()
    posts = []
    for raw in payload.get("posts") or []:
        if not isinstance(raw, dict):
            continue
        alias = normalize_alias(raw.get("p"), valid_aliases)
        if alias not in valid_aliases or alias in seen:
            continue
        seen.add(alias)
        target = str(raw.get("t") or "").strip()
        if target not in valid_topic_ids and target not in new_keys:
            target = fallback
        posts.append({"p": alias, "t": target, "r": []})
    for alias in sorted(valid_aliases - seen):
        posts.append({"p": alias, "t": fallback, "r": []})
    return {"new_topics": new_topics, "posts": posts}


def compact_to_assignments(payload: dict[str, Any]) -> dict[str, Any]:
    new_by_key = {t["k"]: t for t in payload.get("new_topics") or []}
    existing_groups: dict[str, list[str]] = {}
    new_groups: dict[str, dict[str, Any]] = {}
    for post in payload["posts"]:
        target = post["t"]
        if target in new_by_key:
            new_groups.setdefault(target, {"post_ids": []})["post_ids"].append(post["p"])
        else:
            existing_groups.setdefault(target, []).append(post["p"])
    assignments = [
        {"action": "assign", "topic_id": tid, "post_ids": ids}
        for tid, ids in existing_groups.items()
    ]
    for key, group in new_groups.items():
        topic = new_by_key[key]
        assignments.append(
            {
                "action": "create",
                "name": topic["name"],
                "summary": topic.get("summary", ""),
                "pillar_id": topic["pillar_id"],
                "post_ids": group["post_ids"],
            }
        )
    return {"assignments": assignments}


def classify_batch(
    posts: list[dict[str, Any]],
    catalog: dict[str, Any],
    taxonomy: dict[str, Any],
) -> dict[str, Any]:
    model_posts, alias_to_real = alias_posts(posts)
    valid_aliases = set(alias_to_real)
    valid_topic_ids = set(catalog["topics"])
    pillar_ids = {p["pillar_id"] for p in taxonomy["pillars"]}
    residual = seed_topic_ids(catalog) or {s["topic_id"] for s in taxonomy["seeds"]}
    fallback = next(iter(residual), next(iter(valid_topic_ids)))
    residual_ids = ", ".join(sorted(residual))
    routing = "\n".join(
        f"- {p['pillar_id']} — {p['description']}" for p in taxonomy["pillars"]
    )
    prompt = PROMPT.format(
        pillar_count=len(taxonomy["pillars"]),
        pillars=json.dumps(
            [{k: p[k] for k in ("pillar_id", "name", "description")} for p in taxonomy["pillars"]],
            ensure_ascii=False,
            indent=2,
        ),
        topics=json.dumps(topic_cards(catalog), ensure_ascii=False, indent=2),
        posts=json.dumps(model_posts, ensure_ascii=False, indent=2),
        max_new_topics=MAX_NEW_TOPICS_PER_BATCH,
        residual_ids=residual_ids,
        routing=routing,
    )
    client = get_client()
    correction = ""
    payload: dict[str, Any] = {"new_topics": [], "posts": []}
    for attempt in range(1, MAX_ATTEMPTS + 1):
        payload = generate_json(client, prompt + correction)
        for item in payload.get("posts") or []:
            if isinstance(item, dict):
                item["p"] = normalize_alias(item.get("p"), valid_aliases)
                item["t"] = str(item.get("t") or "").strip()
        issues = validate_payload(payload, valid_aliases, valid_topic_ids, pillar_ids, residual)
        if not issues:
            break
        if attempt == MAX_ATTEMPTS:
            payload = sanitize_payload(payload, valid_aliases, catalog, pillar_ids, fallback)
            break
        print(f"    validation retry {attempt}/{MAX_ATTEMPTS}: {'; '.join(issues)}")
        correction = (
            "\n\nINVALID PREVIOUS RESPONSE:\n- "
            + "\n- ".join(issues)
            + "\nReturn the compact schema with every P### alias exactly once."
        )
    payload = compact_to_assignments(payload)
    for item in payload["assignments"]:
        item["post_ids"] = [alias_to_real[a] for a in item["post_ids"]]
    return payload


def apply_assignments(
    payload: dict[str, Any],
    catalog: dict[str, Any],
    taxonomy: dict[str, Any],
    post_by_id: dict[str, dict[str, Any]],
) -> dict[str, int]:
    pillar_by_id = {p["pillar_id"]: p for p in taxonomy["pillars"]}
    created = assigned = 0
    existing = set(catalog["topics"]) | {p["topic_id"] for p in taxonomy["pillars"]}
    for item in payload["assignments"]:
        if item["action"] == "create":
            topic_id = next_topic_id(existing)
            existing.add(topic_id)
            pillar = pillar_by_id[item["pillar_id"]]
            catalog["topics"][topic_id] = {
                "topic_id": topic_id,
                "name": item["name"],
                "summary": item.get("summary") or "",
                "pillar_id": item["pillar_id"],
                "pillar_name": pillar["name"],
                "parent_topic_id": pillar["topic_id"],
                "seed": False,
                "post_ids": [],
                "new": True,
            }
            created += 1
        else:
            topic_id = item["topic_id"]
            if topic_id not in catalog["topics"]:
                continue
        topic = catalog["topics"][topic_id]
        ids = set(topic.get("post_ids") or [])
        for post_id in item["post_ids"]:
            ids.add(post_id)
            assigned += 1
        topic["post_ids"] = sorted(ids)
        known = {
            str(n)
            for pid in topic["post_ids"]
            if pid in post_by_id
            for n in (post_by_id.get(pid, {}).get("pois") or [])
            if n
        }
        # Keep names already stored when this run does not reload every member.
        topic["poi_names"] = sorted(set(topic.get("poi_names") or []) | known)
    return {"created": created, "assigned": assigned}


def write_topics(coll, catalog: dict[str, Any], taxonomy: dict[str, Any], post_by_id: dict[str, dict[str, Any]]) -> None:
    ts = now()
    parent_counts: dict[str, int] = {p["topic_id"]: 0 for p in taxonomy["pillars"]}
    for topic in catalog["topics"].values():
        post_oids = [ObjectId(pid) for pid in topic.get("post_ids") or [] if ObjectId.is_valid(pid)]
        dates = []
        for pid in topic.get("post_ids") or []:
            posted = post_by_id.get(pid, {}).get("posted_at")
            if posted:
                dates.append(posted)
        for bound in (topic.get("first_posted_at"), topic.get("last_posted_at")):
            if bound:
                dates.append(bound)
        parent_id = topic.get("parent_topic_id")
        if parent_id in parent_counts:
            parent_counts[parent_id] += len(post_oids)
        doc = {
            "title": topic["name"],
            "narrative": topic.get("summary") or "",
            "category": topic.get("pillar_id"),
            "type": "passive" if topic.get("seed") else "active",
            "parent_topic_id": parent_id,
            "pillar_id": topic.get("pillar_id"),
            "poi_names": topic.get("poi_names") or [],
            "posts": post_oids,
            "post_count": len(post_oids),
            "first_posted_at": min(dates) if dates else None,
            "last_posted_at": max(dates) if dates else None,
            "updated_at": ts,
            "created_by": CREATED_BY,
            "status": "active",
            "seed": bool(topic.get("seed")),
            "hub_kind": "topic",
        }
        coll.update_one(
            {"topic_id": topic["topic_id"]},
            {
                "$set": doc,
                "$setOnInsert": {
                    "topic_id": topic["topic_id"],
                    "created_at": ts,
                    "pois": [],
                    "keywords": [],
                },
            },
            upsert=True,
        )
    for parent in taxonomy["pillars"]:
        coll.update_one(
            {"topic_id": parent["topic_id"]},
            {"$set": {"post_count": parent_counts.get(parent["topic_id"], 0), "updated_at": ts}},
        )


def main(argv: list[str] | None = None) -> int:
    load_env()
    parser = argparse.ArgumentParser(description="Classify IAF posts into parent/child topics")
    parser.add_argument("--db", default=None)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--limit", type=int, default=0)
    parser.add_argument(
        "--reviewed-on",
        default=None,
        metavar="YYYY-MM-DD",
        help="Only classify posts whose list.reviewed_at falls on this UTC day, and only if they are not already on a topic",
    )
    args = parser.parse_args(argv)

    taxonomy = load_taxonomy()
    db_name = args.db or taxonomy["db"]
    uri = os.getenv("MONGO_URI")
    if not uri:
        print("MONGO_URI missing", file=sys.stderr)
        return 2

    client = MongoClient(uri)
    db = client[db_name]
    existing = list(db["topics"].find({}))
    catalog = catalog_from_mongo(existing, taxonomy)
    assigned = {
        pid
        for topic in catalog["topics"].values()
        for pid in (topic.get("post_ids") or [])
    }
    query: dict[str, Any] = {}
    if args.reviewed_on:
        start, end = utc_day_bounds(args.reviewed_on)
        query["list.reviewed_at"] = {"$gte": start, "$lt": end}
    posts = load_reviewed_posts(db["Posts"], query or None)
    if args.reviewed_on:
        before = len(posts)
        posts = [p for p in posts if p["post_id"] not in assigned]
        print(f"reviewed_on={args.reviewed_on} matched={before} already_assigned={before - len(posts)} to_classify={len(posts)}")
    if args.limit:
        posts = posts[: args.limit]
    post_by_id = {p["post_id"]: p for p in posts}
    print(f"DB={db_name} reviewed_posts={len(posts)} child_topics={len(catalog['topics'])} model={MODEL_NAME}")
    before_counts = {
        tid: len(topic.get("post_ids") or [])
        for tid, topic in catalog["topics"].items()
    }
    before_ids = set(before_counts)

    for i in range(0, len(posts), BATCH_SIZE):
        batch = posts[i : i + BATCH_SIZE]
        print(f"Batch {i // BATCH_SIZE + 1}: {len(batch)} posts")
        payload = classify_batch(batch, catalog, taxonomy)
        stats = apply_assignments(payload, catalog, taxonomy, post_by_id)
        print(f"  created={stats['created']} assigned={stats['assigned']}")

    summary = {
        "db": db_name,
        "dry_run": args.dry_run,
        "posts": len(posts),
        "child_topics": [
            {
                "topic_id": t["topic_id"],
                "title": t["name"],
                "parent": t.get("parent_topic_id"),
                "pillar_id": t.get("pillar_id"),
                "seed": t.get("seed"),
                "post_count": len(t.get("post_ids") or []),
            }
            for t in sorted(catalog["topics"].values(), key=lambda x: x["topic_id"])
        ],
    }
    changed = []
    for topic in sorted(catalog["topics"].values(), key=lambda x: x["topic_id"]):
        before = before_counts.get(topic["topic_id"], 0)
        after = len(topic.get("post_ids") or [])
        if topic["topic_id"] not in before_ids or after != before:
            changed.append(
                {
                    "topic_id": topic["topic_id"],
                    "title": topic["name"],
                    "pillar_id": topic.get("pillar_id"),
                    "parent": topic.get("parent_topic_id"),
                    "new_topic": topic["topic_id"] not in before_ids,
                    "added": after - before,
                    "post_count": after,
                }
            )
    print("DELTA " + json.dumps(changed, indent=2, default=str))
    print(json.dumps(summary, indent=2, default=str))
    if args.dry_run:
        return 0
    write_topics(db["topics"], catalog, taxonomy, post_by_id)
    print("Wrote topics to Mongo")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
