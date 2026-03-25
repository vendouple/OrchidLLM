/// <reference path="../../global.d.ts" />
'use client';

import { signIn } from 'next-auth/react';
import { useEffect, useRef } from 'react';

interface SignInModalProps {
  open: boolean;
  onClose: () => void;
}

export function SignInModal({ open, onClose }: SignInModalProps) {
  const dialogRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open) {
      (dialog as any).show?.();
    } else {
      (dialog as any).close?.();
    }

    const handleClose = () => onClose();
    dialog.addEventListener('close', handleClose);
    return () => dialog.removeEventListener('close', handleClose);
  }, [open, onClose]);

  const handleGitHubSignIn = () => {
    signIn('github', { callbackUrl: '/' });
  };

  return (
    <m3e-dialog
      ref={dialogRef as any}
      dismissible
      style={{ '--m3e-dialog-max-width': '400px' } as React.CSSProperties}
    >
      <span slot="header">
        <span className="ms" style={{ verticalAlign: 'middle', marginRight: '8px' }}>login</span>
        Sign In
      </span>

      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <div style={{ marginBottom: '16px', color: 'var(--on-surf-v)', fontSize: '14px', lineHeight: 1.6 }}>
          Sign in to save your chats and access additional features.
        </div>

        <button
          onClick={handleGitHubSignIn}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
            padding: '12px 24px',
            background: '#24292e',
            color: '#fff',
            border: 'none',
            borderRadius: 'var(--r-md)',
            fontSize: '15px',
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'background 0.2s',
            width: '100%',
          }}
          onMouseOver={(e) => (e.currentTarget.style.background = '#1a1e22')}
          onMouseOut={(e) => (e.currentTarget.style.background = '#24292e')}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
          </svg>
          Continue with GitHub
        </button>
      </div>

      <div slot="actions" style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <m3e-button onClick={onClose}>Cancel</m3e-button>
      </div>
    </m3e-dialog>
  );
}
