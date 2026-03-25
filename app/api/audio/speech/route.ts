import { NextRequest, NextResponse } from 'next/server';
import { detectKeyType } from '@/lib/keys';
import { getUsage, incrementUsage, getClientIP, generateCompositeId, checkRateLimit, incrementRateLimit } from '@/lib/usage';
import { getApiKeyRecord, updateKeyUsage, hasProviderAccess, isKeyExpired } from '@/lib/db';
import { AudioGenerationRequest } from '@/lib/types';

const DAILY_LIMIT = 20;
const POLLINATIONS_BASE = 'https://gen.pollinations.ai/v1';

export async function POST(request: NextRequest) {
  try {
    const body: AudioGenerationRequest = await request.json();

    const apiKey = request.headers.get('X-API-Key') || '';
    const sessionId = request.headers.get('X-Session-ID') || '';
    const clientIP = getClientIP(request);

    const keyDetection = detectKeyType(apiKey);

    if (keyDetection.type === 'bpolly' && keyDetection.actualKey) {
      return forwardToPollinations(body, keyDetection.actualKey);
    }

    if (keyDetection.type === 'global') {
      let keyRecord;
      try {
        keyRecord = await getApiKeyRecord(apiKey);
      } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json({ error: 'Service temporarily unavailable. Please try again later.' }, { status: 503 });
      }
  
      if (!keyRecord) {
        return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
      }

      if (isKeyExpired(keyRecord.permissions)) {
        return NextResponse.json({ error: 'API key has expired' }, { status: 401 });
      }

      if (!hasProviderAccess(keyRecord.permissions, 'pollinations')) {
        return NextResponse.json({ error: 'API key does not have access to pollinations provider' }, { status: 403 });
      }

      const rateLimit = await checkRateLimit(apiKey, keyRecord.permissions.rateLimit);
      if (!rateLimit.allowed) {
        return NextResponse.json({ error: 'Rate limit exceeded', remaining: rateLimit.remaining }, { status: 429 });
      }

      await updateKeyUsage(apiKey);
      await incrementRateLimit(apiKey);

      return forwardToPollinations(body, process.env.POLLINATIONS_API_KEY!);
    }

    if (keyDetection.type === 'demo' || sessionId.startsWith('nobindes_')) {
      const compositeId = generateCompositeId(sessionId, clientIP);
      
      const usage = await getUsage(compositeId);
      if (usage >= DAILY_LIMIT) {
        return NextResponse.json({ error: 'Demo limit reached (20 requests/day)', remaining: 0 }, { status: 429 });
      }

      await incrementUsage(compositeId);
      return forwardToPollinations(body, process.env.POLLINATIONS_API_KEY!);
    }

    if (sessionId) {
      const compositeId = generateCompositeId(sessionId, clientIP);
      
      const usage = await getUsage(compositeId);
      if (usage >= DAILY_LIMIT) {
        return NextResponse.json({ error: 'Demo limit reached (20 requests/day)', remaining: 0 }, { status: 429 });
      }

      await incrementUsage(compositeId);
      return forwardToPollinations(body, process.env.POLLINATIONS_API_KEY!);
    }

    return NextResponse.json({ error: 'No valid API key or session ID provided' }, { status: 401 });

  } catch (error) {
    console.error('Audio generation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function forwardToPollinations(body: AudioGenerationRequest, apiKey: string) {
  const response = await fetch(`${POLLINATIONS_BASE}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Audio generation error:', error);
    return NextResponse.json({ error: 'Provider request failed. Please try again later.' }, { status: response.status });
  }

  // Check if response is audio or JSON
  const contentType = response.headers.get('content-type') || '';
  
  if (contentType.includes('application/json')) {
    const data = await response.json();
    return NextResponse.json(data);
  }
  
  // Return audio blob
  const blob = await response.blob();
  return new Response(blob, {
    headers: {
      'Content-Type': contentType,
    },
  });
}
