-- Add new fields to takedown_cases
ALTER TABLE takedown_cases ADD COLUMN IF NOT EXISTS last_update_message TEXT;
ALTER TABLE takedown_cases ADD COLUMN IF NOT EXISTS last_update_date TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now());
ALTER TABLE takedown_cases ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE takedown_cases ADD COLUMN IF NOT EXISTS platform_email_status TEXT DEFAULT 'pending'; -- pending, sent, replied, failed

-- Create a table for takedown history/timeline
CREATE TABLE IF NOT EXISTS takedown_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    takedown_id UUID REFERENCES takedown_cases(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- e.g., "status_update", "email_sent", "note_added"
    details TEXT,
    created_by UUID REFERENCES auth.users(id), -- Nullable for system actions
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- RLS for history
ALTER TABLE takedown_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable read/write for authenticated users only" ON takedown_history
    FOR ALL USING (auth.role() = 'authenticated');
