# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Overwatch** is a threat detection and case management platform built with Next.js 16. The application enables content moderators to review potentially harmful social media posts, classify threats, assign risk scores, and manage takedown workflows.

## Development Commands

```bash
# Start development server (runs on http://localhost:3000)
npm run dev

# Build for production
npm build

# Start production server
npm start

# Run linter
npm run lint

# Run database migrations (requires DATABASE_URL in .env.local)
node scripts/setup_db.js
node scripts/setup_client_details.js
```

## Environment Setup

Required environment variables in `.env.local`:

```
NEXT_PUBLIC_SUPABASE_URL=<your-supabase-project-url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<your-supabase-anon-key>
DATABASE_URL=<postgresql-connection-string>  # For migrations only

MONGO_URI=<mongodb-connection-string>
MONGO_DB_NAME=<database-name>

AWS_REGION=<aws-region>
AWS_ACCESS_KEY_ID=<access-key>
AWS_SECRET_ACCESS_KEY=<secret-key>
AWS_BUCKET_NAME=<s3-bucket-name>
```

## Architecture Overview

### Tech Stack
- **Framework:** Next.js 16.1.6 with App Router
- **Frontend:** React 19, Tailwind CSS 4, Lucide icons, Recharts
- **Authentication:** Supabase Auth (email/password + OAuth)
- **Databases:**
  - Supabase (PostgreSQL) - User auth, case metadata
  - MongoDB - Raw social media post data
- **Storage:** AWS S3 (presigned URLs with 1-hour expiry)

### Directory Structure

```
/src
├── /app                    # Next.js App Router
│   ├── page.js            # Dashboard with metrics & threat chart
│   ├── actions.js         # Server actions for dashboard data
│   ├── /login             # Authentication page
│   ├── /auth/callback     # OAuth callback handler
│   └── /review-cases      # Content moderation interface (reviewer-only)
├── /components            # Reusable UI components
│   ├── Sidebar.js         # Navigation sidebar
│   ├── MetricsCards.js    # Dashboard KPI cards
│   ├── ThreatChart.js     # Recharts bar chart
│   ├── ProfilePic.js      # Avatar with hash-based colors
│   └── ReviewInterface.js # Infinite scroll case review table
├── /utils
│   ├── /supabase          # Auth & database clients
│   │   ├── server.js      # SSR client with cookie management
│   │   ├── client.js      # Browser client
│   │   └── middleware.js  # Session validation
│   ├── /mongodb
│   │   └── client.js      # MongoDB connection & queries
│   └── /aws
│       └── s3.js          # S3 presigned URL generator
└── proxy.js               # Request middleware for auth refresh

/scripts
├── setup_db.js                    # Run cases_metadata migration
└── setup_client_details.js        # Run client_details migration

/supabase/migrations
├── 20240202_create_cases_metadata.sql    # Main cases table + RLS policies
└── 20240202_create_client_details.sql    # User permissions table + RLS
```

Path alias: `@/*` maps to `./src/*` (configured in jsconfig.json)

### Authentication Flow

1. User submits credentials on `/login` page
2. Server action calls `supabase.auth.signInWithPassword()`
3. Session stored in httpOnly cookies
4. Middleware (`src/proxy.js`) validates session on every request
5. Unauthenticated users redirected to `/login` for protected routes
6. OAuth flows handled via `/auth/callback` (code exchange)

**Role-Based Access:**
- User permissions stored in `client_details` table (`permission` column)
- `/review-cases` requires `permission = 'reviewer'`
- Checked server-side before rendering page

### Database Schema

**Supabase Tables:**

```sql
-- cases_metadata: Reviewed/classified threat cases
id (uuid, PK)
created_at (timestamptz)
platform (text)                    # e.g., "instagram"
threat_type (text)                 # scam, hate_speech, violence, etc.
threat_score (int)                 # 0-100
sourcing_date (timestamptz)
is_in_takedown (boolean)
takedown_status (text)             # None, Reviewer Checked, Sent to Platform, Under Investigation
caption (text)
image_key (text)                   # S3 object key
profile_username (text)
posting_time (timestamptz)

-- client_details: User permissions
id (uuid, FK to auth.users, PK)
permission (text, default 'user')  # 'user' or 'reviewer'
created_at (timestamptz)
```

