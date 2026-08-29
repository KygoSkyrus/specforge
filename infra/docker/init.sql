-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- RLS helper: set org context per transaction
-- Usage: SET LOCAL app.org_id = 'org_xxx';
