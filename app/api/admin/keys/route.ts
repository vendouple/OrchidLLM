import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listApiKeys, createApiKey, deleteApiKey } from '@/lib/db';
import { generateGlobalKey } from '@/lib/keys';

// GET /api/admin/keys - List all API keys
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const keys = await listApiKeys(limit, offset);

  // Mask keys for security (show first 8 and last 4 chars)
  const maskedKeys = keys.map((key) => ({
    ...key,
    key: key.key.slice(0, 8) + '...' + key.key.slice(-4),
    fullKey: key.key, // Only admins can see this
  }));

  return NextResponse.json({ keys: maskedKeys, total: keys.length });
}

// POST /api/admin/keys - Create new API key
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { providers, rateLimit, models, expiresAt, keyName, isDemo } = body;

    const key = generateGlobalKey();
    const record = await createApiKey(
      key,
      {
        providers: providers || ['pollinations'],
        rateLimit: rateLimit || 100,
        models: models || '*',
        expiresAt: expiresAt ? new Date(expiresAt).getTime() : undefined,
      },
      session.user.email || session.user.githubUsername
    );

    if (!record) {
      return NextResponse.json({ error: 'Failed to create key' }, { status: 500 });
    }

    return NextResponse.json({
      key: record,
      message: 'API key created successfully',
    });
  } catch (error) {
    console.error('Error creating API key:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/admin/keys - Delete API key(s)
export async function DELETE(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { keys } = await request.json();

    if (!keys || !Array.isArray(keys)) {
      return NextResponse.json({ error: 'Keys array required' }, { status: 400 });
    }

    const results = await Promise.all(keys.map((key: string) => deleteApiKey(key)));
    const deletedCount = results.filter(Boolean).length;

    return NextResponse.json({
      deleted: deletedCount,
      message: `Deleted ${deletedCount} key(s)`,
    });
  } catch (error) {
    console.error('Error deleting API keys:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
