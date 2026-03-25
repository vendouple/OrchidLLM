import { NextRequest, NextResponse } from 'next/server';
import { detectKeyType, getApiBaseUrl, getActualModel, isNvidiaModel } from '@/lib/keys';
import { getUsage, incrementUsage, getClientIP, generateCompositeId, checkRateLimit, incrementRateLimit } from '@/lib/usage';
import { getApiKeyRecord, updateKeyUsage, hasProviderAccess, hasModelAccess, isKeyExpired } from '@/lib/db';
import { ChatCompletionRequest } from '@/lib/types';

const DAILY_LIMIT = 20;

export async function POST(request: NextRequest) {
  try {
    const body: ChatCompletionRequest = await request.json();
    const { model, messages, stream, ...rest } = body;

    // Get API key from header
    const apiKey = request.headers.get('X-API-Key') || '';
    const sessionId = request.headers.get('X-Session-ID') || '';
    const clientIP = getClientIP(request);

    // Detect key type
    const keyDetection = detectKeyType(apiKey);

    // Handle BPOLLY mode (user's own Pollinations key)
    if (keyDetection.type === 'bpolly' && keyDetection.actualKey) {
      return forwardToPollinations(body, keyDetection.actualKey, stream);
    }

    // Handle Global API key mode
    if (keyDetection.type === 'global') {
      let keyRecord;
      try {
        keyRecord = await getApiKeyRecord(apiKey);
      } catch (error) {
        console.error('Database error:', error);
        return NextResponse.json(
          { error: 'Service temporarily unavailable. Please try again later.' },
          { status: 503 }
        );
      }
  
      if (!keyRecord) {
        return NextResponse.json(
          { error: 'Invalid API key' },
          { status: 401 }
        );
      }

      if (isKeyExpired(keyRecord.permissions)) {
        return NextResponse.json(
          { error: 'API key has expired' },
          { status: 401 }
        );
      }

      // Check provider access
      const provider = isNvidiaModel(model) ? 'nvidia' : 'pollinations';
      if (!hasProviderAccess(keyRecord.permissions, provider)) {
        return NextResponse.json(
          { error: `API key does not have access to ${provider} provider` },
          { status: 403 }
        );
      }

      // Check model access
      if (!hasModelAccess(keyRecord.permissions, model)) {
        return NextResponse.json(
          { error: `API key does not have access to model ${model}` },
          { status: 403 }
        );
      }

      // Check rate limit
      const rateLimit = await checkRateLimit(apiKey, keyRecord.permissions.rateLimit);
      if (!rateLimit.allowed) {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded',
            remaining: rateLimit.remaining,
            resetAt: rateLimit.resetAt,
          },
          { status: 429 }
        );
      }

      // Update usage
      await updateKeyUsage(apiKey);
      await incrementRateLimit(apiKey);

      // Forward request
      return forwardRequest(body, provider, stream);
    }

    // Handle Demo mode
    if (keyDetection.type === 'demo' || sessionId.startsWith('nobindes_')) {
      // Generate composite ID for tracking
      const compositeId = generateCompositeId(sessionId, clientIP);
      
      // Check usage
      const usage = await getUsage(compositeId);
      if (usage >= DAILY_LIMIT) {
        return NextResponse.json(
          { 
            error: 'Demo limit reached (20 requests/day). Please use BPOLLYKEY mode or get a Global API key.',
            remaining: 0,
          },
          { status: 429 }
        );
      }

      // Increment usage
      await incrementUsage(compositeId);

      // Forward request
      const provider = isNvidiaModel(model) ? 'nvidia' : 'pollinations';
      return forwardRequest(body, provider, stream);
    }

    // No valid key - treat as demo mode with session ID
    if (sessionId) {
      const compositeId = generateCompositeId(sessionId, clientIP);
      
      // Check usage
      const usage = await getUsage(compositeId);
      if (usage >= DAILY_LIMIT) {
        return NextResponse.json(
          { 
            error: 'Demo limit reached (20 requests/day). Please use BPOLLYKEY mode or get a Global API key.',
            remaining: 0,
          },
          { status: 429 }
        );
      }

      // Increment usage
      await incrementUsage(compositeId);

      // Forward request
      const provider = isNvidiaModel(model) ? 'nvidia' : 'pollinations';
      return forwardRequest(body, provider, stream);
    }

    return NextResponse.json(
      { error: 'No valid API key or session ID provided' },
      { status: 401 }
    );

  } catch (error) {
    console.error('Chat completion error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * Forward request to appropriate provider
 */
async function forwardRequest(
  body: ChatCompletionRequest,
  provider: 'nvidia' | 'pollinations',
  stream?: boolean
) {
  const { model, messages, ...rest } = body;
  
  const baseUrl = provider === 'nvidia' 
    ? 'https://integrate.api.nvidia.com/v1'
    : 'https://gen.pollinations.ai/v1';
  
  const actualModel = getActualModel(model);
  const apiKey = provider === 'nvidia'
    ? process.env.NVIDIA_API_KEY
    : process.env.POLLINATIONS_API_KEY;

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: actualModel,
      messages,
      stream: stream || false,
      ...rest,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error(`Provider error for ${provider}:`, error);
    return NextResponse.json(
      { error: 'Provider request failed. Please try again later.' },
      { status: response.status }
    );
  }

  // Handle streaming response
  if (stream) {
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Return JSON response
  const data = await response.json();
  return NextResponse.json(data);
}

/**
 * Forward request to Pollinations with user's own key
 */
async function forwardToPollinations(
  body: ChatCompletionRequest,
  apiKey: string,
  stream?: boolean
) {
  const { model, messages, ...rest } = body;

  const response = await fetch('https://gen.pollinations.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      stream: stream || false,
      ...rest,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    console.error('Pollinations error:', error);
    return NextResponse.json(
      { error: 'Provider request failed. Please try again later.' },
      { status: response.status }
    );
  }

  // Handle streaming response
  if (stream) {
    return new Response(response.body, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  }

  // Return JSON response
  const data = await response.json();
  return NextResponse.json(data);
}
