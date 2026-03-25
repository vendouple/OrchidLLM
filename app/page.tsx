/// <reference path="../global.d.ts" />
'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { SignInModal } from '@/components/auth/SignInModal';
import { UserMenu } from '@/components/auth/UserMenu';
import { ChatMessageState } from '@/lib/types';

export default function ChatPage() {
  const [showSignIn, setShowSignIn] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [inputValue, setInputValue] = useState('');
  const [showDropup, setShowDropup] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('text');
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMobileMore, setShowMobileMore] = useState(false);

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
    clearAllChats,
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

  // Categories
  const categories = [
    { id: 'text', label: 'Text', icon: 'psychology' },
    { id: 'image', label: 'Image', icon: 'image' },
    { id: 'vision', label: 'Vision', icon: 'visibility' },
    { id: 'audio', label: 'Audio', icon: 'graphic_eq' },
    { id: 'video', label: 'Video', icon: 'videocam' },
  ];

  // Models (sample - would come from API)
  const models: Record<string, { id: string; name: string; provider: string }[]> = {
    text: [
      { id: 'openai', name: 'OpenAI GPT-4o', provider: 'pollinations' },
      { id: 'openai-large', name: 'OpenAI GPT-4o Large', provider: 'pollinations' },
      { id: 'claude-hybridspace', name: 'Claude Hybridspace', provider: 'pollinations' },
      { id: 'mistral', name: 'Mistral Large', provider: 'pollinations' },
      { id: 'llama', name: 'Llama 3.3', provider: 'pollinations' },
      { id: 'deepseek', name: 'DeepSeek V3', provider: 'pollinations' },
    ],
    image: [
      { id: 'flux', name: 'Flux', provider: 'pollinations' },
      { id: 'flux-pro', name: 'Flux Pro', provider: 'pollinations' },
    ],
    audio: [
      { id: 'openai-audio', name: 'OpenAI TTS', provider: 'pollinations' },
    ],
    video: [
      { id: 'video-gen', name: 'Video Generator', provider: 'pollinations' },
    ],
    vision: [
      { id: 'openai-vision', name: 'GPT-4 Vision', provider: 'pollinations' },
    ],
  };

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

  // Close dropup on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (showDropup && !(e.target as Element)?.closest('#dropup-panel') && !(e.target as Element)?.closest('#model-split-btn')) {
        setShowDropup(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showDropup]);

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

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen);
    setMobileMenuOpen(!mobileMenuOpen);
  };

  const showComingSoon = (feature: string) => {
    alert(`${feature} coming soon!`);
  };

  const currentChatTitle = isTempChat
    ? 'Temporary Chat'
    : currentChatId
      ? chats[currentChatId]?.title || 'New Conversation'
      : 'New Conversation';

  const filteredModels = (models[selectedCategory] || []).filter((m) =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  return (
    <m3e-theme id="app" color-scheme={theme} style={{ display: 'flex', width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {/* ═══════ SIDEBAR (Drawer) ═══════ */}
      <aside id="sidebar" className={`side ${sidebarOpen ? '' : 'hide'}`} style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--out-v)' }}>
        <div className="side-head" style={{ paddingTop: '16px', paddingLeft: '16px', paddingRight: '16px', display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <div className="w-logo" style={{ width: '42px', height: '42px', minWidth: '42px', borderRadius: '12px' }}>
            <span className="ms fill" style={{ fontSize: '24px' }}>auto_awesome</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="top-title" style={{ fontSize: '26px', fontWeight: 800, lineHeight: 1, margin: 0, letterSpacing: '-0.02em' }}>OrchidLLM</div>
            <div style={{ fontSize: '11px', color: 'var(--out)', marginTop: '4px', fontWeight: 600 }}>
              Powered by <a href="https://pollinations.ai" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--p)', textDecoration: 'none' }}>pollinations.ai</a>
            </div>
          </div>
        </div>

        <div className="new-chat-row" style={{ marginTop: '20px' }}>
          <button className="new-chat-btn" id="new-chat-btn" type="button" onClick={handleNewChat}>
            <span className="ms">add</span> New Chat
          </button>
          <div className="temp-wrap" style={{ position: 'relative' }}>
            <button className={`temp-btn ${isTempChat ? 'active' : ''}`} id="temp-btn" type="button" aria-label="Temporary chat" onClick={() => toggleTempChat()}>
              <span className="ms">schedule</span>
              {isTempChat && <div className="temp-dot-badge"></div>}
            </button>
          </div>
        </div>

        <div className="hist-scroll" id="hist-scroll" style={{ marginTop: '10px' }}>
          {chatList.map((chat) => (
            <div
              key={chat.id}
              className={`hist-item ${currentChatId === chat.id ? 'active' : ''}`}
              onClick={() => setCurrentChat(chat.id)}
            >
              <span className="ms sm" style={{ color: 'var(--out)' }}>chat_bubble</span>
              <span className="hist-title">{chat.title}</span>
              <button
                className="hist-del"
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                type="button"
              >
                <span className="ms sm">delete</span>
              </button>
            </div>
          ))}
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'none' }}></div>

        {/* Sidebar quick nav */}
        <div className="side-quicknav" id="side-quicknav" style={{ marginTop: 'auto' }}>
          <div className="qn-label">Quick Access</div>
          <div className="qn-item" onClick={() => showComingSoon('Explore Apps')}>
            <span className="ms sm">grid_view</span>
            <span className="qn-text">Explore Apps</span>
            <span className="qn-badge soon">Soon</span>
          </div>
          <div className="qn-item" onClick={() => showComingSoon('Character Library')}>
            <span className="ms sm">auto_stories</span>
            <span className="qn-text">Character Library</span>
            <span className="qn-badge soon">Soon</span>
          </div>
          <div className="qn-item" onClick={() => showComingSoon('Usage Dashboard')}>
            <span className="ms sm">bar_chart</span>
            <span className="qn-text">Usage Dashboard</span>
            <span className="qn-badge soon">Soon</span>
          </div>
        </div>

        <div className="side-foot" style={{ padding: '12px 16px', borderTop: '1px solid var(--out-v)', display: 'flex', alignItems: 'center', gap: '10px' }}>
          <UserMenu onSignInClick={() => setShowSignIn(true)} />
          <m3e-icon-button id="settings-btn" title="Settings" variant="tonal" onClick={() => setShowSettingsDialog(true)}>
            <m3e-icon name="settings"></m3e-icon>
          </m3e-icon-button>
        </div>
      </aside>

      {/* ═══════ MOBILE OVERLAY ═══════ */}
      <div id="side-ov" className={mobileMenuOpen ? 'show' : ''} onClick={() => { setSidebarOpen(false); setMobileMenuOpen(false); }}></div>

      {/* ═══════ MAIN ═══════ */}
      <main id="main" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>
        {/* Demo Banner */}
        {apiMode === 'demo' && (
          <div id="demo-banner">
            <span className="ms sm">bolt</span>
            Demo mode
            <div className="demo-pill" id="demo-counter">{demoRequestsLeft} requests left</div>
          </div>
        )}

        {/* Topbar (Mobile Only) */}
        <header id="topbar" className="mobile-only">
          <m3e-icon-button id="sidebar-toggle" onClick={toggleSidebar}>
            <m3e-icon name="menu"></m3e-icon>
          </m3e-icon-button>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="chat-title-label" style={{ fontSize: '10px', color: 'var(--out)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Chat</div>
            <div id="mobile-chat-title" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--on-surf)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {currentChatTitle}
            </div>
          </div>

          <div className="topbar-actions">
            <m3e-icon-button id="mobile-new-chat-btn" title="New chat" onClick={handleNewChat}>
              <m3e-icon name="add_comment"></m3e-icon>
            </m3e-icon-button>
            <m3e-icon-button id="mobile-more-btn" title="Chat actions" onClick={() => setShowMobileMore(!showMobileMore)}>
              <m3e-icon name="more_vert"></m3e-icon>
            </m3e-icon-button>
          </div>
        </header>

        <div id="mobile-menu-ov" className={showMobileMore ? 'show' : ''} onClick={() => setShowMobileMore(false)}></div>
        <div id="mobile-more-menu" className={`mobile-menu ${showMobileMore ? 'show' : ''}`}>
          <button type="button" onClick={() => { if (currentChatId) deleteChat(currentChatId); setShowMobileMore(false); }}>
            <span className="ms sm">delete</span>Delete chat
          </button>
          <button type="button" disabled>
            <span className="ms sm">ios_share</span>Export chat
          </button>
          <button type="button" disabled>
            <span className="ms sm">feedback</span>Feedback (soon)
          </button>
        </div>

        {/* Desktop Chat Header */}
        <div id="chat-top" className="desktop-only">
          <m3e-icon-button id="desktop-menu-btn" title="Toggle sidebar" onClick={toggleSidebar}>
            <m3e-icon name="menu"></m3e-icon>
          </m3e-icon-button>
          <div className="chat-top-title">
            <div className="chat-title-label">Conversation</div>
            <div id="chat-title">{currentChatTitle}</div>
          </div>
          {isTempChat && (
            <div className="temp-mode-pill" id="temp-mode-pill" style={{ marginLeft: 'auto' }}>
              <span className="ms sm">history_toggle_off</span>
              <span className="hide-mobile">Temporary</span>
            </div>
          )}
          {apiMode === 'demo' && (
            <div className="demo-mode-pill" id="demo-mode-pill">
              <span className="ms sm">bolt</span>
              <span className="hide-mobile">Demo mode</span>
            </div>
          )}
          <m3e-icon-button id="desktop-more-btn" title="Chat actions">
            <m3e-icon name="more_vert"></m3e-icon>
          </m3e-icon-button>
        </div>

        {/* Toast Host */}
        <div id="toast-host"></div>

        {/* Chat */}
        <div id="chat-wrap" ref={chatWrapRef} style={{ flex: 1, overflowY: 'auto', paddingBottom: '120px' }}>
          <div className="chat-inner" id="chat-inner">
            {messages.length === 0 ? (
              /* Welcome */
              <div id="welcome">
                <div className="w-logo"><span className="ms xl fill">auto_awesome</span></div>
                <div className="w-heading">OrchidLLM Playground</div>
                <div className="w-sub">One screen. Every model. Chat with text models, generate images, transcribe audio, and more — all powered by Pollinations.ai.</div>
                <m3e-chip-set className="w-chips">
                  <m3e-assist-chip onClick={() => setInputVal('Tell me something fascinating about the universe')}>✨ Fascinating fact</m3e-assist-chip>
                  <m3e-assist-chip onClick={() => setInputVal('Write a short poem about the ocean at night')}>🌊 Write a poem</m3e-assist-chip>
                  <m3e-assist-chip onClick={() => setInputVal('Explain quantum entanglement simply')}>🔬 Explain science</m3e-assist-chip>
                  <m3e-assist-chip onClick={() => setInputVal('What can you help me with today?')}>💬 What can you do?</m3e-assist-chip>
                </m3e-chip-set>
              </div>
            ) : (
              /* Messages */
              messages.map((msg) => (
                <div key={msg.id} className={`msg-row ${msg.role}`}>
                  <div className={`avatar ${msg.role === 'user' ? 'user-av' : 'ai-av'}`}>
                    {msg.role === 'user' ? (
                      'U'
                    ) : (
                      <span className="ms">auto_awesome</span>
                    )}
                  </div>
                  <div className="bubble">
                    {msg.content || (isLoading && msg.role === 'assistant' ? (
                      <span style={{ color: 'var(--out)' }}>Thinking...</span>
                    ) : null)}
                  </div>
                  {msg.role === 'assistant' && (
                    <div className="msg-meta">
                      {msg.model && <span>{msg.model}</span>}
                      {msg.time && <span> · {msg.time}</span>}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* Input Area */}
        <div id="input-area">
          <div className="input-area-inner">
            {/* Attachments Preview container */}
            <div className="attach-preview" id="attach-preview"></div>

            <div className="input-row">
              <textarea
                ref={inputRef}
                id="msg-input"
                placeholder="Message OrchidLLM."
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="input-acts">
                <m3e-icon-button id="composer-expand-btn" type="button" title="Expand composer">
                  <m3e-icon name="open_in_full" id="composer-expand-icon"></m3e-icon>
                </m3e-icon-button>
                <m3e-icon-button
                  id="send-btn"
                  variant="filled"
                  disabled={!inputValue.trim() || isLoading || undefined}
                  title="Send"
                  onClick={handleSendMessage}
                >
                  <m3e-icon name="arrow_upward"></m3e-icon>
                </m3e-icon-button>
              </div>
            </div>

            {/* Toolbar — BELOW textarea */}
            <div className="input-toolbar">
              <div id="tools-wrap" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}>
                <m3e-button-group variant="connected" className="composer-segbar" id="composer-m3e-segbar">
                  <m3e-button variant="outlined" id="model-split-btn" type="button" aria-label="Select model" onClick={() => setShowDropup(!showDropup)}>
                    <m3e-icon slot="icon" name="psychology"></m3e-icon>
                    <span id="cat-badge" className="cat-badge cb-text hide-mobile">Text</span>
                    <span id="model-name-display" className="model-label">{selectedModel}</span>
                  </m3e-button>

                  <m3e-icon-button variant="outlined" id="tools-btn" type="button" title="Tools" aria-label="Tools">
                    <m3e-icon name="tune"></m3e-icon>
                  </m3e-icon-button>

                  <m3e-icon-button variant="outlined" id="enhance-btn" type="button" title="Enhance prompt" aria-label="Enhance prompt">
                    <m3e-icon name="auto_fix_high"></m3e-icon>
                  </m3e-icon-button>
                </m3e-button-group>
              </div>

              {/* Spacer */}
              <div style={{ flex: 1 }}></div>

              <m3e-button-group variant="connected" className="quick-modes" id="quick-modes" aria-label="More modes">
                <m3e-button variant="outlined" data-qmode="voice" disabled title="Coming soon">
                  <m3e-icon slot="icon" name="graphic_eq"></m3e-icon>
                  <span className="hide-mobile">Voice</span>
                </m3e-button>
                <m3e-button variant="outlined" data-qmode="agentic" disabled title="Coming soon">
                  <m3e-icon slot="icon" name="smart_toy"></m3e-icon>
                  <span className="hide-mobile">Agentic</span>
                </m3e-button>
              </m3e-button-group>

              {/* Attach button */}
              <m3e-icon-button id="attach-btn" title="Attach file" style={{ flexShrink: 0 }}>
                <m3e-icon name="attach_file"></m3e-icon>
              </m3e-icon-button>
            </div>
          </div>
        </div>
      </main>

      {/* ═══════ MODEL DROPUP ═══════ */}
      <div id="dropup-wrap" className={showDropup ? 'open' : ''}>
        <div id="dropup-bg" onClick={() => setShowDropup(false)}></div>
        <div id="dropup-panel">
          <div className="du-cats" id="du-cats">
            {categories.map((cat) => (
              <button
                key={cat.id}
                type="button"
                className={`du-cat ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span className="ms sm">{cat.icon}</span>
                <span>{cat.label}</span>
              </button>
            ))}
          </div>
          <div className="du-models">
            <div className="du-search">
              <span className="ms sm" style={{ color: 'var(--out)' }}>search</span>
              <input
                type="text"
                placeholder="Search models…"
                id="model-search"
                autoComplete="off"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
              />
            </div>
            <div className="du-list" id="du-list">
              {filteredModels.map((model) => (
                <div
                  key={model.id}
                  className={`du-item ${selectedModel === model.id ? 'active' : ''}`}
                  onClick={() => { setSelectedModel(model.id); setShowDropup(false); }}
                >
                  <div className="du-item-info">
                    <div className="du-item-name">{model.name}</div>
                    <div className="du-item-provider">{model.provider}</div>
                  </div>
                  {selectedModel === model.id && (
                    <span className="ms sm" style={{ color: 'var(--p)' }}>check</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ═══════ SETTINGS DIALOG (M3E) ═══════ */}
      <m3e-dialog id="settings-dlg" dismissible open={showSettingsDialog || undefined} onClose={() => setShowSettingsDialog(false)} style={{ '--m3e-dialog-max-width': '920px', '--m3e-dialog-width': 'min(920px, calc(100vw - 12px))' } as React.CSSProperties}>
        <span slot="header">
          <m3e-icon name="settings" style={{ verticalAlign: 'middle', marginRight: '8px' }}></m3e-icon>
          Settings
        </span>

        <m3e-tabs variant="secondary" id="settings-tabs">
          <m3e-tab selected for="s-general"><m3e-icon slot="icon" name="tune"></m3e-icon>General</m3e-tab>
          <m3e-tab for="s-api"><m3e-icon slot="icon" name="vpn_key"></m3e-icon>API</m3e-tab>
          <m3e-tab for="s-history"><m3e-icon slot="icon" name="history"></m3e-icon>History</m3e-tab>
          <m3e-tab for="s-about"><m3e-icon slot="icon" name="info"></m3e-icon>About</m3e-tab>

          <m3e-tab-panel id="s-general">
            <div className="settings-panel-inner">
              <div className="sec-title">General</div>
              <div style={{ height: '8px' }}></div>
              <div className="srow srow-col">
                <div className="srow-head">
                  <span className="ms fill">psychology</span>
                  <div className="srow-info">
                    <div className="srow-label">System Prompt</div>
                    <div className="srow-desc">Default instruction for text models</div>
                  </div>
                </div>
                <textarea className="stxt" id="sys-prompt" placeholder="You are a helpful AI assistant…"></textarea>
              </div>
              <div style={{ height: '8px' }}></div>
              <div className="sec-title">Theming</div>
              <div className="srow srow-col" style={{ padding: '16px' }}>
                <div className="srow-head" style={{ marginBottom: 0 }}>
                  <span className="ms fill" style={{ color: 'var(--p)' }}>palette</span>
                  <div className="srow-info" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div className="srow-label">Mode & Orchid Theme</div>
                      <m3e-switch id="s-dark-tog" aria-label="Toggle dark mode" selected={theme === 'dark' || undefined} onchange={() => toggleTheme()}></m3e-switch>
                    </div>
                    <div className="srow-desc">Seamlessly swap between Light and Dark themes</div>
                  </div>
                </div>
              </div>
            </div>
          </m3e-tab-panel>

          <m3e-tab-panel id="s-api">
            <div className="settings-panel-inner">
              <div className="sec-title">API Mode</div>
              <div className="srow srow-col">
                <div className="srow-head">
                  <span className="ms fill">swap_horiz</span>
                  <div className="srow-info">
                    <div className="srow-label">Mode</div>
                    <div className="srow-desc">Pick one mode. Selected card expands with detailed controls.</div>
                  </div>
                </div>
                <div className="mode-cards" id="api-mode-cards">
                  <article className={`mode-card ${apiMode === 'demo' ? 'active' : ''}`} data-mode-card="demo" tabIndex={0} role="button" aria-pressed={apiMode === 'demo'}>
                    <div className="mode-card-head">
                      <div className="mode-card-title">Demo Mode</div>
                      <label className="mode-radio" aria-label="Select demo mode">
                        <input type="radio" name="api-mode" value="demo" checked={apiMode === 'demo'} readOnly />
                      </label>
                    </div>
                    <div className="mode-card-short">Use shared demo key with daily limits.</div>
                    <div className="mode-card-expanded">
                      <p>Best for testing and quick previews. Demo Mode uses the shared Pollinations key with a daily request cap.</p>
                    </div>
                  </article>

                  <article className={`mode-card ${apiMode === 'bpolly' ? 'active' : ''}`} data-mode-card="byop" tabIndex={0} role="button" aria-pressed={apiMode === 'bpolly'}>
                    <div className="mode-card-head">
                      <div className="mode-card-title">BYOP</div>
                      <label className="mode-radio" aria-label="Select BYOP mode">
                        <input type="radio" name="api-mode" value="byop" checked={apiMode === 'bpolly'} readOnly />
                      </label>
                    </div>
                    <div className="mode-card-short">Bring your own Pollinations key.</div>
                    <div className="mode-card-expanded">
                      <p>Use your own API key for personal usage and fewer demo restrictions. The key is stored locally in your browser.</p>
                      <input className="s-input" id="byop-key-input" type="password" placeholder="Enter your BYOP key" />
                    </div>
                  </article>
                </div>
              </div>
            </div>
          </m3e-tab-panel>

          <m3e-tab-panel id="s-history">
            <div className="settings-panel-inner">
              <div className="sec-title">Chat History</div>
              <div className="btn-row">
                <m3e-button variant="outlined" id="export-btn">
                  <m3e-icon slot="icon" name="download"></m3e-icon> Export
                </m3e-button>
                <m3e-button variant="tonal" id="clear-btn" style={{ '--m3e-button-container-color': 'var(--err-c)', '--m3e-button-label-color': 'var(--err)' } as React.CSSProperties} onClick={() => clearAllChats()}>
                  <m3e-icon slot="icon" name="delete_sweep"></m3e-icon> Clear all
                </m3e-button>
              </div>
            </div>
          </m3e-tab-panel>

          <m3e-tab-panel id="s-about">
            <div className="settings-panel-inner">
              <div className="sec-title">About OrchidLLM</div>
              <div style={{ fontSize: '14px', color: 'var(--out)' }}>UI and feature wrapper powered by Pollinations.ai.</div>
              <div style={{ height: '16px' }}></div>
              <a href="https://github.com/matraic/m3e" target="_blank" rel="noopener noreferrer" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: 'var(--on-surf)', textDecoration: 'none', padding: '8px 12px', borderRadius: 'var(--r-md)', background: 'var(--surf-hi)' }}>
                <m3e-icon name="code" style={{ fontSize: '18px', color: 'var(--p)' }}></m3e-icon> View M3E Component Library
              </a>
              <div style={{ height: '16px' }}>
                <span style={{ fontSize: '14px', color: 'var(--out)' }}>This app is still in beta! Expect Bugs!</span>
                <br />
                Version: v0.1.0
              </div>
            </div>
          </m3e-tab-panel>
        </m3e-tabs>
      </m3e-dialog>

      {/* Hidden file input */}
      <input type="file" id="file-input" multiple accept="image/*,audio/*,video/*,.pdf,.txt,.json" style={{ display: 'none' }} />

      {/* Sign In Modal */}
      <SignInModal open={showSignIn} onClose={() => setShowSignIn(false)} />
    </m3e-theme>
  );
}
