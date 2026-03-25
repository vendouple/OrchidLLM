import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { listUsers, setUserAdmin, getUserById } from '@/lib/db';

// GET /api/admin/users - List all users
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const offset = parseInt(searchParams.get('offset') || '0');

  const users = await listUsers(limit, offset);

  return NextResponse.json({ users, total: users.length });
}

// PATCH /api/admin/users - Update user admin status
export async function PATCH(request: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { userId, isAdmin } = await request.json();

    if (!userId || typeof isAdmin !== 'boolean') {
      return NextResponse.json({ error: 'userId and isAdmin required' }, { status: 400 });
    }

    // Prevent removing admin from self
    if (userId === session.user.id && !isAdmin) {
      return NextResponse.json({ error: 'Cannot remove admin from yourself' }, { status: 400 });
    }

    // Check if target user exists
    const targetUser = await getUserById(userId);
    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const success = await setUserAdmin(userId, isAdmin);

    if (!success) {
      return NextResponse.json({ error: 'Failed to update user' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: `User ${isAdmin ? 'granted' : 'revoked'} admin access`,
    });
  } catch (error) {
    console.error('Error updating user:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
