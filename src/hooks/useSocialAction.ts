import { useEffect, useRef, useState } from 'react';
import { SocialActionUncertainError } from '../qortium/social';

/** A single user action owns its Hub approval; stale accounts cannot close a new form. */
export function useSocialAction(address: string | null, onSuccess: () => void) {
  const busy = useRef(false);
  const blocked = useRef(false);
  const generation = useRef({ active: true });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState(false);
  useEffect(() => {
    const scope = { active: true };
    generation.current = scope;
    busy.current = false;
    blocked.current = false;
    setSending(false);
    setError(null);
    setUncertain(false);
    return () => {
      scope.active = false;
    };
  }, [address]);
  const run = async (operation: () => Promise<unknown>) => {
    if (busy.current || blocked.current) return;
    busy.current = true;
    const attempt = generation.current;
    setSending(true);
    setError(null);
    try {
      await operation();
      if (attempt.active && attempt === generation.current) onSuccess();
    } catch (failure) {
      if (!attempt.active || attempt !== generation.current) return;
      blocked.current = failure instanceof SocialActionUncertainError;
      setUncertain(blocked.current);
      setError(failure instanceof Error ? failure.message : 'Hub could not confirm the action.');
    } finally {
      if (attempt.active && attempt === generation.current) {
        busy.current = false;
        setSending(false);
      }
    }
  };
  return { sending, error, uncertain, run };
}
