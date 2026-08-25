"""Hosts to skip when harvesting ad destinations for domain analysis."""

from __future__ import annotations

# Retail / well-known brand eTLD+1 — often spoofed in caption, not the scam lander.
MAJOR_BRAND_HOSTS = frozenset(
    {
        "amazon.in",
        "amazon.com",
        "amazon.co.uk",
        "amazon.com.au",
        "amazon.de",
        "amazon.ca",
        "amazon.co.jp",
        "flipkart.com",
        "myntra.com",
        "ajio.com",
        "nykaa.com",
        "apple.com",
        "microsoft.com",
        "bing.com",
        "yahoo.com",
        "walmart.com",
        "ebay.com",
        "etsy.com",
        "shopify.com",
        "paytm.com",
        "phonepe.com",
        "razorpay.com",
        "stripe.com",
        "paypal.com",
        "netflix.com",
        "spotify.com",
        "airbnb.com",
        "booking.com",
        "tripadvisor.com",
        "sapnaonline.com",
    }
)

CDN_SUFFIXES = (
    "amazonaws.com",
    "cloudfront.net",
    "googleusercontent.com",
    "fbcdn.net",
    "akamaihd.net",
    "cloudflare.com",
)


def is_cdn_host(domain_name: str) -> bool:
    d = (domain_name or "").lower()
    return any(d == s or d.endswith("." + s) for s in CDN_SUFFIXES)


def should_skip_domain(domain_name: str, *, is_social: bool) -> tuple[bool, str | None]:
    """Return (skip, reason)."""
    d = (domain_name or "").lower().strip()
    if not d:
        return True, "empty"
    if is_social:
        return True, "social_or_tracker"
    if is_cdn_host(d):
        return True, "cdn"
    if d in MAJOR_BRAND_HOSTS:
        return True, "major_brand"
    return False, None
