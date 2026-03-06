import { create } from "zustand";
import type { Message } from "@/types";

interface ChatState {
  /** Messages keyed by workspaceId */
  messages: Record<string, Message[]>;
  streaming: Record<string, boolean>;
  // actions
  setMessages: (workspaceId: string, messages: Message[]) => void;
  appendMessage: (workspaceId: string, message: Message) => void;
  updateLastMessage: (workspaceId: string, patch: Partial<Message>) => void;
  setStreaming: (workspaceId: string, streaming: boolean) => void;
  clearMessages: (workspaceId: string) => void;
}

export const useChatStore = create<ChatState>((set) => ({
  messages: {},
  streaming: {},

  setMessages: (workspaceId, messages) =>
    set((state) => ({
      messages: { ...state.messages, [workspaceId]: messages },
    })),

  appendMessage: (workspaceId, message) =>
    set((state) => ({
      messages: {
        ...state.messages,
        [workspaceId]: [...(state.messages[workspaceId] ?? []), message],
      },
    })),

  updateLastMessage: (workspaceId, patch) =>
    set((state) => {
      const msgs = state.messages[workspaceId] ?? [];
      if (msgs.length === 0) return state;
      const updated = msgs.map((m, i) =>
        i === msgs.length - 1 ? { ...m, ...patch } : m
      );
      return { messages: { ...state.messages, [workspaceId]: updated } };
    }),

  setStreaming: (workspaceId, streaming) =>
    set((state) => ({
      streaming: { ...state.streaming, [workspaceId]: streaming },
    })),

  clearMessages: (workspaceId) =>
    set((state) => ({
      messages: { ...state.messages, [workspaceId]: [] },
    })),
}));
