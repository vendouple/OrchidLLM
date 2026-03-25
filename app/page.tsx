/// <reference path="../global.d.ts" />
'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { SignInModal } from '@/components/auth/SignInModal';
import { UserMenu } from '@/components/auth/UserMenu';
import { ChatMessageState } from '@/lib/types';

export default function ChatPage() {
  const [showSignIn, setShowSignIn] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const chatWrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    currentChatId,
    chats,
    isTempChat,
    isLoading,
    createChat,
    deleteChat,
    setCurrentChat,
    addMessage,
    appendToMessage,
    toggleTempChat,
    setLoading,
    getCurrentMessages,
    getChatList,
  } = useChatStore();

  const {
    theme,
    selectedModel,
    apiMode,
    bpollyKey,
    sessionId,
    demoRequestsLeft,
    setSelectedModel,
    decrementDemoRequests,
    toggleTheme,
  } = useSettingsStore();

  const messages = getCurrentMessages();
  const chatList = getChatList();

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (chatWrapRef.current) {
      chatWrapRef.current.scrollTop = chatWrapRef.current.scrollHeight;
    }
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
      inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 200) + 'px';
    }
  }, [inputValue]);

  const handleNewChat = () => {
    createChat();
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessageState = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      role: 'user',
      content: inputValue.trim(),
      time: new Date().toLocaleTimeString(),
    };

    // Create chat if needed
    if (!currentChatId && !isTempChat) {
      createChat();
    }

    addMessage(userMessage);
    setInputValue('');
    setLoading(true);

    // Create assistant message placeholder
    const assistantMessageId = Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    const assistantMessage: ChatMessageState = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      time: new Date().toLocaleTimeString(),
      model: selectedModel,
    };
    addMessage(assistantMessage);

    try {
      // Prepare API key header
      let apiKey = `nobindes_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      if (apiMode === 'bpolly' && bpollyKey) {
        apiKey = `BPOLLYKEY_${bpollyKey}`;
      }

      const response = await fetch('/api/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': apiKey,
          'X-Session-ID': sessionId,
        },
        body: JSON.stringify({
          model: selectedModel,
          messages: [
            ...messages.map((m) => ({ role: m.role, content: m.content })),
            { role: 'user', content: userMessage.content },
          ],
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      if (apiMode === 'demo') {
        decrementDemoRequests();
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content;
                if (content) {
                  appendToMessage(assistantMessageId, content);
                }
              } catch {
                // Skip invalid JSON
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      appendToMessage(assistantMessageId, 'Sorry, there was an error processing your request.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const setInputVal = (text: string) => {
    setInputValue(text);
    inputRef.current?.focus();
  };

  return (
    <m3e-theme id="app" color-scheme={theme} style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <aside
        id="sidebar"
        className="side"
        style={{
          display: 'flex',
          flexDirection: 'column',
          borderRight: '1px solid var(--out-v)',
          width: sidebarOpen ? 'var(--side-w, 276px)' : '0',
          overflow: 'hidden',
          transition: 'width 0.3s var(--std)',
        }}
      >
        {/* Sidebar Header */}
        <div className="side-head" style={{ paddingTop: '16px', paddingLeft: '16px', paddingRight: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div className="w-logo" style={{ width: '42px', height: '42px', minWidth: '42px', borderRadius: '12px' }}>
            <span className="ms fill" style={{ fontSize: '24px' }}>auto_awesome</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="top-title" style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1, margin: 0, letterSpacing: '-0.02em' }}>OrchidLLM</div>
            <div style={{ fontSize: '11px', color: 'var(--out)', marginTop: '4px', fontWeight: 600 }}>
              Powered by <a href="https://pollinations.ai" target="_blank" style={{ color: 'var(--p)', textDecoration: 'none' }}>pollinations.ai</a>
            </div>
          </div>
        </div>

        {/* New Chat Button */}
        <div className="new-chat-row" style={{ marginTop: '20px' }}>
          <button className="new-chat-btn" onClick={handleNewChat} type="button">
            <span className="ms">add</span> New Chat
          </button>
          <div className="temp-wrap" style={{ position: 'relative' }}>
            <button
              className={`temp-btn ${isTempChat ? 'active' : ''}`}
              onClick={() => toggleTempChat()}
              type="button"
              aria-label="Temporary chat"
            >
              <span className="ms">schedule</span>
              {isTempChat && <div className="temp-dot-badge"></div>}
            </button>
          </div>
        </div>

        {/* Chat History */}
        <div className="hist-scroll" id="hist-scroll" style={{ marginTop: '10px', flex: 1, overflowY: 'auto' }}>
          {chatList.map((chat) => (
            <div
              key={chat.id}
              className={`hist-item ${currentChatId === chat.id ? 'active' : ''}`}
              onClick={() => setCurrentChat(chat.id)}
              style={{
                padding: '10px 16px',
                cursor: 'pointer',
                borderRadius: 'var(--r-sm)',
                margin: '2px 8px',
                background: currentChatId === chat.id ? 'var(--surf-hi)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <span className="ms sm" style={{ color: 'var(--out)' }}>chat_bubble</span>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '13px' }}>
                {chat.title}
              </span>
              <button
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}
              >
                <span className="ms sm" style={{ fontSize: '16px', color: 'var(--err)' }}>delete</span>
              </button>
            </div>
          ))}
        </div>

        {/* Sidebar Footer */}
        <div className="side-foot" style={{ padding: '12px 16px', borderTop: '1px solid var(--out-v)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <UserMenu onSignInClick={() => setShowSignIn(true)} />
          <m3e-icon-button id="settings-btn" title="Settings" variant="tonal">
            <m3e-icon name="settings"></m3e-icon>
          </m3e-icon-button>
        </div>
      </aside>

      {/* Main Content */}
      <main id="main" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>
        {/* Demo Banner */}
        {apiMode === 'demo' && (
          <div id="demo-banner" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 16px',
            background: 'var(--pc)',
            color: 'var(--on-pc)',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            <span className="ms sm">bolt</span>
            Demo mode
            <div className="demo-pill" style={{
              marginLeft: 'auto',
              padding: '4px 10px',
              background: 'var(--p)',
              color: 'var(--on-p)',
              borderRadius: 'var(--r-pill)',
              fontSize: '12px',
              fontWeight: 600,
            }}>
              {demoRequestsLeft} requests left
            </div>
          </div>
        )}

        {/* Chat Header */}
        <div id="chat-top" className="desktop-only" style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          borderBottom: '1px solid var(--out-v)',
        }}>
          <m3e-icon-button onClick={() => setSidebarOpen(!sidebarOpen)} title="Toggle sidebar">
            <m3e-icon name="menu"></m3e-icon>
          </m3e-icon-button>
          <div className="chat-top-title" style={{ flex: 1 }}>
            <div className="chat-title-label" style={{ fontSize: '10px', color: 'var(--out)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Conversation
            </div>
            <div id="chat-title" style={{ fontSize: '14px', fontWeight: 700 }}>
              {isTempChat ? 'Temporary Chat' : (currentChatId ? chats[currentChatId]?.title || 'New Conversation' : 'New Conversation')}
            </div>
          </div>
          {isTempChat && (
            <div className="temp-mode-pill" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 10px',
              background: 'var(--surf-hi)',
              borderRadius: 'var(--r-pill)',
              fontSize: '12px',
              color: 'var(--out)',
            }}>
              <span className="ms sm">history_toggle_off</span>
              <span>Temporary</span>
            </div>
          )}
        </div>

        {/* Chat Messages */}
        <div
          id="chat-wrap"
          ref={chatWrapRef}
          style={{ flex: 1, overflowY: 'auto', paddingBottom: '120px' }}
        >
          <div className="chat-inner" id="chat-inner" style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
            {messages.length === 0 ? (
              /* Welcome Screen */
              <div id="welcome" style={{ textAlign: 'center', padding: '60px 20px' }}>
                <div className="w-logo" style={{ marginBottom: '20px' }}>
                  <span className="ms xl fill" style={{ fontSize: '48px', color: 'var(--p)' }}>auto_awesome</span>
                </div>
                <div className="w-heading" style={{ fontSize: '28px', fontWeight: 800, marginBottom: '12px' }}>
                  OrchidLLM Playground
                </div>
                <div className="w-sub" style={{ fontSize: '15px', color: 'var(--out)', maxWidth: '500px', margin: '0 auto 24px', lineHeight: 1.6 }}>
                  One screen. Every model. Chat with text models, generate images, transcribe audio, and more — all powered by Pollinations.ai.
                </div>
                <m3e-chip-set className="w-chips" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'center' }}>
                  <m3e-assist-chip onClick={() => setInputVal('Tell me something fascinating about the universe')}>
                    ✨ Fascinating fact
                  </m3e-assist-chip>
                  <m3e-assist-chip onClick={() => setInputVal('Write a short poem about the ocean at night')}>
                    🌊 Write a poem
                  </m3e-assist-chip>
                  <m3e-assist-chip onClick={() => setInputVal('Explain quantum entanglement simply')}>
                    🔬 Explain science
                  </m3e-assist-chip>
                  <m3e-assist-chip onClick={() => setInputVal('What can you help me with today?')}>
                    💬 What can you do?
                  </m3e-assist-chip>
                </m3e-chip-set>
              </div>
            ) : (
              /* Messages */
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`chat-msg ${msg.role}`}
                  style={{
                    display: 'flex',
                    gap: '12px',
                    marginBottom: '20px',
                    flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
                  }}
                >
                  <div
                    className="msg-avatar"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      background: msg.role === 'user' ? 'var(--p)' : 'var(--surf-hi)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    <span className="ms sm" style={{ color: msg.role === 'user' ? 'var(--on-p)' : 'var(--on-surf)' }}>
                      {msg.role === 'user' ? 'person' : 'auto_awesome'}
                    </span>
                  </div>
                  <div
                    className="msg-content"
                    style={{
                      flex: 1,
                      padding: '12px 16px',
                      borderRadius: 'var(--r-lg)',
                      background: msg.role === 'user' ? 'var(--pc)' : 'var(--surf-lo)',
                      maxWidth: '80%',
                      whiteSpace: 'pre-wrap',
                      lineHeight: 1.6,
                    }}
                  >
                    {msg.content || (isLoading && msg.role === 'assistant' ? (
                      <span style={{ color: 'var(--out)' }}>Thinking...</span>
                    ) : null)}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Input Area */}
        <div id="input-area" style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '16px',
          background: 'linear-gradient(transparent, var(--surf) 20%)',
        }}>
          <div className="input-area-inner" style={{
            maxWidth: '800px',
            margin: '0 auto',
            background: 'var(--surf)',
            borderRadius: 'var(--r-xl)',
            border: '1px solid var(--out-v)',
            boxShadow: 'var(--sh2)',
          }}>
            <div className="input-row" style={{ display: 'flex', alignItems: 'flex-end', padding: '8px 12px' }}>
              <textarea
                ref={inputRef}
                id="msg-input"
                placeholder="Message OrchidLLM."
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                style={{
                  flex: 1,
                  border: 'none',
                  background: 'transparent',
                  resize: 'none',
                  outline: 'none',
                  fontSize: '15px',
                  lineHeight: 1.5,
                  padding: '8px',
                  maxHeight: '200px',
                  fontFamily: 'inherit',
                }}
              />
              <div className="input-acts" style={{ display: 'flex', gap: '4px', paddingBottom: '4px' }}>
                <m3e-icon-button
                  id="send-btn"
                  variant="filled"
                  disabled={!inputValue.trim() || isLoading}
                  title="Send"
                  onClick={handleSendMessage}
                >
                  <m3e-icon name="arrow_upward"></m3e-icon>
                </m3e-icon-button>
              </div>
            </div>

            {/* Toolbar */}
            <div className="input-toolbar" style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '8px 12px',
              borderTop: '1px solid var(--out-v)',
            }}>
              <m3e-button variant="outlined" size="small" style={{ fontSize: '13px' }}>
                <m3e-icon slot="icon" name="psychology"></m3e-icon>
                <span style={{ marginLeft: '4px' }}>{selectedModel}</span>
              </m3e-button>
              <div style={{ flex: 1 }}></div>
              <m3e-icon-button title="Attach file">
                <m3e-icon name="attach_file"></m3e-icon>
              </m3e-icon-button>
            </div>
          </div>
        </div>
      </main>

      {/* Sign In Modal */}
      <SignInModal open={showSignIn} onClose={() => setShowSignIn(false)} />
    </m3e-theme>
  );
}
