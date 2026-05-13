/**
 * Pure utility for checking admin status by email.
 *
 * Lives in its own file (no imports from auth/config) so it can be used inside
 * the NextAuth session callback without creating an import cycle.
 */

function adminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS || '';
  return new Set(
    raw
      .split(',')
      .map(e => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return adminEmails().has(email.toLowerCase());
}
