import { useEffect, useMemo, useState } from 'react';
import { isQortalRequestAvailable, requestQortal } from '../services/qortal/qortalClient.js';

type QortalAuth = {
  address: string;
  name: string;
  avatarUrl: string;
};

const buildAvatarUrl = (name: string) => {
  if (!name) {
    return '/nodefm_logo.png';
  }

  return `/arbitrary/THUMBNAIL/${encodeURIComponent(name)}/qortal_avatar`;
};

export function useQortalAuth() {
  const [auth, setAuth] = useState<QortalAuth>({
    address: '',
    name: 'Loading user...',
    avatarUrl: '/nodefm_logo.png',
  });

  useEffect(() => {
    let isActive = true;

    const load = async () => {
      if (!isQortalRequestAvailable()) {
        if (isActive) {
          setAuth({
            address: '',
            name: 'Guest Listener',
            avatarUrl: '/nodefm_logo.png',
          });
        }
        return;
      }

      try {
        const account = await requestQortal({
          action: 'GET_USER_ACCOUNT',
        });

        if (!isActive) {
          return;
        }

        const name = String(account?.name || 'Anonymous Listener');
        const address = String(account?.address || '');
        setAuth({
          name,
          address,
          avatarUrl: buildAvatarUrl(name),
        });
      } catch {
        if (!isActive) {
          return;
        }

        setAuth({
          address: '',
          name: 'Anonymous Listener',
          avatarUrl: '/nodefm_logo.png',
        });
      }
    };

    void load();
    const intervalId = window.setInterval(() => {
      void load();
    }, 120000);

    return () => {
      isActive = false;
      window.clearInterval(intervalId);
    };
  }, []);

  return useMemo(() => ({ auth }), [auth]);
}
