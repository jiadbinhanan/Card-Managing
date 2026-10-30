-- ==============================================================================
-- Table: user_push_tokens
-- Purpose: Store Firebase Cloud Messaging (FCM) registration tokens for Android devices
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.user_push_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    fcm_token TEXT NOT NULL UNIQUE,
    device_model TEXT,
    device_platform TEXT DEFAULT 'android',
    app_version TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for speedy queries by user_id
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_user_id ON public.user_push_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_user_push_tokens_fcm_token ON public.user_push_tokens(fcm_token);

-- Enable RLS
ALTER TABLE public.user_push_tokens ENABLE ROW LEVEL SECURITY;

-- Policy: Users can select their own push tokens
CREATE POLICY "Users can view their own push tokens"
    ON public.user_push_tokens
    FOR SELECT
    USING (auth.uid() = user_id);

-- Policy: Users can insert their own push tokens
CREATE POLICY "Users can insert their own push tokens"
    ON public.user_push_tokens
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Policy: Users can update their own push tokens
CREATE POLICY "Users can update their own push tokens"
    ON public.user_push_tokens
    FOR UPDATE
    USING (auth.uid() = user_id);

-- Policy: Users can delete their own push tokens
CREATE POLICY "Users can delete their own push tokens"
    ON public.user_push_tokens
    FOR DELETE
    USING (auth.uid() = user_id);

-- Policy: Service role has full access (for sending push notifications backend)
CREATE POLICY "Service role full access on push tokens"
    ON public.user_push_tokens
    FOR ALL
    USING (auth.jwt() ->> 'role' = 'service_role');
