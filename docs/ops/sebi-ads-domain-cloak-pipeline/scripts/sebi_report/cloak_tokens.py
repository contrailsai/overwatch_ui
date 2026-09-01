"""Known cloaking key/value pairs observed on SEBI scam landers.

Without the identifier, sites often show a dummy watch / exhibition page.
With the correct param, they show fraud investment content.
"""

from __future__ import annotations

# Exact pairs seen so far (trial-and-error list for Playwright later).
KNOWN_CLOAK_PAIRS: list[tuple[str, str]] = [
    ("ad_name", "ind37"),
    ("pEl8X", "tupkapday"),
    ("pEl8X", "nirpokcode"),
    ("pEl8X", "ajtan_Haq"),
    ("pEl8X", "origtupcls"),
    ("adset_name", "ind37"),
    ("pEl8X", "MI1_HT2"),
    ("pEl8X", "tupmz4el"),
    ("pEl8X", "MI2_HT2"),
    ("pEl8X", "tups111"),
    ("pEl8X", "MI2_Haq"),
    ("pEl8X", "tup5min"),
    ("pEl8X", "tupscdn"),
    ("pEl8X", "clstup"),
    ("pEl8X", "sacdpz111"),
    ("pEl8X", "priyadpz111"),
    ("pEl8X", "nirmz4el"),
]

KNOWN_CLOAK_KEYS = frozenset(k.lower() for k, _ in KNOWN_CLOAK_PAIRS)