**MongoDB Collection:**
- **Database:** Specified in `MONGO_DB_NAME`
- **Collection:** `Posts`
- **Purpose:** Raw unreviewed social media posts with media URLs, engagement stats, user verification status
- **Access Pattern:** Paginated queries for review interface (20 items/page)

### Data Flow Patterns

**Server Actions (Next.js 15+ Pattern):**
All data fetching and mutations use `'use server'` directive for type-safe backend operations:

```javascript
// Define server action
export async function getDashboardData() {
  'use server'
  const supabase = await createClient()
  const { data } = await supabase.from('cases_metadata').select('*')
  return processedData
}

// Call from client/server component
const data = await getDashboardData()
```

**Infinite Scroll Implementation:**
- Client-side `IntersectionObserver` detects when last item is visible
- Triggers server action to fetch next page: `getUnreviewedPosts(pageNumber)`
- New posts appended to existing state
- Used in `/review-cases` interface

**S3 Image Handling:**
- Images stored in S3 bucket (path in MongoDB as `s3_url` or `media_urls[]`)
- `utils/aws/s3.js` extracts S3 key from URL (handles AWS default + custom domains)
- Generates presigned URL valid for 1 hour
- Graceful fallback for missing/invalid images

### Key Components

**Sidebar (`components/Sidebar.js`):**
- Collapsible navigation menu
- Routes: Dashboard (`/`), Review Cases (`/review-cases`), Cases List, Takedowns, Settings
- Currently, only Dashboard and Review Cases are implemented

**MetricsCards (`components/MetricsCards.js`):**
- Displays 3 KPIs: Total Cases, Active Takedowns, High Risk count
- Data aggregated from `cases_metadata` table

**ThreatChart (`components/ThreatChart.js`):**
- Recharts bar chart showing threat distribution by type
- Categories: scam, hate_speech, violence, nsfw, fake_news, other

**ReviewInterface (`components/ReviewInterface.js`):**
- Two-panel layout: infinite scroll table (left) + review form (right)
- Fetches unreviewed posts from MongoDB
- Form submits new case to `cases_metadata` table with threat classification

**ProfilePic (`components/ProfilePic.js`):**
- Generates deterministic avatar color based on username hash
- Used for user identification in UI

### Important Patterns & Conventions

**Server-Side Data Fetching:**
- Always use server components for initial data loads
- Server actions for mutations and user-triggered fetches
- Supabase client created per-request with SSR cookie handling

**Error Handling:**
- Supabase queries return `{ data, error }` - always check error
- MongoDB connection uses singleton pattern with error logging
- S3 presigned URL generation wrapped in try/catch

**Type Safety:**
- No TypeScript - relies on JSDoc comments and runtime validation
- Path aliases prevent relative import confusion

**Styling:**
- Tailwind CSS 4 utility classes
- Custom color palette for threat severity indicators
- Responsive design with mobile-first approach

### Placeholder Routes

The following routes exist in Sidebar navigation but are NOT implemented:
- `/cases` - Full case list view
- `/takedowns` - Takedown management dashboard
- `/settings` - User/system settings

## Database Migrations

Run migrations after setting up `.env.local` with `DATABASE_URL`:

```bash
# Create cases_metadata table with RLS policies
node scripts/setup_db.js

# Create client_details table for user permissions
node scripts/setup_client_details.js
```

**Row-Level Security (RLS) Policies:**
- `cases_metadata`: Read access for all, insert/update for authenticated users only
- `client_details`: Users can only view their own permission record

## Integration Notes

**Supabase:**
- All queries use async/await pattern
- Client created per-request to maintain session context
- Auth middleware refreshes tokens automatically

**MongoDB:**
- Connection pooled via singleton pattern in `utils/mongodb/client.js`
- Database name specified via environment variable
- Queries use native MongoDB Node.js driver (v7.0.0)

**AWS S3:**
- Presigned URLs valid for 3600 seconds (1 hour)
- SDK v3 used: `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
- URL parsing handles multiple S3 URL formats

## Security Considerations

- All routes protected by middleware auth check
- RLS policies enforce database-level access control
- S3 images served via time-limited presigned URLs
- Credentials stored in `.env.local` (gitignored)
- No plaintext credentials in codebase
