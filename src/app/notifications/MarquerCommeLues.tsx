'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { creerClientNavigateur } from '@/lib/supabase/client';

// Ouvrir la page vaut lecture : les notifications passent à « lues »,
// puis la page et le compteur de la cloche sont rafraîchis.
export function MarquerCommeLues() {
  const router = useRouter();
  const fait = useRef(false);

  useEffect(() => {
    if (fait.current) return;
    fait.current = true;
    creerClientNavigateur()
      .from('notifications')
      .update({ lue: true })
      .eq('lue', false)
      .then(({ error }) => {
        if (!error) router.refresh();
      });
  }, [router]);

  return null;
}
