# Next.js Migration Plan for OrchidLLM

## Overview

Migrate the current client-side only application to Next.js with server-side API routes for secure key management and NVIDIA NIM integration.

## Current Architecture

- **Frontend**: Static HTML (`index.html`) with vanilla JS (`index.js`) and CSS (`styles.css`)
- **API Layer**: `app.js` exports helper functions calling `https://gen.pollinations.ai` directly from browser
- **API Key Exposure**: Demo key `pk_BU8jPqG7RBj8yOxh` hardcoded in `app.js:4`
- **No Backend**: All API calls happen client-side, exposing keys

## API Key Format System

### Key Format

All keys use the `nobindes_` prefix with encrypted embedded permissions.

| Key Type | Format | Description |
|----------|--------|-------------|
| **Demo Session** | `nobindes_1712345678901_abc123` | Short format, auto-generated, limited tracking |
| **Global API Key** | `nobindes_1232131029810abc...` | Long format with encrypted permissions |
| **BPOLLYKEY** | `BPOLLYKEY_sk_MuVO1Pw....` | User's own Pollinations key (stripped before use) |

### Key Structure (Database-Stored Permissions)

For Global API Keys, permissions are stored in a database (Vercel KV or PlanetScale) and looked up by key:

```typescript
// Database schema (Vercel KV or PlanetScale)
interface ApiKeyRecord {
  key: string;                    // The API key (indexed)
  permissions: {
    providers: ('nvidia' | 'pollinations' | 'openai')[];
    rateLimit: number;            // requests per day
    models: string[] | '*';       // allowed models or wildcard
    expiresAt?: number;           // optional expiration timestamp
  };
  createdAt: number;
  createdBy: string;
  lastUsed?: number;
  usageCount: number;
}

// Example key generation
function generateApiKey(): string {
  const randomBytes = crypto.randomBytes(32).toString('hex');
  return `nobindes_${randomBytes}`;
}

// Example key validation (database lookup)
async function validateApiKey(key: string): Promise<ApiKeyRecord | null> {
  if (!key.startsWith('nobindes_')) return null;
  
  // Look up in database
  const record = await db.apiKeys.findOne({ key });
  if (!record) return null;
  
  // Check expiration
  if (record.permissions.expiresAt && record.permissions.expiresAt < Date.now()) {
    return null;
  }
  
  // Update last used
  await db.apiKeys.update({ key }, { lastUsed: Date.now(), $inc: { usageCount: 1 } });
  
  return record;
}
```

### Database Schema (PlanetScale MySQL)

```sql
CREATE TABLE api_keys (
  id INT AUTO_INCREMENT PRIMARY KEY,
  key VARCHAR(64) NOT NULL UNIQUE,
  providers JSON NOT NULL,        -- ['nvidia', 'pollinations']
  rate_limit INT NOT NULL DEFAULT 100,
  models JSON,                    -- ['*'] or specific models
  expires_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  last_used TIMESTAMP NULL,
  usage_count INT DEFAULT 0
);

CREATE INDEX idx_api_keys_key ON api_keys(key);
```

### Key Detection Logic

```typescript
function detectKeyType(apiKey: string): { type: string; payload?: KeyPayload; actualKey?: string } {
  // BPOLLYKEY: User's own Pollinations key
  if (apiKey.startsWith('BPOLLYKEY_')) {
    return {
      type: 'bpolly',
      actualKey: apiKey.replace('BPOLLYKEY_', '')
    };
  }
  
  // nobindes keys
  if (apiKey.startsWith('nobindes_')) {
    const keyBody = apiKey.replace('nobindes_', '');
    
    // Demo session: short format with underscore (timestamp_random)
    if (keyBody.includes('_') && keyBody.length < 30) {
      return { type: 'demo' };
    }
    
    // Global API key: long format, look up in database
    const record = await validateApiKey(apiKey);
    if (record) {
      return { type: 'global', payload: record.permissions };
    }
  }
  
  // Legacy: direct Pollinations key
  if (apiKey.startsWith('sk_')) {
    return { type: 'bpolly', actualKey: apiKey };
  }
  
  return { type: 'unknown' };
}
```

