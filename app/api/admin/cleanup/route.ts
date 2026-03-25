import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getInactiveDemoKeys, cleanupInactiveDemoKeys } from '@/lib/db';

// GET /api/admin/cleanup - Preview keys to be cleaned up
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const daysInactive = parseInt(searchParams.get('days') || '30');

  const keys = await getInactiveDemoKeys(daysInactive);

  return NextResponse.json({
    keys,
    count: keys.length,
    daysInactive,
    message: `Found ${keys.length} demo key(s) inactive for ${daysInactive}+ days`,
  });
}

// POST /api/admin/cleanup - Clean up inactive demo keys
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const daysInactive = body.daysInactive || 30;

    const deleted = await cleanupInactiveDemoKeys(daysInactive);

    return NextResponse.json({
      deleted,
      daysInactive,
      message: `Removed ${deleted} demo key(s) inactive for ${daysInactive}+ days`,
    });
  } catch (error) {
    console.error('Error cleaning up demo keys:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
