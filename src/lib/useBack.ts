import { useCallback } from 'react';
import { useNavigate, useRouter } from '@tanstack/react-router';

/**
 * Back action for detail screens.
 *
 * If there's in-app history, go back (preserves the user's scroll position
 * and any search params on the previous screen). If the user deep-linked
 * straight into a detail page (no history to pop), fall back to a sensible
 * parent route instead of leaving them stranded.
 */
export function useBack(fallback: string) {
  const router = useRouter();
  const navigate = useNavigate();
  return useCallback(() => {
    if (router.history.canGoBack()) {
      router.history.back();
    } else {
      navigate({ to: fallback });
    }
  }, [router, navigate, fallback]);
}
