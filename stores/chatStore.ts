import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { Chat, ChatMessageState, Attachment } from '@/lib/types';

interface ChatState {
  // State
  chats: Record<string, Chat>;
  currentChatId: string | null;
  isTempChat: boolean;
  tempMessages: ChatMessageState[];
  isLoading: boolean;

  // Actions
  createChat: () => string;
  deleteChat: (id: string) => void;
  setCurrentChat: (id: string | null) => void;
  updateChatTitle: (id: string, title: string) => void;
  addMessage: (message: ChatMessageState) => void;
  updateMessage: (messageId: string, content: string) => void;
  appendToMessage: (messageId: string, content: string) => void;
  toggleTempChat: () => void;
  clearTempMessages: () => void;
  setLoading: (loading: boolean) => void;
  clearAllChats: () => void;

  // Getters
  getCurrentMessages: () => ChatMessageState[];
  getChatList: () => Chat[];
}

const generateId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      chats: {},
      currentChatId: null,
      isTempChat: false,
      tempMessages: [],
      isLoading: false,

      createChat: () => {
        const id = generateId();
        const newChat: Chat = {
          id,
          title: 'New Conversation',
          messages: [],
          createdAt: Date.now(),
        };

        set((state) => ({
          chats: { ...state.chats, [id]: newChat },
          currentChatId: id,
          isTempChat: false,
        }));

        return id;
      },

      deleteChat: (id) => {
        set((state) => {
          const { [id]: _, ...rest } = state.chats;
          const newCurrentId = state.currentChatId === id ? null : state.currentChatId;
          return { chats: rest, currentChatId: newCurrentId };
        });
      },

      setCurrentChat: (id) => {
        set({ currentChatId: id, isTempChat: false });
      },

      updateChatTitle: (id, title) => {
        set((state) => {
          const chat = state.chats[id];
          if (!chat) return state;
          return {
            chats: { ...state.chats, [id]: { ...chat, title } },
          };
        });
      },

      addMessage: (message) => {
        const { isTempChat, currentChatId, chats } = get();

        if (isTempChat) {
          set((state) => ({
            tempMessages: [...state.tempMessages, message],
          }));
        } else if (currentChatId && chats[currentChatId]) {
          set((state) => {
            const chat = state.chats[currentChatId];
            const updatedChat = {
              ...chat,
              messages: [...chat.messages, message],
            };

            // Auto-update title from first user message
            if (chat.messages.length === 0 && message.role === 'user') {
              updatedChat.title = message.content.slice(0, 50) + (message.content.length > 50 ? '...' : '');
            }

            return {
              chats: { ...state.chats, [currentChatId]: updatedChat },
            };
          });
        }
      },

      updateMessage: (messageId, content) => {
        const { isTempChat, currentChatId } = get();

        if (isTempChat) {
          set((state) => ({
            tempMessages: state.tempMessages.map((msg) =>
              msg.id === messageId ? { ...msg, content } : msg
            ),
          }));
        } else if (currentChatId) {
          set((state) => {
            const chat = state.chats[currentChatId];
            if (!chat) return state;
            return {
              chats: {
                ...state.chats,
                [currentChatId]: {
                  ...chat,
                  messages: chat.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, content } : msg
                  ),
                },
              },
            };
          });
        }
      },

      appendToMessage: (messageId, content) => {
        const { isTempChat, currentChatId } = get();

        if (isTempChat) {
          set((state) => ({
            tempMessages: state.tempMessages.map((msg) =>
              msg.id === messageId ? { ...msg, content: msg.content + content } : msg
            ),
          }));
        } else if (currentChatId) {
          set((state) => {
            const chat = state.chats[currentChatId];
            if (!chat) return state;
            return {
              chats: {
                ...state.chats,
                [currentChatId]: {
                  ...chat,
                  messages: chat.messages.map((msg) =>
                    msg.id === messageId ? { ...msg, content: msg.content + content } : msg
                  ),
                },
              },
            };
          });
        }
      },

      toggleTempChat: () => {
        set((state) => ({
          isTempChat: !state.isTempChat,
          tempMessages: state.isTempChat ? [] : state.tempMessages,
        }));
      },

      clearTempMessages: () => {
        set({ tempMessages: [] });
      },

      setLoading: (loading) => {
        set({ isLoading: loading });
      },

      clearAllChats: () => {
        set({ chats: {}, currentChatId: null, tempMessages: [] });
      },

      getCurrentMessages: () => {
        const { isTempChat, tempMessages, currentChatId, chats } = get();
        if (isTempChat) return tempMessages;
        if (currentChatId && chats[currentChatId]) {
          return chats[currentChatId].messages;
        }
        return [];
      },

      getChatList: () => {
        const { chats } = get();
        return Object.values(chats).sort((a, b) => b.createdAt - a.createdAt);
      },
    }),
    {
      name: 'onellm_chat_state',
      partialize: (state) => ({
        chats: state.chats,
        currentChatId: state.currentChatId,
      }),
    }
  )
);
