import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  // Security check: only allow in development if you want, but for now we let the user test.
  if (process.env.NODE_ENV !== 'development') {
    return NextResponse.json({ error: 'Not allowed in production' }, { status: 403 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
    });

    if (!dbUser) {
      return NextResponse.json({ error: 'User not found in DB' }, { status: 404 });
    }

    const newPlan = dbUser.plan === 'PRO' ? 'FREE' : 'PRO';

    await prisma.user.update({
      where: { id: user.id },
      data: { plan: newPlan },
    });

    return NextResponse.json({ success: true, plan: newPlan });
  } catch (error) {
    console.error('Failed to toggle plan:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
