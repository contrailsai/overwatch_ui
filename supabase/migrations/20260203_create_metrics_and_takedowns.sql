-- Create daily_metrics table
CREATE TABLE IF NOT EXISTS daily_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL,
    platform TEXT NOT NULL,
    total_reviewed INTEGER DEFAULT 0,
    
    -- Risk Ranges
    risk_high_count INTEGER DEFAULT 0,   -- > 80
    risk_medium_count INTEGER DEFAULT 0, -- 50-80
    risk_low_count INTEGER DEFAULT 0,    -- < 50
    
    -- Threat Types
    threat_safe_count INTEGER DEFAULT 0,
    threat_scam_count INTEGER DEFAULT 0,
    threat_hate_speech_count INTEGER DEFAULT 0,
    threat_violence_count INTEGER DEFAULT 0,
    threat_fake_news_count INTEGER DEFAULT 0,
    threat_nsfw_count INTEGER DEFAULT 0,
    threat_other_count INTEGER DEFAULT 0,
    
    -- Actions
    takedowns_initiated INTEGER DEFAULT 0,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Ensure one row per platform per day
    UNIQUE(date, platform)
);

-- Create takedown_cases table
CREATE TABLE IF NOT EXISTS takedown_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    mongo_post_id TEXT NOT NULL UNIQUE, -- Reference to MongoDB document _id
    post_platform_id TEXT NOT NULL,     -- The platform's native ID (e.g. tweet ID)
    platform TEXT NOT NULL,
    
    -- Status Tracking
    status TEXT NOT NULL DEFAULT 'initiated', -- initiated, processing, resolved, rejected
    email_sent BOOLEAN DEFAULT FALSE,
    platform_replied BOOLEAN DEFAULT FALSE,
    
    -- Evidence
    s3_evidence_path TEXT,
    
    -- Metadata
    risk_score INTEGER,
    threat_type TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS (Row Level Security) - Optional but good practice, keeping open for server actions for now
ALTER TABLE daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE takedown_cases ENABLE ROW LEVEL SECURITY;

-- Create policies (simplified for internal tool usage)
CREATE POLICY "Enable read/write for authenticated users only" ON daily_metrics
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Enable read/write for authenticated users only" ON takedown_cases
    FOR ALL USING (auth.role() = 'authenticated');
