import React, { createContext, useContext, useState, useCallback } from "react";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
}

interface AiState {
  messages: ChatMessage[];
  isStreaming: boolean;
}

interface AiContextValue extends AiState {
  addMessage: (msg: ChatMessage) => void;
  appendToLastAssistant: (token: string) => void;
  setStreaming: (v: boolean) => void;
  clearMessages: () => void;
}

const AiContext = createContext<AiContextValue | undefined>(undefined);

export function AiProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);

  const addMessage = useCallback((msg: ChatMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  const appendToLastAssistant = useCallback((token: string) => {
    setMessages((prev) => {
      const idx = prev.length - 1;
      if (idx < 0 || prev[idx].role !== "assistant") return prev;
      const updated = [...prev];
      updated[idx] = { ...updated[idx], content: updated[idx].content + token };
      return updated;
    });
  }, []);

  const setStreaming = useCallback((v: boolean) => {
    setIsStreaming(v);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return (
    <AiContext.Provider
      value={{
        messages,
        isStreaming,
        addMessage,
        appendToLastAssistant,
        setStreaming,
        clearMessages,
      }}
    >
      {children}
    </AiContext.Provider>
  );
}

export function useAi(): AiContextValue {
  const ctx = useContext(AiContext);
  if (!ctx) throw new Error("useAi must be used within AiProvider");
  return ctx;
}
