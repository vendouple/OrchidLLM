# OrchidLLM - Next.js Backend

A Next.js backend for OrchidLLM with secure API key management, NVIDIA NIM integration, and multi-provider support.

## Features

Migrated to next.js

## API Endpoints

> [!IMPORTANT]
>API endpoints are currently only used for testing and not for public. You cannot get an api key anywhere right >now. Please instead use the dashboard to use the features


### Chat Completions

```
POST /api/chat/completions
```

### Image Generation

```
POST /api/images/generations
```

### Video Generation

```
POST /api/video/generations
```

### Audio Generation

```
POST /api/audio/speech
```

### Audio Transcription

```
POST /api/audio/transcriptions
```

### Models

```
GET /api/models
```

## Setup

### 1. Install Dependencies

```bash
cd onellm-nextjs
npm install
```

### 2. Configure Environment Variables

Copy `.env.example` to `.env.local` and fill in your values:

```bash
cp .env.example .env.local
```

Required environment variables:

- `POLLINATIONS_API_KEY` - Your Pollinations API key
- `NVIDIA_API_KEY` - Your NVIDIA NIM API key
- `DATABASE_URL` - PlanetScale database URL

### 3. Set Up Database

Run the schema in PlanetScale:

```bash
# Connect to PlanetScale and run schema.sql
```

### 4. Run Development Server

```bash
npm run dev
```

### 5. Deploy to Vercel

```bash
vercel
```

## Usage Examples

### Demo Mode

```bash
curl -X POST http://localhost:3000/api/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: nobindes_1712345678901_abc123" \
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### BPOLLY Mode

```bash
curl -X POST http://localhost:3000/api/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-API-Key: BPOLLYKEY_sk_MuVO1Pw..." \
  -d '{
    "model": "openai",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

### NVIDIA NIM

```bash
curl -X POST http://localhost:3000/api/chat/completions \
  -H "Content-Type: application/json" \
  -H "X-Session-ID: nobindes_1712345678901_abc123" \
  -d '{
    "model": "nvidia/llama-3.1-nemotron-70b-instruct",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'
```

## Project Structure

```
onellm-nextjs/
├── app/
│   ├── api/
│   │   ├── chat/completions/route.ts
│   │   ├── images/generations/route.ts
│   │   ├── video/generations/route.ts
│   │   ├── audio/speech/route.ts
│   │   ├── audio/transcriptions/route.ts
│   │   └── models/route.ts
│   └── ...
├── lib/
│   ├── types.ts
│   ├── keys.ts
│   ├── usage.ts
│   └── db.ts
├── public/
│   ├── models.json
│   └── suggestionstrip.json
├── package.json
├── next.config.js
├── tailwind.config.js
├── vercel.json
└── schema.sql
```

## Vercel Configuration

### Environment Variables

Set these in your Vercel project settings:

- `POLLINATIONS_API_KEY`
- `NVIDIA_API_KEY`
- `DATABASE_URL`

### Add-ons

1. **Vercel KV** - For demo mode usage tracking
2. **PlanetScale** - For global API key management

## License

MIT
