import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/client';
import { auth } from '@/lib/auth/config';

const NAME_RE = /^[a-z][a-z0-9_]{0,63}$/;
const MAX_PROP_KEYS = 12;
const MAX_PROP_VALUE_LEN = 200;

function sanitizeProps(raw: unknown): Record<string, string | number | boolean | null> | null {
  if (!raw || typeof raw !== 'object') return null;
  const out: Record<string, string | number | boolean | null> = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_PROP_KEYS) break;
    if (typeof k !== 'string' || k.length > 64) continue;
    if (v === null || typeof v === 'boolean' || typeof v === 'number') {
      out[k] = v as string | number | boolean | null;
    } else if (typeof v === 'string') {
      out[k] = v.slice(0, MAX_PROP_VALUE_LEN);
    } else {
      continue;
    }
    count++;
  }
  return Object.keys(out).length ? out : null;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, sessionId, path, props } = body || {};

    if (typeof name !== 'string' || !NAME_RE.test(name)) {
      return NextResponse.json({ error: 'invalid name' }, { status: 400 });
    }
    if (typeof sessionId !== 'string' || sessionId.length > 64) {
      return NextResponse.json({ error: 'invalid sessionId' }, { status: 400 });
    }

    const session = await auth().catch(() => null);
    const userId = session?.user?.id || null;

    const cleanProps = sanitizeProps(props);
    await prisma.trackEvent.create({
      data: {
        userId,
        sessionId,
        name,
        path: typeof path === 'string' ? path.slice(0, 200) : null,
        ...(cleanProps ? { props: cleanProps } : {}),
      },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('track endpoint error:', err);
    // Don't propagate errors to the client — tracking is best-effort
    return NextResponse.json({ ok: false }, { status: 200 });
  }
}
