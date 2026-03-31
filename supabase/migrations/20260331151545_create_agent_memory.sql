-- Create table for agent conversation memory
CREATE TABLE IF NOT EXISTS agent_conversations (
    id BIGSERIAL PRIMARY KEY,
    session_id TEXT NOT NULL,
    user_id UUID REFERENCES auth.users(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'tool', 'system')),
    content TEXT NOT NULL,
    tool_calls JSONB,
    tool_call_id TEXT,
    tool_name TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast session retrieval
CREATE INDEX idx_agent_conversations_session ON agent_conversations(session_id, created_at DESC);

-- Index for user conversations
CREATE INDEX idx_agent_conversations_user ON agent_conversations(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE agent_conversations ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own conversations
CREATE POLICY "Users can view own conversations"
    ON agent_conversations
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Service role can do everything (for agent)
CREATE POLICY "Service role has full access"
    ON agent_conversations
    FOR ALL
    USING (auth.role() = 'service_role');
