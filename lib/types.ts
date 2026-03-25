// API Key Types
export interface ApiKeyPermissions {
  providers: ('nvidia' | 'pollinations' | 'openai')[];
  rateLimit: number;
  models: string[] | '*';
  expiresAt?: number;
}

export interface ApiKeyRecord {
  key: string;
  permissions: ApiKeyPermissions;
  createdAt: number;
  createdBy: string;
  lastUsed?: number;
  usageCount: number;
}

// Key Detection Types
export type KeyType = 'demo' | 'global' | 'bpolly' | 'unknown';

export interface KeyDetectionResult {
  type: KeyType;
  payload?: ApiKeyPermissions;
  actualKey?: string;
}

// OpenAI-compatible Types
export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  name?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  stop?: string | string[];
  system?: string;
  seed?: number;
}

export interface ChatCompletionChoice {
  index: number;
  message: {
    role: 'assistant';
    content: string;
    tool_calls?: ToolCall[];
  };
  finish_reason: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: ChatCompletionChoice[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

// Streaming Types
export interface ChatCompletionChunk {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: 'assistant';
      content?: string;
      tool_calls?: ToolCall[];
    };
    finish_reason: string | null;
  }[];
}

// Image Generation Types
export interface ImageGenerationRequest {
  model: string;
  prompt: string;
  n?: number;
  size?: string;
  response_format?: 'url' | 'b64_json';
  quality?: 'standard' | 'hd';
  style?: 'natural' | 'vivid';
}

export interface ImageGenerationResponse {
  created: number;
  data: {
    url?: string;
    b64_json?: string;
  }[];
}

// Video Generation Types
export interface VideoGenerationRequest {
  model: string;
  prompt: string;
  size?: string;
  duration?: number;
  aspectRatio?: string;
  audio?: boolean;
  response_format?: 'url';
}

export interface VideoGenerationResponse {
  created: number;
  data: {
    url: string;
  }[];
}

// Audio Generation Types
export interface AudioGenerationRequest {
  model: string;
  input: string;
  voice?: string;
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
}

// Transcription Types
export interface TranscriptionRequest {
  file: File | Blob;
  model: string;
  language?: string;
  prompt?: string;
  response_format?: 'json' | 'text' | 'srt' | 'verbose_json' | 'vtt';
}

export interface TranscriptionResponse {
  text: string;
  language?: string;
  duration?: number;
}

// Model Types
export interface ModelCapabilities {
  vision?: boolean;
  reasoning?: boolean;
  tools?: boolean;
  search?: boolean;
  code?: boolean;
  'code-exec'?: boolean;
  caching?: boolean;
  'audio-in'?: boolean;
  'audio-out'?: boolean;
}

export interface Model {
  id: string;
  name: string;
  desc: string;
  context: string;
  capabilities: string[];
  pro: boolean;
  caching: boolean;
  disabled?: boolean;
}

export interface ModelCategory {
  text: Model[];
  image: Model[];
  video: Model[];
  audio: Model[];
  transcription: Model[];
  nvidia?: Model[];
}

export interface ModelsResponse {
  categories: ModelCategory;
}

// Usage Tracking Types
export interface UsageRecord {
  identifier: string;
  count: number;
  date: string;
  lastRequest: number;
}

// Session Types
export interface SessionState {
  sessionId: string;
  apiMode: 'demo' | 'bpolly';
  bpollyKey?: string;
  globalKey?: string;
}

// Chat State Types
export interface ChatMessageState {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  time: string;
  model?: string;
  imageUrl?: string;
  videoUrl?: string;
  audioUrl?: string;
  attachments?: Attachment[];
}

export interface Attachment {
  name: string;
  type: string;
  size: number;
  data: string;
  icon: string;
}

export interface Chat {
  id: string;
  title: string;
  messages: ChatMessageState[];
  createdAt: number;
}

// Settings Types
export interface Settings {
  theme: 'light' | 'dark';
  systemPrompt: string;
  enhanceModel: string;
  quickMode: 'voice' | 'text';
  activeToolCat: 'image' | 'video' | 'audio';
  textTools: {
    image: boolean;
    video: boolean;
    audio: boolean;
    web: boolean;
  };
  textToolModels: {
    image: string;
    video: string;
    audio: string;
  };
  toolsModel: string;
  palette?: {
    hueP: number;
    hueS: number;
    hueT: number;
    variantId?: string;
  };
}
