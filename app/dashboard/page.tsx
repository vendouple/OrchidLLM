'use client';

import { useState, useEffect } from 'react';
import { useSession } from 'next-auth/react';
import Link from 'next/link';
import { ApiKeyRecord, User } from '@/lib/types';

type Tab = 'keys' | 'users' | 'cleanup';

export default function DashboardPage() {
  const { data: session } = useSession();
  const [activeTab, setActiveTab] = useState<Tab>('keys');
  const [keys, setKeys] = useState<(ApiKeyRecord & { fullKey: string })[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [inactiveKeys, setInactiveKeys] = useState<ApiKeyRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  // Fetch keys
  useEffect(() => {
    if (activeTab === 'keys') {
      fetchKeys();
    } else if (activeTab === 'users') {
      fetchUsers();
    } else if (activeTab === 'cleanup') {
      fetchInactiveKeys();
    }
  }, [activeTab]);

  const fetchKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/keys');
      const data = await res.json();
      setKeys(data.keys || []);
    } catch (error) {
      console.error('Error fetching keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data.users || []);
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchInactiveKeys = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/cleanup?days=30');
      const data = await res.json();
      setInactiveKeys(data.keys || []);
    } catch (error) {
      console.error('Error fetching inactive keys:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateKey = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providers: ['pollinations'],
          rateLimit: 100,
          models: '*',
        }),
      });
      const data = await res.json();
      if (data.key) {
        setMessage(`Key created: ${data.key.key}`);
        fetchKeys();
      }
    } catch (error) {
      setMessage('Error creating key');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteKey = async (key: string) => {
    if (!confirm('Delete this key?')) return;

    try {
      await fetch('/api/admin/keys', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keys: [key] }),
      });
      fetchKeys();
      setMessage('Key deleted');
    } catch (error) {
      setMessage('Error deleting key');
    }
  };

  const handleToggleAdmin = async (userId: string, currentAdmin: boolean) => {
    try {
      await fetch('/api/admin/users', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, isAdmin: !currentAdmin }),
      });
      fetchUsers();
      setMessage(`Admin status updated`);
    } catch (error) {
      setMessage('Error updating admin status');
    }
  };

  const handleCleanup = async () => {
    if (!confirm(`Delete ${inactiveKeys.length} inactive demo keys?`)) return;

    setLoading(true);
    try {
      const res = await fetch('/api/admin/cleanup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ daysInactive: 30 }),
      });
      const data = await res.json();
      setMessage(data.message);
      fetchInactiveKeys();
    } catch (error) {
      setMessage('Error cleaning up keys');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage('Copied to clipboard');
    setTimeout(() => setMessage(''), 2000);
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
      }}>
        <div>
          <h1 style={{ fontSize: '28px', fontWeight: 800, marginBottom: '8px', color: 'var(--on-surf)' }}>
            Admin Dashboard
          </h1>
          <p style={{ color: 'var(--out)', fontSize: '14px' }}>
            Welcome, {session?.user?.name || session?.user?.githubUsername}
          </p>
        </div>
        <Link
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: 'var(--surf-hi)',
            borderRadius: 'var(--r-md)',
            color: 'var(--on-surf)',
            textDecoration: 'none',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          <span className="ms sm">arrow_back</span>
          Back to Chat
        </Link>
      </div>

      {/* Message Toast */}
      {message && (
        <div style={{
          padding: '12px 16px',
          background: 'var(--pc)',
          color: 'var(--on-pc)',
          borderRadius: 'var(--r-md)',
          marginBottom: '16px',
          fontSize: '14px',
        }}>
          {message}
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: '1px solid var(--out-v)',
        paddingBottom: '8px',
      }}>
        {[
          { id: 'keys', label: 'API Keys', icon: 'vpn_key' },
          { id: 'users', label: 'Users', icon: 'group' },
          { id: 'cleanup', label: 'Cleanup', icon: 'delete_sweep' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as Tab)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              background: activeTab === tab.id ? 'var(--p)' : 'transparent',
              color: activeTab === tab.id ? 'var(--on-p)' : 'var(--on-surf)',
              border: 'none',
              borderRadius: 'var(--r-md)',
              fontSize: '14px',
              fontWeight: 500,
              cursor: 'pointer',
              transition: 'all 0.2s',
            }}
          >
            <span className="ms sm">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {activeTab === 'keys' && (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600 }}>API Keys ({keys.length})</h2>
            <button
              onClick={handleCreateKey}
              disabled={loading}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                background: 'var(--p)',
                color: 'var(--on-p)',
                border: 'none',
                borderRadius: 'var(--r-md)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              <span className="ms sm">add</span>
              Create Key
            </button>
          </div>

          {loading ? (
            <p style={{ color: 'var(--out)' }}>Loading...</p>
          ) : (
            <div style={{
              background: 'var(--surf)',
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--out-v)',
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surf-hi)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Key</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Created</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Last Used</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Usage</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: 600 }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((key) => (
                    <tr key={key.key} style={{ borderTop: '1px solid var(--out-v)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <code style={{
                          background: 'var(--surf-hi)',
                          padding: '4px 8px',
                          borderRadius: 'var(--r-sm)',
                          fontSize: '12px',
                        }}>
                          {key.key}
                        </code>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--out)' }}>
                        {new Date(key.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--out)' }}>
                        {key.lastUsed ? new Date(key.lastUsed).toLocaleDateString() : 'Never'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                        {key.usageCount} requests
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button
                          onClick={() => copyToClipboard(key.fullKey)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                            marginRight: '8px',
                          }}
                          title="Copy key"
                        >
                          <span className="ms sm" style={{ color: 'var(--p)' }}>content_copy</span>
                        </button>
                        <button
                          onClick={() => handleDeleteKey(key.fullKey)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '4px',
                          }}
                          title="Delete key"
                        >
                          <span className="ms sm" style={{ color: 'var(--err)' }}>delete</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {keys.length === 0 && (
                <p style={{ padding: '24px', textAlign: 'center', color: 'var(--out)' }}>
                  No API keys found
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>Users ({users.length})</h2>

          {loading ? (
            <p style={{ color: 'var(--out)' }}>Loading...</p>
          ) : (
            <div style={{
              background: 'var(--surf)',
              borderRadius: 'var(--r-lg)',
              border: '1px solid var(--out-v)',
              overflow: 'hidden',
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: 'var(--surf-hi)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>User</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Email</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Joined</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '13px', fontWeight: 600 }}>Last Login</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '13px', fontWeight: 600 }}>Admin</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} style={{ borderTop: '1px solid var(--out-v)' }}>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          {user.avatarUrl && (
                            <img
                              src={user.avatarUrl}
                              alt=""
                              style={{ width: '32px', height: '32px', borderRadius: '50%' }}
                            />
                          )}
                          <div>
                            <div style={{ fontWeight: 500 }}>{user.name || user.githubUsername}</div>
                            <div style={{ fontSize: '12px', color: 'var(--out)' }}>@{user.githubUsername}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--out)' }}>
                        {user.email || '-'}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--out)' }}>
                        {new Date(user.createdAt).toLocaleDateString()}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '13px', color: 'var(--out)' }}>
                        {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => handleToggleAdmin(user.id, user.isAdmin)}
                          disabled={user.id === session?.user?.id}
                          style={{
                            background: user.isAdmin ? 'var(--p)' : 'var(--surf-hi)',
                            color: user.isAdmin ? 'var(--on-p)' : 'var(--on-surf)',
                            border: 'none',
                            padding: '6px 12px',
                            borderRadius: 'var(--r-sm)',
                            cursor: user.id === session?.user?.id ? 'not-allowed' : 'pointer',
                            fontSize: '12px',
                            fontWeight: 500,
                            opacity: user.id === session?.user?.id ? 0.5 : 1,
                          }}
                        >
                          {user.isAdmin ? 'Admin' : 'User'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {users.length === 0 && (
                <p style={{ padding: '24px', textAlign: 'center', color: 'var(--out)' }}>
                  No users found
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {activeTab === 'cleanup' && (
        <div>
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '16px' }}>
            Demo Key Cleanup
          </h2>

          <div style={{
            background: 'var(--surf)',
            borderRadius: 'var(--r-lg)',
            border: '1px solid var(--out-v)',
            padding: '24px',
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '24px',
            }}>
              <div style={{
                width: '64px',
                height: '64px',
                background: 'var(--err-c)',
                borderRadius: '50%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <span className="ms" style={{ fontSize: '32px', color: 'var(--err)' }}>delete_sweep</span>
              </div>
              <div>
                <h3 style={{ fontSize: '20px', fontWeight: 600, marginBottom: '4px' }}>
                  {inactiveKeys.length} Inactive Demo Keys
                </h3>
                <p style={{ color: 'var(--out)', fontSize: '14px' }}>
                  These demo keys have been inactive for 30+ days and can be safely removed.
                </p>
              </div>
            </div>

            <button
              onClick={handleCleanup}
              disabled={loading || inactiveKeys.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '12px 24px',
                background: inactiveKeys.length === 0 ? 'var(--surf-hi)' : 'var(--err)',
                color: inactiveKeys.length === 0 ? 'var(--out)' : 'var(--on-t)',
                border: 'none',
                borderRadius: 'var(--r-md)',
                fontSize: '14px',
                fontWeight: 500,
                cursor: inactiveKeys.length === 0 ? 'not-allowed' : 'pointer',
              }}
            >
              <span className="ms sm">delete_forever</span>
              {loading ? 'Cleaning up...' : `Delete ${inactiveKeys.length} Keys`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
