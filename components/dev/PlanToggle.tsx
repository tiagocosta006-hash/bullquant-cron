'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Crown, User } from 'lucide-react';

export function PlanToggle({ initialPlan }: { initialPlan: string }) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  
  // Only render in development
  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  const togglePlan = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/dev/toggle-plan', { method: 'POST' });
      if (res.ok) {
        // Refresh the page data so components get the new plan status
        router.refresh();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const isPro = initialPlan === 'PRO';

  return (
    <Button 
      variant="outline" 
      size="sm" 
      onClick={togglePlan} 
      disabled={loading}
      className={`text-xs gap-1.5 h-8 border-dashed ${isPro ? 'border-gold-500/50 text-gold-500 hover:bg-gold-500/10' : 'border-muted-foreground text-muted-foreground'}`}
      title="Toggle between FREE and PRO plan (Dev Mode)"
    >
      {isPro ? <Crown className="w-3.5 h-3.5" /> : <User className="w-3.5 h-3.5" />}
      {isPro ? 'PRO PLAN' : 'FREE PLAN'}
    </Button>
  );
}
