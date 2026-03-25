'use client';

import { SessionProvider } from 'next-auth/react';
import { useEffect, useState } from 'react';

function M3EProvider({ children }: { children: React.ReactNode }) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    import('@m3e/web/all').then(() => {
      setLoaded(true);
    });
  }, []);

  if (!loaded) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        background: 'var(--bg, #FAFAFA)',
        color: 'var(--on-bg, #1A1625)',
        fontFamily: 'Plus Jakarta Sans, system-ui, sans-serif',
      }}>
        Loading...
      </div>
    );
  }

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
