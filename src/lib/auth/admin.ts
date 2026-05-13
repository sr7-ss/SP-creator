import { auth } from '@/lib/auth/config';
import { NextResponse } from 'next/server';
import { isAdminEmail } from '@/lib/auth/admin-flag';

export { isAdminEmail };

/** Throws AdminError if current session user is not in ADMIN_EMAILS. */
export async function requireAdmin() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAdminEmail(email)) {
    throw new AdminError();
  }
  return { userId: session!.user!.id as string, email };
}

export class AdminError extends Error {
  constructor() {
    super('Forbidden');
    this.name = 'AdminError';
  }
}

export function handleAdminError(error: unknown): NextResponse | null {
  if (error instanceof AdminError) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}
