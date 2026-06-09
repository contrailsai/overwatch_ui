# S3 CORS for presigned direct uploads

Browser uploads use presigned `PUT` URLs so file bytes go **client → S3** without passing through Vercel. The bucket must allow cross-origin `PUT` and `HEAD` from the app origins.

## Apply on AWS

In S3 → bucket → **Permissions** → **Cross-origin resource sharing (CORS)**, add or merge:

```json
[
  {
    "AllowedOrigins": [
      "http://localhost:3000",
      "https://YOUR_PRODUCTION_DOMAIN",
      "https://YOUR_PREVIEW_DOMAIN.vercel.app"
    ],
    "AllowedMethods": ["PUT", "HEAD", "GET"],
    "AllowedHeaders": ["Content-Type", "x-amz-*"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Replace `YOUR_PRODUCTION_DOMAIN` and preview hostnames with your Vercel production URL and any stable preview URLs reviewers use.

## CLI (optional)

```bash
aws s3api put-bucket-cors --bucket YOUR_BUCKET_NAME --cors-configuration file://cors.json
```

## Verify

1. From the app, upload a small image on `/review-cases` (detail view).
2. In DevTools → Network, confirm the `PUT` goes to `*.amazonaws.com` and returns `200`.
3. If CORS is missing, the browser blocks the `PUT` with a CORS error before S3 responds.

## Orphan objects

If a user gets a presigned URL but never completes `confirm`, an object may remain in S3 under `case-images/`, `takedown-cases/`, or `{Platform}_data/`. Consider a lifecycle rule to expire unreferenced prefixes after N days, or periodic cleanup.
