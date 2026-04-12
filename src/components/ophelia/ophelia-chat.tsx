"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Sparkles, X, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useOpheliaChat } from "@/lib/ophelia/chat-context";
import { ChatMessages } from "./chat-messages";
import { ChatInput } from "./chat-input";
import { SuggestedPrompts } from "./suggested-prompts";

interface LocalMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export function OpheliaChat() {
  const { pageContext, isOpen, toggle, close } = useOpheliaChat();
  const containerRef = useRef<HTMLDivElement>(null);
  const trpc = useTRPC();
  const queryClient = useQueryClient();

  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMessage[]>([]);
  const [inputValue, setInputValue] = useState("");
  const [isSending, setIsSending] = useState(false);

  // Load most recent conversation on first open
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const listQuery = useQuery({
    ...trpc.chat.listConversations.queryOptions({ limit: 1 }),
    enabled: isOpen && !hasLoadedInitial,
  });

  // When list loads, pick up the most recent conversation
  useEffect(() => {
    if (!listQuery.data || hasLoadedInitial) return;
    setHasLoadedInitial(true);
    if (listQuery.data.length > 0) {
      setConversationId(listQuery.data[0].id);
    }
  }, [listQuery.data, hasLoadedInitial]);

  // Load conversation messages when conversationId changes
  const convQuery = useQuery({
    ...trpc.chat.getConversation.queryOptions({ conversationId: conversationId! }),
    enabled: !!conversationId,
  });

  useEffect(() => {
    if (convQuery.data?.messages) {
      setMessages(
        convQuery.data.messages.map((m) => ({
          id: m.id,
          role: (m.role === "USER" ? "user" : "assistant") as "user" | "assistant",
          content: m.content,
        }))
      );
    }
  }, [convQuery.data]);

  // Send message mutation
  const sendMutation = useMutation({
    ...trpc.chat.sendMessage.mutationOptions(),
    onSuccess: (data) => {
      setConversationId(data.conversationId);
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          content: data.message,
        },
      ]);
      setIsSending(false);
    },
    onError: (err) => {
      setMessages((prev) => [
        ...prev,
        {
          id: `error-${Date.now()}`,
          role: "assistant",
          content: `Sorry, something went wrong: ${err.message}`,
        },
      ]);
      setIsSending(false);
    },
  });

  const handleSend = useCallback(
    (text: string) => {
      const userMsg: LocalMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        content: text,
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsSending(true);
      setInputValue("");

      sendMutation.mutate({
        conversationId: conversationId ?? undefined,
        message: text,
        pageContext,
      });
    },
    [conversationId, pageContext, sendMutation]
  );

  const handleNewConversation = () => {
    setConversationId(null);
    setMessages([]);
    setInputValue("");
  };

  // Click outside to close (but not while sending)
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (isSending) return;
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, isSending, close]);

  const showSuggestions = messages.length === 0 || messages[messages.length - 1]?.role === "assistant";

  return (
    <div className="relative" ref={containerRef}>
      {/* Trigger button */}
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-md transition-colors",
          isOpen
            ? "bg-accent text-accent-foreground"
            : "text-muted-foreground hover:text-foreground hover:bg-accent"
        )}
        title="Chat with Ophelia"
      >
        <Sparkles className="h-4 w-4" />
      </button>

      {/* Floating chat card */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-[380px] max-h-[520px] sm:w-[380px] max-sm:w-[calc(100vw-2rem)] max-sm:max-h-[70vh] rounded-lg glass shadow-ambient ophelia-glow flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-outline-variant shrink-0">
            <div className="flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-primary" />
              <span className="text-sm font-semibold">Ophelia</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleNewConversation}
                className="flex items-center justify-center h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="New conversation"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={close}
                className="flex items-center justify-center h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                title="Close"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>

          {/* Messages area */}
          {messages.length === 0 && !isSending ? (
            <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 text-center min-h-0">
              <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm font-medium mb-1">Hi! I'm Ophelia</p>
              <p className="text-xs text-muted-foreground">
                Your finance assistant. Ask me anything about your finances or this page.
              </p>
            </div>
          ) : (
            <ChatMessages messages={messages} isLoading={isSending} />
          )}

          {/* Suggested prompts */}
          {showSuggestions && !isSending && (
            <SuggestedPrompts
              prompts={pageContext.suggestedPrompts}
              onSelect={handleSend}
            />
          )}

          {/* Input */}
          <ChatInput
            onSend={handleSend}
            disabled={isSending}
            inputValue={inputValue}
            onInputChange={setInputValue}
          />
        </div>
      )}
    </div>
  );
}
