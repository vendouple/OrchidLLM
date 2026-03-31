# NavyAI API Overview

Base URL: <https://api.navy/v1>  

## Authentication

- Header: `Authorization: Bearer YOUR_API_KEY`
- For Anthropic‑style calls you can also use `x-api-key: YOUR_API_KEY`.

## Core Endpoints

### 1. Chat Completions

`POST /v1/chat/completions`  

```json
{
  "model": "gpt-5.2",               // any model ID
  "messages": [
    {"role":"system","content":"You are helpful."},
    {"role":"user","content":"Explain recursion."}
  ],
  "max_tokens": 1024,
  "temperature": 0.7,
  "stream": false
}
Supports vision (image_url), tool calling, streaming, stop sequences, etc.
2. Anthropic Messages (Claude)
POST /v1/messages

{
  "model": "claude-sonnet-4.5",
  "messages": [{"role":"user","content":"Write a poem."}],
  "max_tokens": 1024,
  "temperature": 0.8,
  "stream": false
}
Auth via x-api-key or Authorization.
3. Embeddings
POST /v1/embeddings

{
  "model": "text-embedding-3-large",
  "input": ["First sentence.", "Second sentence."]
}
4. Image Generation
POST /v1/images/generations

{
  "model": "dall-e-3",
  "prompt": "A futuristic city at sunset",
  "size": "1024x1024",
  "style": "vivid",
  "sync": true
}
5. Text‑to‑Speech
POST /v1/audio/speech

{
  "model": "tts-1",
  "input": "Hello, world!",
  "voice": "alloy",
  "response_format": "mp3"
}
6. Speech‑to‑Text
POST /v1/audio/transcriptions

multipart/form-data with file (audio ≤25 MB) and optional language.
7. Moderations
POST /v1/moderations

{
  "input": "I want to hurt someone."
}
8. List Models
GET /v1/models – no auth needed.

9. Usage Stats
GET /v1/usage – requires auth.

Common Parameters (where applicable)
max_tokens, temperature, top_p, top_k
stop, seed, frequency_penalty, presence_penalty
reasoning_effort (none‑xhigh)
response_format (json_object, json_schema, text)
Streaming
Add "stream": true to get Server‑Sent Events (SSE) where each delta is sent as:

data: {"id":"...","choices":[{"delta":{"content":"..."},"index":0}]}
Pricing
Token‑credit system; each model has a multiplier. Check /pricing for exact rates.

Integration Tips
Swap any OpenAI‑compatible client’s base URL to https://api.navy/v1.
For Claude‑compatible tools set ANTHROPIC_BASE_URL=https://api.navy and ANTHROPIC_API_KEY=sk-navy-....
Use the same JSON schema as the OpenAI API; NavyAI handles conversion internally.


ADDITIONAL:
Job Polling
If you create an async generation job, poll it through GET /v1/images/generations/:id.

#Use it when
You requested a video
You used a model that returns a job ID instead of a final asset
You want to keep a loading UI in sync with generation status
#Code examples
Bash
Python
JavaScript

Copy
curl https://api.navy/v1/images/generations/job_abc123def456 \
  -H "Authorization: Bearer sk-navy-YOUR_KEY"
#Response statuses
queued — Job is waiting to be processed
in_progress — Job is currently being generated
completed — Job finished; the result field contains the data
failed — Job failed; the error field contains details
#Notes
Poll every 3–5 seconds. Video generation can take up to 10 minutes.
Jobs expire after 10 minutes.
Store job IDs so refreshes do not lose in-flight work.


Text-to-Speech
POST /v1/audio/speech converts text into spoken audio.

#Use it when
You need voice playback in an app
You want narration, announcements, or assistant voice output
#Code examples
Bash
Python
JavaScript

Copy
curl -X POST https://api.navy/v1/audio/speech \
  -H "Authorization: Bearer sk-navy-YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o-mini-tts",
    "voice": "alloy",
    "input": "Welcome to the NavyAI platform."
  }' \
  --output speech.mp3
#Parameters
model (string, required) — tts-1, tts-1-hd, eleven_v3, gpt-4o-mini-tts, gemini-2.5-flash-preview-tts
input (string, required) — Text to convert (max 4096 chars for ElevenLabs)
voice (string, required) — Voice ID. OpenAI: alloy, ash, coral, echo, fable, nova, onyx, sage, shimmer. ElevenLabs: alice, aria, brian, charlie, jessica, etc. Gemini: Puck, Charon, Kore, Fenrir, Aoede
speed (number, optional) — 0.25–4.0 (OpenAI only)
response_format (string, optional) — mp3, opus, aac, flac
#Notes
Response formats depend on model capabilities
Keep text chunks moderate if you need responsive playback



Speech-to-Text
POST /v1/audio/transcriptions converts uploaded audio into text.

#Use it when
You want voice notes or call transcripts
You need captions or searchable media
#Code examples
Bash
Python
JavaScript

Copy
curl -X POST https://api.navy/v1/audio/transcriptions \
  -H "Authorization: Bearer sk-navy-YOUR_KEY" \
  -F file="@/path/to/audio.mp3" \
  -F model="whisper-1"
#Parameters
model (string, required) — whisper-1, gpt-4o-transcribe, scribe_v2
file (file, required) — Audio file (max 25MB)
language (string, optional) — ISO-639-1 language code
response_format (string, optional) — json, text, srt, vtt, verbose_json
#Notes
Pair this with embeddings or chat completions for analysis workflows


# RATE LIMITS
PER MIDNIGHT UTC IT WILL RESET.
IT IS COUNTED BY TOKENS. YOU GET 150K TOKENS A DAY
MAX REQUESTS PER MINUTE IS 20


GET /v1/models returns the currently available model catalog. No authentication is required.

#What the response includes
id — Model identifier used in API requests
owned_by — Provider name (e.g. openai, anthropic, google)
endpoint — Which API endpoint this model works with
token_multiplier — How many tokens count against your daily limit per actual token
premium — Whether this model requires a paid plan
required_plan — Minimum plan tier needed (if premium)
#Code examples
Bash
Python
JavaScript

Copy
curl https://api.navy/v1/models
#Why it matters
Populate model selectors dynamically
Hide plan-locked models for the wrong tier
Show endpoint compatibility before a request is sent



POLL NAVY:
Usage Statistics
GET /v1/usage gives you your current usage view for tokens and request activity.

#Use it when
You need account-level usage numbers in your app
You want to warn users before they hit plan limits
You are building your own lightweight usage dashboard
#Code examples
Bash
Python
JavaScript

Copy
curl https://api.navy/v1/usage \
  -H "Authorization: Bearer sk-navy-YOUR_KEY"

{"plan":"Free","limits":{"tokens_per_day":150000,"rpm":20},"usage":{"tokens_used_today":0,"tokens_remaining_today":150000,"percent_used":0,"resets_at_utc":"2026-03-31T00:00:00.000Z","resets_in_ms":39509557},"rate_limits":{"per_minute":{"limit":20,"used":0,"remaining":20,"resets_in_ms":0}},"server_time_utc":"2026-03-30T13:01:30.443Z"}