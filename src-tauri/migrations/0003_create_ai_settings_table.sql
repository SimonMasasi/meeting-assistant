CREATE TABLE ai_settings (
    id            INTEGER PRIMARY KEY CHECK (id = 1),

    -- Speech-to-text (transcription) provider
    stt_provider  TEXT NOT NULL DEFAULT '',
    stt_api_key   TEXT NOT NULL DEFAULT '',
    stt_model     TEXT NOT NULL DEFAULT '',
    stt_base_url  TEXT NOT NULL DEFAULT '',

    -- Text-to-speech provider
    tts_provider  TEXT NOT NULL DEFAULT '',
    tts_api_key   TEXT NOT NULL DEFAULT '',
    tts_model     TEXT NOT NULL DEFAULT '',
    tts_base_url  TEXT NOT NULL DEFAULT '',

    -- Chat / summarization (LLM) provider
    chat_provider TEXT NOT NULL DEFAULT '',
    chat_api_key  TEXT NOT NULL DEFAULT '',
    chat_model    TEXT NOT NULL DEFAULT '',
    chat_base_url TEXT NOT NULL DEFAULT ''
);
