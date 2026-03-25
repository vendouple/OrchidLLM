'use client';

import { signOut, useSession } from 'next-auth/react';
import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';

interface UserMenuProps {
  onSignInClick: () => void;
}

export function UserMenu({ onSignInClick }: UserMenuProps) {
  const { data: session, status } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };

    if (menuOpen) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuOpen]);

  const handleAvatarClick = () => {
    if (status === 'authenticated') {
      setMenuOpen(!menuOpen);
    } else {
      onSignInClick();
    }
  };

  const handleSignOut = () => {
    setMenuOpen(false);
    signOut({ callbackUrl: '/' });
  };

  const isLoggedIn = status === 'authenticated' && session?.user;

  return (
    <div ref={menuRef} style={{ position: 'relative' }}>
      {/* Avatar Button */}
      <div
        className="user-avatar"
        title={isLoggedIn ? session.user.name || session.user.githubUsername : 'Sign In'}
        onClick={handleAvatarClick}
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: isLoggedIn ? 'transparent' : 'linear-gradient(145deg, var(--p), var(--t))',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          fontSize: '14px',
          boxShadow: 'var(--sh1)',
          cursor: 'pointer',
          overflow: 'hidden',
        }}
      >
        {isLoggedIn && session.user.image ? (
          <img
            src={session.user.image}
            alt={session.user.name || 'User'}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <span className="ms sm">person</span>
        )}
      </div>

      {/* User Info (next to avatar) */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <span style={{
          fontSize: '13px',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          textOverflow: 'ellipsis',
          overflow: 'hidden',
          color: 'var(--on-surf)',
        }}>
          {isLoggedIn ? (session.user.name || session.user.githubUsername) : 'Guest'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--out)' }}>
          {isLoggedIn ? (session.user.isAdmin ? 'Admin' : 'User') : 'Sign in'}
        </span>
      </div>

      {/* Dropdown Menu */}
      {menuOpen && isLoggedIn && (
        <div
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            marginBottom: '8px',
            background: 'var(--surf)',
            borderRadius: 'var(--r-md)',
            boxShadow: 'var(--sh3)',
            minWidth: '180px',
            overflow: 'hidden',
            zIndex: 1000,
            border: '1px solid var(--out-v)',
          }}
        >
          {/* User Info Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: '1px solid var(--out-v)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}>
            {session.user.image && (
              <img
                src={session.user.image}
                alt=""
                style={{ width: '40px', height: '40px', borderRadius: '50%' }}
              />
            )}
            <div>
              <div style={{ fontWeight: 600, color: 'var(--on-surf)' }}>
                {session.user.name || session.user.githubUsername}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--out)' }}>
                @{session.user.githubUsername}
              </div>
            </div>
          </div>

          {/* Menu Items */}
          <div style={{ padding: '8px 0' }}>
            {session.user.isAdmin && (
              <Link
                href="/dashboard"
                onClick={() => setMenuOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '10px 16px',
                  color: 'var(--on-surf)',
                  textDecoration: 'none',
                  fontSize: '14px',
                  transition: 'background 0.15s',
                }}
                onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surf-hi)')}
                onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <span className="ms sm">dashboard</span>
                Dashboard
              </Link>
            )}

            <button
              onClick={handleSignOut}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 16px',
                color: 'var(--err)',
                fontSize: '14px',
                width: '100%',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'background 0.15s',
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--err-c)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <span className="ms sm">logout</span>
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
