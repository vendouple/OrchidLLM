'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect } from 'react';

function M3EProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    import('@m3e/web/all').catch(() => {
      // Keep rendering even if module preloading fails.
    });
  }, []);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <M3EProvider>
        {children}
      </M3EProvider>
    </SessionProvider>
  );
}
