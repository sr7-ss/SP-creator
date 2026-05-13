import { auth } from '@/lib/auth/config';
import { NextResponse } from 'next/server';

/**
 * Get authenticated user from session. Throws 401 response if not authenticated.
 */
export async function requireAuth() {
  const session = await auth();
  if (!session?.user?.id) {
    throw new AuthError();
  }
  return { userId: session.user.id, session };
}

export class AuthError extends Error {
  constructor() {
    super('Unauthorized');
    this.name = 'AuthError';
  }
}

/**
 * Helper to handle AuthError in API routes.
 */
export function handleAuthError(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}
