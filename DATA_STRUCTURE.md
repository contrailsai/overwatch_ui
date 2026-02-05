# Post Data Structure Reference

This document outlines the standard JSON structure for a "Post" (Case) object used across the application (Client & Reviewer views).

## Root Object

```json
{
  "_id": "ObjectId('...')",             // MongoDB ID
  "platform": "instagram",              // "instagram" | "facebook" | "x"
  "code": "C123abc...",                 // Platform specific shortcode/ID
  "post_id": "123456789...",            // Platform specific numeric ID
  "processed": true,                    // Boolean: Has a reviewer completed review?
  "processed_at": "ISO8601 Date",       // When the review was completed

  // 1. Metadata & Internal Tracking
  "metadata": {
    "created_at": "ISO8601 Date",       // DB Ingest Date
    "sourcing_date": "ISO8601 Date",    // When scraper found it
    "updated_at": "ISO8601 Date"
  },

  // 2. User/Profile Info
  "user": {                             // Normalized User Object
    "username": "handle_name",
    "full_name": "Display Name",
    "profile_pic_url": "https://...",
    "is_verified": false
  },
  
  // 3. Post Content
  "caption": "Post text content...",
  "signedImageUrl": "https://...",      // Generated on runtime (not in DB)
  "s3_url": "https://...",              // Permanent S3 link (if stored)
  "post_content": {                     // Raw content structure
    "media_urls": [
       { "s3_url": "...", "thumbnail_url": "..." }
    ]
  },

  // 4. Statistics
  "stats": {
    "like_count": 100,
    "comment_count": 20,
    "share_count": 5,
    "view_count": 500
  },

  // 5. AI Analysis (Automated - Read Only)
  "analysis_results": {
    "risk_score": 85,                   // 0-100
    "category": "Misinformation",       // High-level category
    "categorization_reason": "Summary...", 
    
    "poi_check": {
      "poi_name_found": true,
      "poi_names": ["Mukesh Ambani"],
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
    "aigc_check": {                     // AI Generated Content
       "is_aigc": true,
       "score": 0.98
    }
  },

  // 6. Review Details (Human Verified - Editable)
  "review_details": {
    "threat_score": 90,                 // Final score assigned by reviewer
    "threat_type": "fake_news",         // "scam" | "hate_speech" | "violence" | "fake_news" | "nsfw" | "safe"
    "reviewed_at": "ISO8601 Date"
  },

  // 7. Takedown Status (Workflow)
  "takedown_info": {
    "is_in_takedown": true,             // Boolean: Flagged for takedown workflow?
    "takedown_status": "raised",        // Status enum:
                                        // "raised"      -> Reviewer suggested, waiting for Client
                                        // "requested"   -> Client approved, sent to platform
                                        // "under_review"-> Platform is reviewing
                                        // "resolved"    -> Content removed
                                        // "rejected"    -> Platform refused
    "client_reference_id": "REF-123"    // Optional tracking ID
  }
}
```

## Key Field Mapping for UI

| UI Section | Field Source | Notes |
| :--- | :--- | :--- |
| **Risk Score** | `review_details.threat_score` | Fallback to `analysis_results.risk_score` if unreviewed. |
| **Category** | `review_details.threat_type` | Fallback to `analysis_results.category` (mapped) if unreviewed. |
| **Status Badge** | `processed` | `true` = Reviewed, `false` = Pending. |
| **Takedown State**| `takedown_info.takedown_status` | Determines if Client sees "Approve" button. |
| **POI Badge** | `analysis_results.poi_check` | Used for "POI Detected" flags. |

