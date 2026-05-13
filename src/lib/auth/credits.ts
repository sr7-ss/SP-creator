import { prisma } from '@/lib/db/client';

/**
 * Check if user has credits and deduct 1 credit.
 * Admin users (plan === 'admin') bypass all credit checks.
 *
 * Returns { ok: true } if allowed, or { ok: false, error: string } if not.
 */
export async function checkAndDeductCredit(
  userId: string,
  action: string,
  provider: string = '',
  model: string = ''
): Promise<{ ok: true } | { ok: false; error: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { plan: true, credits: true, creditsResetAt: true },
  });

  if (!user) return { ok: false, error: '用户不存在' };

  // Admin bypass — unlimited usage
  if (user.plan === 'admin') {
    // Still log usage for analytics, but don't deduct
    await logUsage(userId, action, provider, model, 0);
    return { ok: true };
  }

  // Auto-reset monthly credits on the 1st
  const now = new Date();
  const resetDate = new Date(user.creditsResetAt);
  if (now.getMonth() !== resetDate.getMonth() || now.getFullYear() !== resetDate.getFullYear()) {
    const defaultCredits = user.plan === 'pro' ? 9999 : 1; // free = 1 credit
    await prisma.user.update({
      where: { id: userId },
      data: { credits: defaultCredits, creditsResetAt: now },
    });
    user.credits = defaultCredits;
  }

  // Check credits
  if (user.credits <= 0) {
    return {
      ok: false,
      error: user.plan === 'free'
        ? '免费额度已用完，请升级到 Pro 继续使用'
        : '本月额度已用完，请联系管理员',
    };
  }

  // Deduct 1 credit + log usage
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { credits: { decrement: 1 } },
    }),
    prisma.usageLog.create({
      data: { userId, action, provider, model, creditsUsed: 1 },
    }),
  ]);

  return { ok: true };
}

/**
 * Log usage without deducting credits (for admin users).
 */
async function logUsage(
  userId: string,
  action: string,
  provider: string,
  model: string,
  creditsUsed: number
) {
  try {
    await prisma.usageLog.create({
      data: { userId, action, provider, model, creditsUsed },
    });
  } catch {
    // Don't fail the request if logging fails
  }
}
