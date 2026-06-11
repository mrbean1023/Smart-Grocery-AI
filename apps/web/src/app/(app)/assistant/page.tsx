"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessageSquare, Plus, SendHorizonal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ChatMessageDto, ChatSessionDto } from "@smart-grocery/shared";

import { MarkdownLite } from "@/components/markdown-lite";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { handleApiError } from "@/lib/errors";
import { formatRelative } from "@/lib/format";
import { cn } from "@/lib/utils";

const SUGGESTIONS = [
  "What's the cheapest high-protein dinner this week?",
  "What can I cook with what's in my pantry?",
  "I have S$30 for groceries — plan my meals.",
  "Where is chicken breast cheapest right now?",
];

type SessionSummary = Pick<ChatSessionDto, "id" | "title" | "createdAt"> & {
  preview?: string | null;
  updatedAt?: string;
};

interface ChatResponse {
  sessionId: string;
  reply: string;
  messages: ChatMessageDto[];
}

export default function AssistantPage() {
  const qc = useQueryClient();
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const [input, setInput] = React.useState("");
  const [optimistic, setOptimistic] = React.useState<ChatMessageDto[]>([]);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const { data: rawSessions, isLoading: sessionsLoading } = useQuery({
    queryKey: ["chat-sessions"],
    queryFn: () => api<SessionSummary[] | { items: SessionSummary[] }>("/assistant/sessions"),
  });
  const sessions = Array.isArray(rawSessions) ? rawSessions : (rawSessions?.items ?? []);

  const { data: activeSession, isLoading: messagesLoading } = useQuery({
    queryKey: ["chat-session", sessionId],
    queryFn: () => api<ChatSessionDto>(`/assistant/sessions/${sessionId}`),
    enabled: sessionId !== null,
  });

  const messages = React.useMemo(() => {
    const base = sessionId ? (activeSession?.messages ?? []) : [];
    return [...base, ...optimistic];
  }, [activeSession, optimistic, sessionId]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const send = useMutation({
    mutationFn: (message: string) =>
      api<ChatResponse>("/assistant/chat", {
        method: "POST",
        body: { message, ...(sessionId ? { sessionId } : {}) },
      }),
    onMutate: (message) => {
      setOptimistic([
        {
          id: `optimistic-${Date.now()}`,
          role: "user",
          content: message,
          createdAt: new Date().toISOString(),
        },
      ]);
      setInput("");
    },
    onSuccess: (res) => {
      setOptimistic([]);
      setSessionId(res.sessionId);
      qc.setQueryData(["chat-session", res.sessionId], (prev: ChatSessionDto | undefined) => ({
        id: res.sessionId,
        title: prev?.title ?? "New conversation",
        createdAt: prev?.createdAt ?? new Date().toISOString(),
        messages: res.messages,
      }));
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
      qc.invalidateQueries({ queryKey: ["usage"] });
    },
    onError: (e) => {
      setOptimistic([]);
      handleApiError(e, "The assistant couldn't reply — try again");
    },
  });

  const removeSession = useMutation({
    mutationFn: (id: string) => api(`/assistant/sessions/${id}`, { method: "DELETE" }),
    onSuccess: (_d, id) => {
      if (id === sessionId) setSessionId(null);
      toast.success("Conversation deleted");
      qc.invalidateQueries({ queryKey: ["chat-sessions"] });
    },
    onError: (e) => handleApiError(e),
  });

  const submit = () => {
    const message = input.trim();
    if (!message || send.isPending) return;
    send.mutate(message);
  };

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[480px] gap-4 md:h-[calc(100dvh-9rem)]">
      {/* Sessions sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col rounded-xl border md:flex">
        <div className="border-b p-3">
          <Button variant="outline" className="w-full" onClick={() => setSessionId(null)}>
            <Plus aria-hidden /> New chat
          </Button>
        </div>
        <ScrollArea className="flex-1">
          <div className="space-y-1 p-2">
            {sessionsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-lg" />)
            ) : sessions.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-muted-foreground">
                Your conversations will appear here.
              </p>
            ) : (
              sessions.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group flex items-center gap-1 rounded-lg",
                    s.id === sessionId && "bg-accent",
                  )}
                >
                  <button
                    type="button"
                    onClick={() => setSessionId(s.id)}
                    className="min-w-0 flex-1 rounded-lg px-2.5 py-2 text-left hover:bg-accent/70"
                  >
                    <p className="truncate text-sm font-medium">{s.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {formatRelative(s.updatedAt ?? s.createdAt)}
                    </p>
                  </button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="mr-1 h-7 w-7 shrink-0 opacity-0 group-hover:opacity-100"
                    aria-label={`Delete ${s.title}`}
                    onClick={() => removeSession.mutate(s.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </aside>

      {/* Thread */}
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border">
        <ScrollArea className="flex-1">
          <div className="mx-auto max-w-2xl space-y-4 p-4">
            {sessionId && messagesLoading ? (
              <div className="space-y-3">
                <Skeleton className="ml-auto h-12 w-2/3 rounded-2xl" />
                <Skeleton className="h-20 w-3/4 rounded-2xl" />
              </div>
            ) : messages.length === 0 ? (
              <div className="py-8">
                <EmptyState
                  icon={MessageSquare}
                  title="Your Singapore grocery copilot"
                  description="Ask about prices, your pantry, budgets or what to cook — it can search live data across all 7 stores."
                />
                <div className="mx-auto mt-4 grid max-w-md gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => send.mutate(s)}
                      className="rounded-lg border px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-accent/50"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
                        m.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted",
                      )}
                    >
                      {m.role === "assistant" ? <MarkdownLite content={m.content} /> : m.content}
                    </div>
                  </div>
                ))}
                {send.isPending && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-2xl bg-muted px-4 py-3">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.3s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60 [animation-delay:-0.15s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/60" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </>
            )}
          </div>
        </ScrollArea>
        <div className="border-t p-3">
          <form
            className="mx-auto flex max-w-2xl items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder="Ask about prices, recipes, your budget…"
              rows={1}
              className="min-h-10 max-h-36 resize-none"
              aria-label="Message the assistant"
            />
            <Button type="submit" size="icon" disabled={!input.trim() || send.isPending} aria-label="Send">
              <SendHorizonal className="h-4 w-4" />
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
