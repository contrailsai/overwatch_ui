-- Create takedown_documents table
CREATE TABLE IF NOT EXISTS takedown_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    takedown_id UUID REFERENCES takedown_cases(id) ON DELETE CASCADE,
    file_name TEXT NOT NULL,
    file_type TEXT,
    file_size BIGINT,
    s3_key TEXT NOT NULL,
    uploaded_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE takedown_documents ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read/write for authenticated users only" ON takedown_documents
    FOR ALL USING (auth.role() = 'authenticated');
