# Post Data Structure Reference

This document outlines the standard JSON structure for a "Post" (Case) object used across the application. This structure reflects the data as stored in MongoDB.

## Root Object

```json
{
  "_id": { "$oid": "..." },             // MongoDB Object ID
  "platform": "instagram",              // "instagram" | "facebook" | "x" | "reddit"
  "code": "CRtzgj0Bsb2",                // Platform specific shortcode (e.g. Instagram shortcode)
  "post_id": "CRtzgj0Bsb2",             // Often same as code
  "id": "2624980695676012278",          // Platform specific numeric ID (string)
  "type": "post",                       // Object type
  "processed": false,                   // Boolean: Has a reviewer completed review?
  "processed_at": null,                 // ISO Date or null
  "url": "https://...",                 // Direct link to post
  "original_url": "https://...",        // Original source URL
  "s3_stored": true,                    // Flag for S3 media storage
  "sourcing_date": { "$date": "..." },  // Top-level sourcing date
  "taken_at": 1627142105,               // Unix timestamp of post
  "timestamp": null,                    // Optional timestamp
  "media_urls": [                       // Top-level media references
    {
      "original_url": "...",
      "s3_url": "..."
    }
  ],

  // 1. Metadata & Internal Tracking
  "metadata": {
    "created_at": { "$date": "..." },   // DB Ingest Date
    "sourcing_date": { "$date": "..." },// When scraper found it
    "updated_at": { "$date": "..." },
    "schema_version": 1,
    "update_history": [
       { "updated_at": { "$date": "..." }, "updated_by": "...", "changes_summary": "..." }
    ]
  },

  // 2. User/Profile Info (Normalized in multiple fields for compatibility)
  "user": {                             
    "id": "9161022058",
    "username": "delta_wise_",
    "full_name": "Abhijeet Bhaware",
    "profile_pic_url": "https://...",
    "is_verified": true
  },
  "author": {                           // Basic author info
    "name": "Abhijeet Bhaware",
    "url": "https://instagram.com/..."
  },
  "profile": {                          // Platform specific profile details
    "platform_user_id": "9161022058",
    "username": "delta_wise_",
    "display_name": "Abhijeet Bhaware",
    "profile_url": "https://...",
    "is_verified": true
  },
  
  // 3. Post Content
  "caption": "Post text content...",
  "content": "Post text content...",    // Usually matches caption
  "post_content": {                     // Detailed content structure
    "caption": "...",
    "media_urls": [
       { "type": "image", "s3_url": "...", "original_url": "..." }
    ],
    "post_type": "feed",
    "language": null
  },

  // 4. Statistics & Engagement
  "stats": {
    "like_count": 23,
    "comment_count": 0,
    "view_count": null,
    "play_count": null
  },
  "engagement": {                       // Detailed engagement metrics
    "likes": 23,
    "comments": 0,
    "shares": 0,
    "posted_at": { "$date": "..." }
  },

  // 5. AI Analysis (Automated - Read Only)
  "analysis_results": {
    "risk_score": 85,                   // 0-100
    "category": "Misinformation",       // High-level category: "Misinformation" | "Hate Speech" | "NSFW" | etc.
    "categorization_reason": "Summary...", 
    
    "poi_check": {
      "poi_name_found": true,
      "poi_names": ["Person Name"],
      "face_present": false
    },
    "truth_check": {
      "is_credible": false,
      "explanation": "Debunking details...",
      "sources": ["url1", "url2"]
    },
    "nsfw_check": {
      "is_safe": true,
      "category": "safe"
    },
    "hate_speech_check": {
      "is_safe": false,
      "risk_level": "High"
    },
    "aigc_check": {                     // AI Generated Content Detection
       "is_aigc": true,
       "score": 0.98
    }
  },

  // 6. Review Details (Human Verified - Editable)
  "review_details": {
    "threat_score": 90,                 // Final score assigned by reviewer
    "threat_type": "fake_news",         // "scam" | "hate_speech" | "violence" | "fake_news" | "nsfw" | "safe"
    "notes": "Optional reviewer notes",
    "reviewed_at": { "$date": "..." }
  },

  // 7. Takedown Status & Refs
  "takedown_info": {
    "is_in_takedown": false,            // Boolean: Flagged for takedown workflow?
    "takedown_status": "None",          // "None" | "raised" | "requested" | "under_review" | "resolved" | "rejected"
    "client_reference_id": null
  },
  "supabase_refs": {                    // References to Postgres/Supabase records
    "case_id": null,
    "alert_ids": [],
    "chat_thread_ids": []
  },
  "result_origin": {                    // Sourcing provenance
    "type": "instagram_passive_listener",
    "source_url": "..."
  }
}
```

> **Note on Dates:** Most dates in the database are stored in **MongoDB Extended JSON** format: `{"$date": "ISO-8601-STRING"}`. Ensure processing logic accounts for this object structure vs. a raw string.

## Key Field Mapping for UI

| UI Section | Field Source | Notes |
| :--- | :--- | :--- |
| **Risk Score** | `review_details.threat_score` | Fallback to `analysis_results.risk_score` if unreviewed. |
| **Category** | `review_details.threat_type` | Fallback to `analysis_results.category` (mapped) if unreviewed. |
| **Status Badge** | `processed` | `true` = Reviewed, `false` = Pending. |
| **Takedown State**| `takedown_info.takedown_status` | Determines if Client sees "Approve" button (if "raised"). |
| **POI Badge** | `analysis_results.poi_check` | Used for "POI Detected" flags. |
| **Media Display** | `post_content.media_urls` | Uses `s3_url` if available, fallback to `original_url`. |
| **Numeric ID** | `id` | Use this for platform-specific lookups. |

