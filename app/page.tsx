/// <reference path="../global.d.ts" />
'use client';

import { useState, useRef, useEffect } from 'react';
import { useChatStore } from '@/stores/chatStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { SignInModal } from '@/components/auth/SignInModal';
import { ChatMessageState } from '@/lib/types';

export default function ChatPage() {
  const [showSignIn, setShowSignIn] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isMobile, setIsMobile] = useState(false);
  const [inputValue, setInputValue] = useState('');
  const [showDropup, setShowDropup] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  // selectedCategory = category being BROWSED in dropup
  const [selectedCategory, setSelectedCategory] = useState<string>('text');
  // activeCat = COMMITTED category of selected model (drives Tools vs Enhance button)
  const [activeCat, setActiveCat] = useState<string>('text');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [showMobileMore, setShowMobileMore] = useState(false);
  const [showEnhanceDialog, setShowEnhanceDialog] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [imageViewerSrc, setImageViewerSrc] = useState('');
  const [imageViewerScale, setImageViewerScale] = useState(1);
  const [showPwaNudge, setShowPwaNudge] = useState(false);
  const [showDemoDataBanner, setShowDemoDataBanner] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);
  const [showToolsPop, setShowToolsPop] = useState(false);
  const [activeToolCat, setActiveToolCat] = useState('image');
  const [textTools, setTextTools] = useState({ image: true, video: false, audio: false });
  const [textToolModels, setTextToolModels] = useState({ image: 'openai', video: 'openai', audio: 'openai' });
  const [enhanceModel, setEnhanceModel] = useState('openai');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [enhancedPrompt, setEnhancedPrompt] = useState('');
  const [showEnhanced, setShowEnhanced] = useState(false);
  const [settingsTab, setSettingsTab] = useState('general');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [demoUiMode, setDemoUiMode] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(false);
  // Models loaded from public/models.json
  const [modelsData, setModelsData] = useState<Record<string, {id:string;name:string;desc:string;context:string;pro:boolean;capabilities:string[]}[]>>({});
  // Suggestions loaded from suggestionstrip.json, rotated per category
  const [suggestions, setSuggestions] = useState<Record<string,{emoji:string;title:string;prompt:string}[]>>({});
  const [rotatedChips, setRotatedChips] = useState<{emoji:string;title:string;prompt:string}[]>([]);

  const chatWrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const settingsDlgRef = useRef<HTMLElement>(null);
  const enhanceDlgRef = useRef<HTMLElement>(null);
  const clearConfirmDlgRef = useRef<HTMLElement>(null);

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

  // Categories (text, image, vision, audio, video, transcription)
  const categories = [
    { id: 'text',          label: 'Text',          icon: 'psychology' },
    { id: 'image',         label: 'Image',         icon: 'image' },
    { id: 'vision',        label: 'Vision',        icon: 'visibility' },
    { id: 'audio',         label: 'Audio',         icon: 'graphic_eq' },
    { id: 'video',         label: 'Video',         icon: 'videocam' },
    { id: 'transcription', label: 'Transcribe',    icon: 'mic' },
  ];

  // Fallback hardcoded models (overridden once JSON loads)
  const FALLBACK_MODELS: Record<string, {id:string;name:string;desc:string;context:string;pro:boolean;capabilities:string[]}[]> = {
    text: [
      { id:'openai',       name:'OpenAI GPT-4o Mini', desc:'Fast and balanced',             context:'1K',  pro:false, capabilities:['vision','tools'] },
      { id:'openai-large', name:'OpenAI GPT-4o',      desc:'Most powerful and intelligent', context:'150', pro:true,  capabilities:['vision','tools'] },
      { id:'mistral',      name:'Mistral Small 3.2',  desc:'Efficient and cost-effective',  context:'4.9K',pro:false, capabilities:['tools'] },
    ],
    image: [
      { id:'flux',     name:'Flux Schnell', desc:'Fast high-quality image generation',context:'1K',pro:false,capabilities:['vision'] },
      { id:'flux-pro', name:'Flux Pro',     desc:'Higher quality images',             context:'1K',pro:true, capabilities:['vision'] },
    ],
    audio: [
      { id:'elevenlabs', name:'ElevenLabs v3 TTS', desc:'Expressive voices', context:'35', pro:false, capabilities:['audio-out'] },
    ],
    video: [
      { id:'grok-video', name:'Grok Video', desc:'xAI video generation', context:'70', pro:false, capabilities:['vision'] },
    ],
    vision: [
      { id:'openai', name:'GPT-4o Vision', desc:'Vision understanding', context:'1K', pro:false, capabilities:['vision'] },
    ],
    transcription: [
      { id:'whisper-large-v3', name:'Whisper Large V3', desc:'Speech-to-text', context:'1.3K', pro:false, capabilities:['audio-in'] },
    ],
  };

  // Merged models: prefer loaded JSON per category, fill missing ones from FALLBACK
  const models = Object.keys(modelsData).length > 0
    ? {
        ...FALLBACK_MODELS,
        ...Object.fromEntries(
          Object.entries(modelsData).filter(([, list]) => list.length > 0)
        ),
      }
    : FALLBACK_MODELS;

  // Helper: find a model name by id across all categories
  const findModelName = (id: string): string => {
    for (const list of Object.values(models)) {
      const found = list.find(m => m.id === id);
      if (found) return found.name;
    }
    return id;
  };

  // Palette helper — matches legacy hslToHex + STATIC_PALETTES
  const STATIC_PALETTES: Record<string, {hueP:number,hueS:number,hueT:number}> = {
    light1:{hueP:285,hueS:320,hueT:260}, light2:{hueP:330,hueS:350,hueT:310}, light3:{hueP:260,hueS:280,hueT:230},
    dark1:{hueP:285,hueS:320,hueT:260},  dark2:{hueP:330,hueS:350,hueT:310},  dark3:{hueP:260,hueS:280,hueT:230},
  };
  function hslToHex(h: number, s: number, l: number) {
    s /= 100; l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => { const k=(n+h/30)%12; const c=l-a*Math.max(-1,Math.min(k-3,9-k,1)); return Math.round(255*c).toString(16).padStart(2,'0'); };
    return `#${f(0)}${f(8)}${f(4)}`;
  }
  function applyPaletteColors(hueP: number, hueS: number, hueT: number, dark: boolean) {
    const r = document.documentElement;
    r.style.setProperty('--p',   hslToHex(hueP, dark?65:72, dark?78:42));
    r.style.setProperty('--on-p', dark?'#000':'#fff');
    r.style.setProperty('--pc',  hslToHex(hueP, dark?30:80, dark?18:93));
    r.style.setProperty('--on-pc',hslToHex(hueP, 60, dark?88:22));
    r.style.setProperty('--s',   hslToHex(hueS, dark?60:68, dark?75:40));
    r.style.setProperty('--on-s', dark?'#000':'#fff');
    r.style.setProperty('--sc',  hslToHex(hueS, dark?30:75, dark?16:92));
    r.style.setProperty('--on-sc',hslToHex(hueS, 55, dark?85:20));
    r.style.setProperty('--t',   hslToHex(hueT, dark?55:70, dark?72:44));
    r.style.setProperty('--on-t', dark?'#000':'#fff');
    r.style.setProperty('--tc',  hslToHex(hueT, dark?28:75, dark?15:92));
    r.style.setProperty('--on-tc',hslToHex(hueT, 55, dark?85:20));
  }
  function paintPaletteSwatches(dark: boolean) {
    ['1','2','3'].forEach(id => {
      const pal = STATIC_PALETTES[`${dark?'dark':'light'}${id}`];
      const el = document.getElementById(`pal-var-${id}`);
      if (!pal || !el) return;
      const p = hslToHex(pal.hueP, dark?65:72, dark?78:42);
      const s = hslToHex(pal.hueS, dark?60:68, dark?75:40);
      const t = hslToHex(pal.hueT, dark?55:70, dark?72:44);
      el.style.background = `linear-gradient(135deg,${p},${s},${t})`;
      el.style.border = '2px solid transparent';
      el.style.width = '24px'; el.style.height = '24px'; el.style.borderRadius = '50%';
    });
  }

  // Load models from public/models.json
  useEffect(() => {
    fetch('/models.json')
      .then(r => r.json())
      .then(data => { if (data?.categories) setModelsData(data.categories); })
      .catch(() => {});
  }, []);

  // Load suggestions from suggestionstrip.json, then rotate every 9s
  useEffect(() => {
    fetch('/suggestionstrip.json')
      .then(r => r.json())
      .then(data => { setSuggestions(data); })
      .catch(() => {});
  }, []);

  // Rotate chips when suggestions load or activeCat changes
  useEffect(() => {
    const pickChips = () => {
      const pool = suggestions[activeCat] || suggestions['text'] || [];
      if (!pool.length) return;
      const shuffled = [...pool].sort(() => Math.random() - 0.5);
      setRotatedChips(shuffled.slice(0, 4));
    };
    pickChips();
    const iv = setInterval(pickChips, 9000);
    return () => clearInterval(iv);
  }, [suggestions, activeCat]);

  useEffect(() => {
    const mobile = window.innerWidth < 1280;
    setIsMobile(mobile);
    if (mobile) setSidebarOpen(false);
    setIsDarkMode(theme === 'dark');
    paintPaletteSwatches(theme === 'dark');
    const onResize = () => setIsMobile(window.innerWidth < 1280);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // Re-paint swatches whenever dialog opens
  useEffect(() => { paintPaletteSwatches(isDarkMode); }, [isDarkMode]);

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

  // Legacy-matching newChat: just resets state, does NOT persist an empty chat
  const handleNewChat = () => {
    if (isTempChat) toggleTempChat();
    setCurrentChat(null);
    setInputValue('');
  };

  const handleSendMessage = async () => {
    if (!inputValue.trim() || isLoading) return;

    const userMessage: ChatMessageState = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      role: 'user',
      content: inputValue.trim(),
      time: new Date().toLocaleTimeString(),
    };

    // Create chat if needed (only on first send)
    if (!currentChatId && !isTempChat) {
      const id = createChat();
      // Small delay so store updates before addMessage
      await new Promise(r => setTimeout(r, 0));
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

  // Matches legacy setSidebar: uses desktop-collapsed on desktop, closed+overlay on mobile
  const setSidebar = (open: boolean) => {
    setSidebarOpen(open);
    const sb = document.getElementById('sidebar');
    const ov = document.getElementById('side-ov');
    if (!sb || !ov) return;
    if (isMobile) {
      sb.classList.remove('desktop-collapsed');
      sb.classList.toggle('closed', !open);
      ov.classList.toggle('show', open);
      setMobileMenuOpen(open);
    } else {
      ov.classList.remove('show');
      sb.classList.remove('closed');
      sb.classList.toggle('desktop-collapsed', !open);
    }
  };
  const toggleSidebar = () => setSidebar(!sidebarOpen);

  // Toast helper: insert a permanent host in body so it's always available
  const showToast = (msg: string, icon = 'info') => {
    let host = document.getElementById('toast-host');
    if (!host) {
      host = document.createElement('div');
      host.id = 'toast-host';
      document.body.appendChild(host);
    }
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<span class="ms" style="font-size:18px">${icon}</span> ${msg}`;
    host.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 350); }, 2800);
  };

  const showComingSoon = (feature: string) => {
    showToast(`${feature} is coming soon`, 'hourglass_top');
  };

  // Open settings via M3E dialog's own .show() so it can reopen after close
  const openSettings = () => {
    const dlg = settingsDlgRef.current as any;
    if (dlg && typeof dlg.show === 'function') dlg.show();
    else if (dlg) dlg.open = true;
    const darkTog = document.getElementById('s-dark-tog') as any;
    if (darkTog) darkTog.checked = isDarkMode;
    const demoTog = document.getElementById('s-demo-ui-tog') as any;
    if (demoTog) demoTog.checked = demoUiMode;
    setTimeout(() => paintPaletteSwatches(isDarkMode), 50);
  };
  const closeSettings = () => {
    const dlg = settingsDlgRef.current as any;
    if (dlg && typeof dlg.close === 'function') dlg.close();
    else if (dlg) dlg.open = false;
  };

  const handleEnhancePrompt = () => {
    if (!inputValue.trim()) return;
    setOriginalPrompt(inputValue);
    setEnhancedPrompt('');
    setShowEnhanced(false);
    const dlg = enhanceDlgRef.current as any;
    if (dlg && typeof dlg.show === 'function') dlg.show();
    else if (dlg) dlg.open = true;
  };

  const doEnhance = async () => {
    // Simulate enhancement - in real app this would call API
    setEnhancedPrompt(`✨ Enhanced: ${originalPrompt}`);
    setShowEnhanced(true);
  };

  const useEnhanced = () => {
    setInputValue(enhancedPrompt);
    setShowEnhanceDialog(false);
  };

  const handleClearAll = () => {
    setShowClearConfirm(true);
  };

  const confirmClearAll = () => {
    clearAllChats();
    setCurrentChat(null);
    setShowClearConfirm(false);
    showToast('History cleared', 'delete_sweep');
  };

  // Demo UI mode — populate fake chats matching legacy
  const applyDemoUiMode = (on: boolean) => {
    setDemoUiMode(on);
    if (on) {
      const now = Date.now();
      const demoData: Record<string, any> = {
        demo1: { id: 'demo1', title: 'Launch plan for OrchidLLM', createdAt: now - 900000, messages: [
          { id: 'd1m1', role: 'user', content: 'Build a launch checklist for OrchidLLM', time: '12:00' },
          { id: 'd1m2', role: 'assistant', content: 'Here is a launch-ready checklist with milestones, owners, and quality gates.', time: '12:01', model: 'openai' },
        ]},
        demo2: { id: 'demo2', title: 'Image prompt exploration', createdAt: now - 10800000, messages: [
          { id: 'd2m1', role: 'user', content: 'Create a cinematic city-at-night prompt', time: '09:00' },
          { id: 'd2m2', role: 'assistant', content: 'Drafted in three styles: realistic, anime, and neon noir.', time: '09:01', model: 'flux' },
        ]},
        demo3: { id: 'demo3', title: 'Transcription test thread', createdAt: now - 72000000, messages: [
          { id: 'd3m1', role: 'user', content: 'Transcribe this audio file for me', time: '08:00' },
          { id: 'd3m2', role: 'assistant', content: 'Hi there! Here is the transcription of your audio.', time: '08:01', model: 'openai' },
        ]},
      };
      useChatStore.setState({ chats: demoData, currentChatId: 'demo1' });
      showToast('Demo preview active', 'play_circle');
    } else {
      clearAllChats();
      setCurrentChat(null);
      showToast('Demo mode off', 'cancel');
    }
  };

  const exportCurrentChat = () => {
    if (!currentChatId || !chats[currentChatId]) {
      showToast('No chat selected to export', 'info');
      return;
    }
    const chat = chats[currentChatId];
    const a = document.createElement('a');
    a.href = 'data:application/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(chat, null, 2));
    a.download = `${(chat.title||'chat').replace(/\s+/g,'-').toLowerCase()}-${Date.now()}.json`;
    a.click();
    showToast('Chat exported', 'ios_share');
  };

  const importChat = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        if (typeof data === 'object' && data.id) {
          useChatStore.setState(state => ({ chats: { ...state.chats, [data.id]: data } }));
          showToast('Chat imported!', 'upload');
        } else if (typeof data === 'object') {
          useChatStore.setState(state => ({ chats: { ...state.chats, ...data } }));
          showToast('History imported!', 'upload');
        }
      } catch { showToast('Invalid file format', 'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const toggleTextTool = (tool: string) => {
    setTextTools(prev => ({ ...prev, [tool]: !prev[tool as keyof typeof prev] }));
  };

  const setToolModel = (cat: string, modelId: string) => {
    setTextToolModels(prev => ({ ...prev, [cat]: modelId }));
  };

  const toggleComposerExpand = () => {
    setComposerExpanded(prev => !prev);
  };

  const applyPaletteVariant = (variantId: number) => {
    const key = `${isDarkMode?'dark':'light'}${variantId}`;
    const pal = STATIC_PALETTES[key];
    if (!pal) return;
    applyPaletteColors(pal.hueP, pal.hueS, pal.hueT, isDarkMode);
    showToast(`Orchid variant ${variantId} applied 🎨`, 'palette');
  };

  const randomizePalette = () => {
    const hueP = Math.floor(Math.random()*360);
    const hueS = Math.floor(Math.random()*360);
    const hueT = Math.floor(Math.random()*360);
    applyPaletteColors(hueP, hueS, hueT, isDarkMode);
    showToast('Palette randomized', 'auto_awesome');
  };

  const resetPalette = () => {
    const props = ['--p','--on-p','--pc','--on-pc','--s','--on-s','--sc','--on-sc','--t','--on-t','--tc','--on-tc'];
    props.forEach(v => document.documentElement.style.removeProperty(v));
    showToast('Colors reset to default', 'restart_alt');
  };

  const openImageViewer = (src: string) => {
    setImageViewerSrc(src);
    setImageViewerScale(1);
    setShowImageViewer(true);
  };

  const closeImageViewer = () => {
    setShowImageViewer(false);
    setImageViewerSrc('');
  };

  const zoomIn = () => {
    setImageViewerScale(prev => Math.min(prev + 0.25, 3));
  };

  const zoomOut = () => {
    setImageViewerScale(prev => Math.max(prev - 0.25, 0.5));
  };

  const downloadImage = () => {
    if (!imageViewerSrc) return;
    const link = document.createElement('a');
    link.href = imageViewerSrc;
    link.download = 'image.png';
    link.click();
  };

  const currentChatTitle = isTempChat
    ? 'Temporary Chat'
    : currentChatId
      ? chats[currentChatId]?.title || 'New Conversation'
      : 'New Conversation';

  const filteredModels = (models[selectedCategory] || []).filter((m) =>
    m.name.toLowerCase().includes(modelSearch.toLowerCase())
  );

  // Derived: does selected model support tools?
  const supportsTools = (() => {
    const allTextModels = models['text'] || [];
    const m = allTextModels.find(m => m.id === selectedModel);
    return m?.capabilities?.includes('tools') ?? false;
  })();

  return (
    <m3e-theme id="app" color-scheme={theme} style={{ display: 'flex', width: '100vw', height: '100vh', minHeight: '100dvh', overflow: 'hidden' }}>
      {/* ═══════ SIDEBAR (Drawer) ═══════ */}
      <aside id="sidebar" className={`side${!sidebarOpen ? (isMobile ? ' closed' : ' desktop-collapsed') : ''}`} style={{ display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--out-v)' }}>
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
              <div className="hi-icon"><span className="ms sm">chat_bubble</span></div>
              <span className="hi-title">{chat.title}</span>
              <button
                className="hi-del"
                onClick={(e) => { e.stopPropagation(); deleteChat(chat.id); }}
                type="button"
              >
                <span className="ms">close</span>
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
          <div
            className="user-avatar"
            title="Sign in"
            onClick={() => setShowSignIn(true)}
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'linear-gradient(145deg, var(--p), var(--t))',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 'bold',
              fontSize: '14px',
              boxShadow: 'var(--sh1)',
              cursor: 'pointer',
            }}
          >
            <span className="ms sm">person</span>
          </div>
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <span style={{ fontSize: '13px', fontWeight: 700, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', color: 'var(--on-surf)' }}>Guest</span>
            <span style={{ fontSize: '11px', color: 'var(--out)' }}>Sign in</span>
          </div>
          <m3e-icon-button id="settings-btn" title="Settings" variant="tonal" onClick={openSettings}>
            <m3e-icon name="settings"></m3e-icon>
          </m3e-icon-button>
        </div>
      </aside>

      {/* ═══════ MOBILE OVERLAY ═══════ */}
      <div id="side-ov" className={mobileMenuOpen ? 'show' : ''} onClick={() => setSidebar(false)}></div>

      {/* ═══════ MAIN ═══════ */}
      <main id="main" style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', minWidth: 0 }}>
        {/* Demo Banner */}
        {apiMode === 'demo' && (
          <div id="demo-banner" className="show">
            <span className="ms sm">bolt</span>
            Demo mode
            <div className="demo-pill" id="demo-counter">{demoRequestsLeft} requests left</div>
          </div>
        )}

        {/* Demo Data Banner */}
        {showDemoDataBanner && (
          <div id="demo-data-banner" className="show">
            <div className="demo-data-label">
              <span className="ms sm">theaters</span>
              Demo Data — Sample chats and model states loaded
            </div>
            <m3e-button variant="outlined" size="extra-small" id="demo-data-exit-btn" type="button" onClick={() => setShowDemoDataBanner(false)}>
              Exit Demo
            </m3e-button>
          </div>
        )}

        {/* PWA Nudge */}
        {showPwaNudge && (
          <div id="pwa-nudge" className="pwa-nudge">
            <div className="pwa-nudge-copy">
              <strong>Get faster access — install OrchidLLM as an app!</strong>
              <span>Faster load times, home screen access, and a full-screen experience.</span>
            </div>
            <div className="pwa-nudge-actions">
              <m3e-button variant="outlined" size="small" id="pwa-dismiss-btn" type="button" onClick={() => setShowPwaNudge(false)}>
                <m3e-icon slot="icon" name="close"></m3e-icon>
                <span>Dismiss</span>
              </m3e-button>
              <m3e-button variant="filled" size="small" id="pwa-open-settings-btn" type="button" onClick={() => { setSettingsTab('install'); openSettings(); }}>
                <m3e-icon slot="icon" name="open_in_new"></m3e-icon>
                <span>Open</span>
              </m3e-button>
            </div>
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
        <div id="mobile-more-menu" className={`mobile-menu ${showMobileMore ? 'open' : ''}`}>
          <button type="button" onClick={() => { if (currentChatId) { deleteChat(currentChatId); setCurrentChat(null); } setShowMobileMore(false); }}>
            <span className="ms sm">delete</span>Delete chat
          </button>
          <button type="button" onClick={() => { exportCurrentChat(); setShowMobileMore(false); }}>
            <span className="ms sm">ios_share</span>Export chat
          </button>
          <button type="button" onClick={() => { showComingSoon('Feedback'); setShowMobileMore(false); }}>
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
            <div className="temp-mode-pill show" id="temp-mode-pill" style={{ marginLeft: 'auto' }}>
              <span className="ms sm">history_toggle_off</span>
              <span className="hide-mobile">Temporary</span>
            </div>
          )}
          {apiMode === 'demo' && (
            <div className="demo-mode-pill show" id="demo-mode-pill">
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
              isTempChat ? (
                /* ── TEMP WELCOME (matches legacy temp-welcome-box) ── */
                <div id="welcome" className="temp-welcome-box">
                  <div className="w-logo"><span className="ms xl">history_toggle_off</span></div>
                  <div className="w-heading">Temporary chat</div>
                  <div className="w-sub">Temporary chats don&apos;t appear in Recent Chats and won&apos;t be saved at all.</div>
                </div>
              ) : (
                /* ── NORMAL WELCOME ── */
                <div id="welcome">
                  <div className="w-logo"><span className="ms xl fill">auto_awesome</span></div>
                  <div className="w-heading">OrchidLLM Playground</div>
                  <div className="w-sub">One screen. Every model. Chat with text models, generate images, transcribe audio, and more — all powered by Pollinations.ai.</div>
                  <m3e-chip-set className="w-chips">
                    {rotatedChips.map((chip, i) => (
                      <m3e-assist-chip key={i} onClick={() => setInputVal(chip.prompt)}>{chip.emoji} {chip.title}</m3e-assist-chip>
                    ))}
                    {/* Fallback static chips if suggestions haven't loaded yet */}
                    {rotatedChips.length === 0 && (
                      <>
                        <m3e-assist-chip onClick={() => setInputVal('Tell me something fascinating about the universe')}>✨ Fascinating fact</m3e-assist-chip>
                        <m3e-assist-chip onClick={() => setInputVal('Write a short poem about the ocean at night')}>🌊 Write a poem</m3e-assist-chip>
                        <m3e-assist-chip onClick={() => setInputVal('Explain quantum entanglement simply')}>🔬 Explain science</m3e-assist-chip>
                        <m3e-assist-chip onClick={() => setInputVal('What can you help me with today?')}>💬 What can you do?</m3e-assist-chip>
                      </>
                    )}
                  </m3e-chip-set>
                </div>
              )

            ) : (
              messages.map((msg) => (
                <div key={msg.id} className={`msg-row ${msg.role}`}>
                  <div className={`avatar ${msg.role === 'user' ? 'user-av' : 'ai-av'}`}>
                    {msg.role === 'user' ? <span className="ms sm fill">person</span> : <span className="ms sm fill">auto_awesome</span>}
                  </div>
                     <div className="bubble">
                    {msg.content || (isLoading && msg.role === 'assistant' ? (
                      // @ts-ignore
                      <m3e-loading-indicator></m3e-loading-indicator>
                    ) : null)}
                    {msg.time && (
                      <div className="msg-meta">
                        {msg.time}
                        {msg.model && <span> · {msg.model}</span>}
                      </div>
                    )}
                  </div>
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
                placeholder={activeCat === 'transcription' ? 'Upload audio for transcription.' : 'Message OrchidLLM.'}
                disabled={activeCat === 'transcription'}
                rows={1}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <div className="input-acts">
                <m3e-icon-button
                  id="composer-expand-btn"
                  type="button"
                  title="Expand composer"
                  className={inputValue.split('\n').length > 5 ? 'show-expand' : ''}
                  onClick={toggleComposerExpand}
                >
                  <m3e-icon name={composerExpanded ? "close_fullscreen" : "open_in_full"} id="composer-expand-icon"></m3e-icon>
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
                  {/* Composer model selector button - icon+badge+name match legacy */}
                  <m3e-button variant="outlined" id="model-split-btn" type="button" aria-label="Select model" onClick={() => setShowDropup(!showDropup)}>
                    <m3e-icon slot="icon" name={categories.find(c => c.id === activeCat)?.icon ?? 'psychology'}></m3e-icon>
                    <span id="cat-badge" className={`cat-badge cb-${activeCat} hide-mobile`}>
                      {categories.find(c => c.id === activeCat)?.label ?? 'Text'}
                    </span>
                    <span id="model-name-display" className="model-label">
                      {findModelName(selectedModel)}
                    </span>
                  </m3e-button>

                  {/* Tools btn — only for text + tool-capable models (based on COMMITTED activeCat) */}
                  {(activeCat === 'text') && (
                    <m3e-icon-button variant="outlined" id="tools-btn" type="button" title="Tools" aria-label="Tools" onClick={() => setShowToolsPop(!showToolsPop)}>
                      <m3e-icon name="tune"></m3e-icon>
                    </m3e-icon-button>
                  )}
                  {/* Enhance btn — only for image/video/audio (based on COMMITTED activeCat) */}
                  {(activeCat !== 'text') && (
                    <m3e-icon-button variant="outlined" id="enhance-btn" type="button" title="Enhance prompt" aria-label="Enhance prompt" onClick={handleEnhancePrompt}>
                      <m3e-icon name="auto_fix_high"></m3e-icon>
                    </m3e-icon-button>
                  )}
                </m3e-button-group>

                {/* Tools Popup */}
                {showToolsPop && (
                  <>
                    <div style={{ position:'fixed',inset:0,zIndex:149 }} onClick={() => setShowToolsPop(false)}></div>
                    <div className="tools-pop open" id="tools-pop" style={{ zIndex: 150 }}>
                    <div className="tools-pop-title">Tool calling</div>
                    <div className="tools-split">
                      <div className="tools-nav" id="tools-nav">
                        {['image', 'video', 'audio'].map((cat) => (
                          <button
                            key={cat}
                            className={`tool-nav-item ${activeToolCat === cat ? 'active' : ''}`}
                            onClick={() => setActiveToolCat(cat)}
                          >
                            <div className="tool-nav-meta">
                              <span className="ms sm">{cat === 'image' ? 'image' : cat === 'video' ? 'videocam' : 'volume_up'}</span>
                              <div className="tool-nav-titles">
                                <div className="tool-nav-title">{cat.charAt(0).toUpperCase() + cat.slice(1)}</div>
                                <div className="tool-nav-sub">{textTools[cat as keyof typeof textTools] ? 'Enabled' : 'Disabled'}</div>
                              </div>
                            </div>
                            <m3e-switch
                              aria-label={`Toggle ${cat}`}
                              checked={textTools[cat as keyof typeof textTools]}
                              onChange={() => toggleTextTool(cat)}
                            ></m3e-switch>
                          </button>
                        ))}
                      </div>
                      <div className="tools-models">
                        <div className="tools-models-head">
                          <div className="tools-models-title" id="tools-models-title">Models for {activeToolCat.charAt(0).toUpperCase() + activeToolCat.slice(1)}</div>
                          <div className="tools-models-hint">Choose which model to call per tool</div>
                        </div>
                        <div className="tools-model-list" id="tools-model-list">
                          {models[activeToolCat]?.map((model) => (
                            <button
                              key={model.id}
                              className={`tool-model-row ${textToolModels[activeToolCat as keyof typeof textToolModels] === model.id ? 'sel' : ''}`}
                              onClick={() => setToolModel(activeToolCat, model.id)}
                            >
                              <div className="tool-model-main" style={{ flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                  <div className="tool-model-name">{model.name}</div>
                                  {model.pro && <span className="mi-pro">Pro</span>}
                                </div>
                                <div className="tool-model-desc">{model.desc}</div>
                              </div>
                              <span className="tool-model-badge">{model.context}</span>
                            </button>
                          ))}

                        </div>
                      </div>
                    </div>
                    </div>
                  </>
                )}
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
              <div
                key={cat.id}
                className={`du-cat ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span className="ms sm">{cat.icon}</span>
                <span>{cat.label}</span>
              </div>
            ))}
          </div>
          <div className="du-models">
            <div className="du-search">
              <span className="ms sm" style={{ color: 'var(--out)' }}>search</span>
              <input
                type="text"
                placeholder="Search models…"
                id="model-search"
                name="model-search-orchid"
                autoComplete="new-password"
                value={modelSearch}
                onChange={(e) => setModelSearch(e.target.value)}
              />
            </div>
            <div className="du-list" id="du-list">
              {filteredModels.length === 0 && (
                <div style={{ padding:'20px', textAlign:'center', color:'var(--out)', fontSize:'13px' }}>No models found</div>
              )}
              {filteredModels.map((model) => (
                <div
                  key={model.id}
                  className={`model-item ${selectedModel === model.id ? 'sel' : ''}`}
                  onClick={() => {
                    setSelectedModel(model.id);
                    setActiveCat(selectedCategory);
                    setShowDropup(false);
                  }}
                >
                  <div className="mi-info">
                    <div className="mi-name-row">
                      <div className="mi-name">{model.name}</div>
                      {model.pro && <span className="mi-pro">Pro</span>}
                    </div>
                    <div className="mi-desc">{model.desc}</div>
                    {/* Capability + context chips */}
                    {((model.capabilities?.length > 0) || model.context) && (
                      <div className="mi-caps">
                        {model.context && <span className="cap-chip"><span className="ms">data_object</span>{model.context}</span>}
                        {(model.capabilities || []).map(cap => {
                          const META: Record<string,{label:string;icon:string}> = {
                            vision:    {label:'Vision',    icon:'visibility'},
                            reasoning: {label:'Reasoning', icon:'psychology'},
                            tools:     {label:'Tools',     icon:'build'},
                            search:    {label:'Search',    icon:'search'},
                            code:      {label:'Code',      icon:'code'},
                            'code-exec':{label:'Code Exec',icon:'terminal'},
                            caching:   {label:'Caching',   icon:'memory'},
                            'audio-in':{label:'Audio In',  icon:'mic'},
                            'audio-out':{label:'Audio Out',icon:'volume_up'},
                          };
                          const cm = META[cap]; if (!cm) return null;
                          return <span key={cap} className="cap-chip"><span className="ms">{cm.icon}</span>{cm.label}</span>;
                        })}
                      </div>
                    )}
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
      {/* @ts-ignore */}
      <m3e-dialog ref={settingsDlgRef} id="settings-dlg" dismissible style={{ '--m3e-dialog-max-width': '920px', '--m3e-dialog-width': 'min(920px, calc(100vw - 12px))' } as React.CSSProperties}>
        <span slot="header">
          <m3e-icon name="settings" style={{ verticalAlign: 'middle', marginRight: '8px' }}></m3e-icon>
          Settings
        </span>

        <m3e-tabs variant="secondary" id="settings-tabs">
          <m3e-tab selected={settingsTab === 'general'} for="s-general" onClick={() => setSettingsTab('general')}><m3e-icon slot="icon" name="tune"></m3e-icon>General</m3e-tab>
          <m3e-tab selected={settingsTab === 'api'} for="s-api" onClick={() => setSettingsTab('api')}><m3e-icon slot="icon" name="vpn_key"></m3e-icon>API</m3e-tab>
          <m3e-tab selected={settingsTab === 'history'} for="s-history" onClick={() => setSettingsTab('history')}><m3e-icon slot="icon" name="history"></m3e-icon>History</m3e-tab>
          <m3e-tab selected={settingsTab === 'install'} for="s-install" onClick={() => setSettingsTab('install')}><m3e-icon slot="icon" name="download"></m3e-icon>Install</m3e-tab>
          <m3e-tab selected={settingsTab === 'about'} for="s-about" onClick={() => setSettingsTab('about')}><m3e-icon slot="icon" name="info"></m3e-icon>About</m3e-tab>

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
                <textarea
                  className="stxt"
                  id="sys-prompt"
                  placeholder="You are a helpful AI assistant…"
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                ></textarea>
              </div>
              <div style={{ height: '8px' }}></div>
              <div className="sec-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                Demonstration Mode
                <span className="demo-ui-badge"><span className="ms" style={{ fontSize: '12px' }}>play_circle</span> UI Preview</span>
              </div>
              <div className="srow" style={{ marginBottom: '8px' }}>
                <span className="ms fill" style={{ color: 'var(--p)' }}>theaters</span>
                <div className="srow-info">
                  <div className="srow-label">Fill UI with demo data</div>
                  <div className="srow-desc">Populates messages, history & model states to preview the full UI without real generation calls</div>
                </div>
                <m3e-switch
                  id="s-demo-ui-tog"
                  icons="selected"
                  checked={demoUiMode}
                  onChange={() => applyDemoUiMode(!demoUiMode)}
                ></m3e-switch>
              </div>
              {demoUiMode && (
                <div id="demo-ui-note" style={{ padding: '10px 14px', background: 'var(--surf-lo)', borderRadius: 'var(--r-md)', border: '1.5px solid color-mix(in srgb,var(--p) 30%,transparent)', fontSize: '13px', color: 'var(--on-surf-v)', lineHeight: 1.5 }}>
                  <strong style={{ color: 'var(--p)' }}>Demo preview active</strong> — The app is showing sample chats, messages, and model states.
                </div>
              )}
              <div style={{ height: '8px' }}></div>
              <div className="sec-title">Theming</div>
              <div className="srow srow-col" style={{ padding: '16px' }}>
                <div className="srow-head" style={{ marginBottom: 0 }}>
                  <span className="ms fill" style={{ color: 'var(--p)' }}>palette</span>
                  <div className="srow-info" style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                      <div className="srow-label">Mode & Orchid Theme</div>
                      <m3e-switch
                        id="s-dark-tog"
                        aria-label="Toggle dark mode"
                        checked={isDarkMode}
                        onChange={() => {
                          setIsDarkMode(!isDarkMode);
                          toggleTheme();
                        }}
                      ></m3e-switch>
                    </div>
                    <div className="srow-desc">Seamlessly swap between 3 Light and 3 Dark curated Orchid hues</div>
                  </div>
                </div>
                <div className="palette-row" style={{ marginTop: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px', alignItems: 'center', width: '100%' }}>
                    <div
                      className="palette-btn"
                      id="pal-var-1"
                      onClick={() => applyPaletteVariant(1)}
                      title="Orchid Variant 1"
                    ></div>
                    <div
                      className="palette-btn"
                      id="pal-var-2"
                      onClick={() => applyPaletteVariant(2)}
                      title="Orchid Variant 2"
                    ></div>
                    <div
                      className="palette-btn"
                      id="pal-var-3"
                      onClick={() => applyPaletteVariant(3)}
                      title="Orchid Variant 3"
                    ></div>
                    <m3e-button variant="text" size="extra-small" id="randomize-palette-btn" type="button" onClick={randomizePalette}>
                      <m3e-icon slot="icon" name="auto_awesome"></m3e-icon> Randomize
                    </m3e-button>
                    <m3e-button variant="outlined" size="extra-small" id="reset-palette-btn" type="button" style={{ marginLeft: 'auto' }} onClick={resetPalette}>
                      <m3e-icon slot="icon" name="restart_alt"></m3e-icon> Reset
                    </m3e-button>
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
                <m3e-button variant="outlined" id="export-btn" onClick={exportCurrentChat}>
                  <m3e-icon slot="icon" name="download"></m3e-icon> Export
                </m3e-button>
                <label htmlFor="import-file" style={{ display: 'contents' }}>
                  <m3e-button variant="outlined" id="import-btn-label" type="button">
                    <m3e-icon slot="icon" name="upload"></m3e-icon> Import chat/history
                  </m3e-button>
                </label>
                <input type="file" id="import-file" accept=".json" style={{ display: 'none' }} onChange={importChat} />
                <m3e-button variant="tonal" id="clear-btn" style={{ '--m3e-button-container-color': 'var(--err-c)', '--m3e-button-label-color': 'var(--err)' } as React.CSSProperties} onClick={handleClearAll}>
                  <m3e-icon slot="icon" name="delete_sweep"></m3e-icon> Clear all
                </m3e-button>
              </div>
            </div>
          </m3e-tab-panel>

          <m3e-tab-panel id="s-install">
            <div className="settings-panel-inner">
              <div className="sec-title">Install as App</div>
              <div className="srow srow-col">
                <div className="srow-head">
                  <span className="ms fill">download</span>
                  <div className="srow-info">
                    <div className="srow-label">Progressive App Install</div>
                    <div className="srow-desc">Install OneLLM for a native-style experience with quick launch from your device.</div>
                  </div>
                </div>
              </div>
              <div style={{ height: '12px' }}></div>
              <div className="sec-title">Browser Instructions</div>
              <div className="install-guide">
                <div className="install-browser">
                  <div className="install-browser-head">
                    <div className="install-browser-icon"><span className="ms fill">public</span></div>
                    <div className="install-browser-name">Google Chrome</div>
                  </div>
                  <div className="install-steps">
                    <div className="install-step">
                      <div className="install-step-num">1</div>
                      <span>Click the <strong>three-dot menu</strong> (⋮) in the top-right corner</span>
                    </div>
                    <div className="install-step">
                      <div className="install-step-num">2</div>
                      <span>Select <strong>"Install OneLLM…"</strong> or <strong>"Install app"</strong></span>
                    </div>
                    <div className="install-step">
                      <div className="install-step-num">3</div>
                      <span>Click <strong>Install</strong> in the confirmation dialog</span>
                    </div>
                  </div>
                </div>
                <div className="install-browser">
                  <div className="install-browser-head">
                    <div className="install-browser-icon"><span className="ms fill">local_fire_department</span></div>
                    <div className="install-browser-name">Mozilla Firefox</div>
                  </div>
                  <div className="install-steps">
                    <div className="install-step">
                      <div className="install-step-num">1</div>
                      <span>Look for the <strong>install icon</strong> in the address bar (desktop)</span>
                    </div>
                    <div className="install-step">
                      <div className="install-step-num">2</div>
                      <span>On Android: tap the <strong>three-dot menu</strong> → <strong>"Install"</strong></span>
                    </div>
                    <div className="install-step">
                      <div className="install-step-num">3</div>
                      <span>Confirm by tapping <strong>Add</strong></span>
                    </div>
                  </div>
                </div>
                <div className="install-browser">
                  <div className="install-browser-head">
                    <div className="install-browser-icon"><span className="ms fill">phone_iphone</span></div>
                    <div className="install-browser-name">Safari (iOS / macOS)</div>
                  </div>
                  <div className="install-steps">
                    <div className="install-step">
                      <div className="install-step-num">1</div>
                      <span>Tap the <strong>Share</strong> button (square with arrow)</span>
                    </div>
                    <div className="install-step">
                      <div className="install-step-num">2</div>
                      <span>Scroll down and tap <strong>"Add to Home Screen"</strong></span>
                    </div>
                    <div className="install-step">
                      <div className="install-step-num">3</div>
                      <span>Tap <strong>Add</strong> in the top-right corner</span>
                    </div>
                  </div>
                </div>
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

      {/* ═══════ ENHANCE DIALOG (M3E) ═══════ */}
      <m3e-dialog id="enhance-dlg" dismissible open={showEnhanceDialog || undefined} onClose={() => setShowEnhanceDialog(false)} style={{ '--m3e-dialog-max-width': '480px' } as React.CSSProperties}>
        <span slot="header">
          <m3e-icon name="auto_fix_high" style={{ verticalAlign: 'middle', marginRight: '8px', color: 'var(--p)' }}></m3e-icon>
          Enhance Prompt
        </span>

        <div>
          <div className="sec-title">Enhancement Model</div>
          <div className="eml" id="enh-eml">
            {models.text?.map((model) => (
              <div
                key={model.id}
                className={`em-opt ${enhanceModel === model.id ? 'sel' : ''}`}
                onClick={() => setEnhanceModel(model.id)}
              >
                <span className="ms sm">{model.id === 'openai' ? 'psychology' : 'auto_awesome'}</span>
                <span>{model.name}</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="sec-title">Original Prompt</div>
          <div className="srow" style={{ alignItems: 'flex-start' }}>
            <div id="orig-preview" style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--on-surf)', padding: '2px 0' }}>{originalPrompt}</div>
          </div>
        </div>
        {showEnhanced && (
          <div id="enhanced-sec">
            <div className="sec-title" style={{ color: 'var(--t)' }}>Enhanced Prompt ✨</div>
            <div className="srow" style={{ alignItems: 'flex-start' }}>
              <div id="enh-preview" style={{ fontSize: '14px', lineHeight: 1.6, color: 'var(--on-surf)', padding: '2px 0' }}>{enhancedPrompt}</div>
            </div>
          </div>
        )}
        <div className="btn-row">
          <m3e-button variant="filled" id="do-enhance-btn" onClick={doEnhance}>
            <m3e-icon slot="icon" name="auto_awesome"></m3e-icon> Enhance
          </m3e-button>
          {showEnhanced && (
            <m3e-button variant="tonal" id="use-enhanced-btn" onClick={useEnhanced}>
              <m3e-icon slot="icon" name="check"></m3e-icon> Use this
            </m3e-button>
          )}
        </div>
      </m3e-dialog>

      {/* ═══════ CLEAR HISTORY CONFIRM (M3E) ═══════ */}
      <m3e-dialog id="clear-confirm-dlg" alert open={showClearConfirm || undefined} onClose={() => setShowClearConfirm(false)}>
        <span slot="header">Clear all history?</span>
        <p style={{ fontSize: '14px', color: 'var(--on-surf-v)', lineHeight: 1.6 }}>
          This will permanently delete all your saved conversations. This action cannot be undone.
        </p>
          <div slot="actions" style={{ display: 'flex', gap: '8px', marginLeft: 'auto' }}>
          <m3e-button onClick={() => setShowClearConfirm(false)}><m3e-dialog-action return-value="cancel">Cancel</m3e-dialog-action></m3e-button>
          <m3e-button variant="filled" style={{ '--m3e-button-container-color': 'var(--err)', '--m3e-button-label-color': 'var(--on-t)' } as React.CSSProperties} onClick={confirmClearAll}>
            <m3e-dialog-action return-value="clear">Clear all</m3e-dialog-action>
          </m3e-button>
        </div>
      </m3e-dialog>

      {/* Image Viewer */}
      {showImageViewer && (
        <div id="img-viewer" className="img-viewer open">
          <div className="img-viewer-bg" onClick={closeImageViewer}></div>
          <div className="img-viewer-card" role="dialog" aria-modal="true" aria-label="Image viewer">
            <div className="img-viewer-head">
              <div className="img-viewer-zoom" id="img-zoom-label">{Math.round(imageViewerScale * 100)}%</div>
              <div className="img-viewer-actions">
                <m3e-icon-button id="img-zoom-out" title="Zoom out" onClick={zoomOut}>
                  <m3e-icon name="remove"></m3e-icon>
                </m3e-icon-button>
                <m3e-icon-button id="img-zoom-in" title="Zoom in" onClick={zoomIn}>
                  <m3e-icon name="add"></m3e-icon>
                </m3e-icon-button>
                <m3e-icon-button id="img-download-btn" title="Download image" onClick={downloadImage}>
                  <m3e-icon name="download"></m3e-icon>
                </m3e-icon-button>
                <m3e-icon-button id="img-close-btn" title="Close" onClick={closeImageViewer}>
                  <m3e-icon name="close"></m3e-icon>
                </m3e-icon-button>
              </div>
            </div>
            <div className="img-viewer-stage" id="img-viewer-stage">
              <img
                id="img-viewer-img"
                alt="Expanded image"
                src={imageViewerSrc}
                style={{ transform: `scale(${imageViewerScale})` }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Sign In Modal */}
      <SignInModal open={showSignIn} onClose={() => setShowSignIn(false)} />
    </m3e-theme>
  );
}