## New Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Client (Browser)                              │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Next.js Frontend                                        │    │
│  │  - Session ID (auto-generated UUID in localStorage)      │    │
│  │  - React Components (converted from HTML)                │    │
│  │  - State Management (Zustand/React Context)              │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              Vercel Server (orchidllm.vercel.app)                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  API Routes (/api/*)                                     │    │
│  │  - /api/chat/completions                                 │    │
│  │  - /api/images/generations                               │    │
│  │  - /api/video/generations                                │    │
│  │  - /api/audio/speech                                     │    │
│  │  - /api/audio/transcriptions                             │    │
│  │  - /api/models                                           │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Usage Tracker (Vercel KV)                               │    │
│  │  - Per session ID tracking                               │    │
│  │  - Per IP tracking (fallback)                            │    │
│  │  - 20 requests/day limit for demo                        │    │
│  └─────────────────────────────────────────────────────────┘    │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  Environment Variables                                   │    │
│  │  - POLLINATIONS_API_KEY (pl_...)                         │    │
│  │  - NVIDIA_API_KEY (nvapi_...)                            │    │
│  │  - Future: OPENAI_API_KEY, ANTHROPIC_API_KEY             │    │
│  └─────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      External APIs                               │
│  ┌─────────────────────┐  ┌─────────────────────┐              │
│  │  Pollinations AI    │  │  NVIDIA NIM         │              │
│  │  gen.pollinations.ai│  │  integrate.api.nvidia.com          │
│  └─────────────────────┘  └─────────────────────┘              │
└─────────────────────────────────────────────────────────────────┘
```

## API Modes

### 1. Demo Mode (Default)

- User visits `orchidllm.vercel.app`
- Frontend generates session ID: `nobindes_${timestamp}_${random}`
- Session ID stored in `localStorage`
- **Multi-factor tracking** to prevent abuse:
  - Primary: Session UUID in localStorage
  - Secondary: IP address (from `x-forwarded-for`)
  - Tertiary: Browser fingerprint hash (canvas, WebGL, timezone)
- Composite key: `hash(sessionId + ip + fingerprint)`
- Server tracks usage per composite key (20 requests/day)
- Uses server-side `POLLINATIONS_API_KEY`

### 2. BPOLLY Mode (Bring Your Own Pollinations)

- User provides their own Pollinations API key
- **Key format**: `BPOLLYKEY_sk_MuVO1Pw....`
- Server strips `BPOLLYKEY_` prefix before forwarding to Pollinations
- No usage tracking (unlimited)
- Direct passthrough to Pollinations

### 3. NVIDIA NIM Mode

- User selects NVIDIA model (prefixed with `nvidia/`)
- Uses server-side `NVIDIA_API_KEY`
- Tracked like demo mode

### 4. Global API Key Mode (Future)

- Single key for all providers: `nobindes_global_xxxxxxxxxxxx`
- OpenAI-compatible structure
- Provider routing via model name prefix:
  - `nvidia/llama-3.1-nemotron-70b-instruct` → NVIDIA
  - `pollinations/flux` → Pollinations
  - `openai/gpt-4` → OpenAI (future)

## Request Flow Examples

### Demo Mode Request

```http
POST /api/chat/completions HTTP/1.1
Host: orchidllm.vercel.app
Content-Type: application/json
X-Session-ID: nobindes_1712345678901_abc123

{
  "model": "openai",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```

### BPOLLY Mode Request

```http
POST /api/chat/completions HTTP/1.1
Host: orchidllm.vercel.app
Content-Type: application/json
X-API-Key: BPOLLYKEY_sk_MuVO1Pw....

{
  "model": "openai",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```

### NVIDIA NIM Request

```http
POST /api/chat/completions HTTP/1.1
Host: orchidllm.vercel.app
Content-Type: application/json
X-Session-ID: nobindes_1712345678901_abc123

{
  "model": "nvidia/llama-3.1-nemotron-70b-instruct",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```

### Global API Key Request

```http
POST /api/chat/completions HTTP/1.1
Host: orchidllm.vercel.app
Content-Type: application/json
Authorization: Bearer nobindes_1232131029810abc...

{
  "model": "nvidia/llama-3.1-nemotron-70b-instruct",
  "messages": [{"role": "user", "content": "Hello"}],
  "stream": true
}
```

## Project Structure

```
onellm-nextjs/
├── app/
│   ├── layout.tsx              # Root layout with theme provider
│   ├── page.tsx                # Main chat UI
│   ├── globals.css             # Global styles (converted from styles.css)
│   └── api/
│       ├── chat/
│       │   └── route.ts        # POST /api/chat/completions
│       ├── images/
│       │   └── route.ts        # POST /api/images/generations
│       ├── video/
│       │   └── route.ts        # POST /api/video/generations
│       ├── audio/
│       │   └── route.ts        # POST /api/audio/speech
│       ├── transcriptions/
│       │   └── route.ts        # POST /api/audio/transcriptions
│       └── models/
│           └── route.ts        # GET /api/models
├── components/
│   ├── Sidebar.tsx             # Chat history sidebar
│   ├── ChatArea.tsx            # Main chat interface
│   ├── ModelSelector.tsx       # Model dropdown
│   ├── MessageBubble.tsx       # Chat message component
│   ├── Composer.tsx            # Message input area
│   ├── SettingsDialog.tsx      # Settings modal
│   ├── ImageViewer.tsx         # Image viewer modal
│   └── ThemeProvider.tsx       # Theme context provider
├── lib/
│   ├── api.ts                  # API client functions
│   ├── nvidia.ts               # NVIDIA NIM client
│   ├── pollinations.ts         # Pollinations client
│   ├── usage.ts                # Usage tracking (Vercel KV)
│   ├── session.ts              # Session ID management
│   └── types.ts                # TypeScript types
├── public/
│   ├── models.json             # Model catalog (keep existing)
│   ├── suggestionstrip.json    # Suggestions (keep existing)
│   └── favicon.ico
├── package.json
├── tsconfig.json
├── next.config.js
├── tailwind.config.js
└── vercel.json
```

## API Route Implementations

### `/api/chat/completions` (route.ts)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { getUsage, incrementUsage } from '@/lib/usage';
import { fetchNVIDIAChat, fetchPollinationsChat } from '@/lib/api';

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const POLLINATIONS_BASE = 'https://gen.pollinations.ai/v1';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { model, messages, stream, ...rest } = body;
    
    // Check for BYOP mode
    const userApiKey = request.headers.get('X-API-Key');
    if (userApiKey && userApiKey.startsWith('sk_')) {
      // BYOP mode - direct passthrough, no tracking
      return fetchPollinationsChat(body, userApiKey);
    }
    
    // Demo/NVIDIA mode - check usage
    const sessionId = request.headers.get('X-Session-ID');
    const clientIP = request.headers.get('x-forwarded-for') || 'unknown';
    
    const usage = await getUsage(sessionId || clientIP);
    if (usage >= 20) {
      return NextResponse.json(
        { error: 'Demo limit reached (20 requests/day). Please use BYOP mode.' },
        { status: 429 }
      );
    }
    
    // Increment usage
    await incrementUsage(sessionId || clientIP);
    
    // Route based on model prefix
    if (model.startsWith('nvidia/')) {
      const actualModel = model.replace('nvidia/', '');
      return fetchNVIDIAChat({ ...body, model: actualModel });
    }
    
    // Default: Pollinations
    return fetchPollinationsChat(body, process.env.POLLINATIONS_API_KEY);
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
```

### `/api/models` (route.ts)

```typescript
import { NextResponse } from 'next/server';
import localModels from '@/public/models.json';

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';

export async function GET() {
  try {
    // Fetch NVIDIA models
    const nvidiaRes = await fetch(`${NVIDIA_BASE}/models`, {
      headers: {
        'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`,
      },
    });
    
    const nvidiaData = await nvidiaRes.json();
    const nvidiaModels = (nvidiaData.data || []).map((m: any) => ({
      id: `nvidia/${m.id}`,
      name: `NVIDIA ${m.id}`,
      desc: 'NVIDIA NIM Model',
      context: '-',
      capabilities: ['tools'],
      pro: false,
      caching: false,
    }));
    
    // Merge with local models
    const allModels = {
      ...localModels.categories,
      nvidia: nvidiaModels,
    };
    
    return NextResponse.json({ categories: allModels });
  } catch (error) {
    // Fallback to local models only
    return NextResponse.json(localModels);
  }
}
```

## Usage Tracking (Vercel KV)

```typescript
// lib/usage.ts
import { kv } from '@vercel/kv';

const DAILY_LIMIT = 20;

export async function getUsage(identifier: string): Promise<number> {
  const key = `usage:${identifier}:${new Date().toDateString()}`;
  const count = await kv.get<number>(key) || 0;
  return count;
}

export async function incrementUsage(identifier: string): Promise<void> {
  const key = `usage:${identifier}:${new Date().toDateString()}`;
  await kv.incr(key);
  await kv.expire(key, 86400); // Expire after 24 hours
}

export async function getRemainingRequests(identifier: string): Promise<number> {
  const usage = await getUsage(identifier);
  return Math.max(0, DAILY_LIMIT - usage);
}
```

## Session Management (Client-side)

```typescript
// lib/session.ts (client-side)
const SESSION_KEY = 'orchid_session_id';

export function getSessionId(): string {
  if (typeof window === 'undefined') return '';
  
  let sessionId = localStorage.getItem(SESSION_KEY);
  
  if (!sessionId) {
    sessionId = `orchid_${Date.now()}_${Math.random().toString(36).slice(2, 15)}`;
    localStorage.setItem(SESSION_KEY, sessionId);
  }
  
  return sessionId;
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}
```

## Environment Variables

```env
# .env.local (for local development)
POLLINATIONS_API_KEY=pl_xxxxxxxxxxxx
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxx

# Vercel Environment Variables (set in Vercel dashboard)
# - POLLINATIONS_API_KEY
# - NVIDIA_API_KEY
# - KV_REST_API_URL (auto-configured by Vercel KV)
# - KV_REST_API_TOKEN (auto-configured by Vercel KV)
```

## Dependencies

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "@vercel/kv": "^1.0.0",
    "zustand": "^4.5.0"
  },
  "devDependencies": {
    "typescript": "^5.0.0",
    "@types/node": "^20.0.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "tailwindcss": "^3.4.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0"
  }
}
```

## Migration Steps

### Phase 1: Project Setup

1. Initialize Next.js project with TypeScript
2. Configure Tailwind CSS
3. Set up project structure
4. Copy existing static assets

### Phase 2: API Routes

1. Create `/api/chat/completions` route
2. Create `/api/images/generations` route
3. Create `/api/video/generations` route
4. Create `/api/audio/speech` route
5. Create `/api/audio/transcriptions` route
6. Create `/api/models` route
7. Implement NVIDIA NIM integration
8. Implement usage tracking with Vercel KV

### Phase 3: Frontend Components

1. Convert HTML to React components
2. Convert CSS to Tailwind/CSS modules
3. Implement state management with Zustand
4. Implement session management
5. Implement theme system

### Phase 4: Testing & Deployment

1. Test API routes locally
2. Test streaming responses
3. Test NVIDIA NIM integration
4. Deploy to Vercel
5. Configure environment variables
6. Verify production functionality

## NVIDIA NIM Models to Add

Based on NVIDIA's catalog:

- `nvidia/llama-3.1-nemotron-70b-instruct`
- `nvidia/llama-3.3-70b-instruct`
- `nvidia/meta/llama-3.1-8b-instruct`
- `nvidia/deepseek-ai/deepseek-r1`
- `nvidia/mistralai/mistral-nemo-12b-instruct`

## Benefits

1. **Key Security**: API keys never exposed to client
2. **Usage Control**: Demo mode properly tracked per session
3. **Flexibility**: BYOP mode for power users
4. **Scalability**: Easy to add new providers
5. **Cost Control**: Server-side keys prevent abuse
6. **Vercel Native**: Optimized for Vercel's edge functions
