// src/components/text-chat.tsx
import { useState, useRef, useEffect } from "react";
import { Send, Bot, User, Loader2, MessageSquare, RefreshCw, CheckCircle } from "lucide-react";
import { Button } from "./ui/button";
import { Badge } from "./ui/badge";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";
const uuidv4 = () => crypto.randomUUID();

interface Message {
  role: "user" | "system";
  text: string;
  ts: string;
  complaint?: Record<string, any> | null;
}

interface TextChatResponse {
  ai_text: string;
  sentiment: string;
  complaint: Record<string, any> | null;
}

async function sendTextMessage(
  text: string,
  sessionId: string
): Promise<TextChatResponse> {
  const res = await fetch(
    `${API_URL}/ai/text?session_id=${encodeURIComponent(sessionId)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "ngrok-skip-browser-warning": "1",
      },
      body: JSON.stringify({ text }),
    }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

const SENTIMENT_STYLE: Record<string, string> = {
  Positive: "bg-emerald-50 text-emerald-700 border-emerald-200",
  Negative: "bg-orange-50 text-orange-700 border-orange-200",
  Angry:    "bg-red-50 text-red-700 border-red-200",
  Neutral:  "bg-slate-100 text-slate-600 border-slate-200",
};

export function TextChat() {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "system",
      text: "Namaste! I'm the BharatEcho assistant. You can type your complaint or query here. How can I help you today?",
      ts: new Date().toISOString(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sentiment, setSentiment] = useState("Neutral");
  const sessionId = useRef<string>(uuidv4());
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = messagesContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  const resetChat = async () => {
    // Wipe backend state
    try {
      await fetch(`${API_URL}/api/reset-session/${sessionId.current}`, { method: "POST", headers: { "ngrok-skip-browser-warning": "1" } });
    } catch (_) {}
    sessionId.current = uuidv4();
    setSentiment("Neutral");
    setMessages([
      {
        role: "system",
        text: "Chat reset. How can I help you today?",
        ts: new Date().toISOString(),
      },
    ]);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: "user", text, ts: new Date().toISOString() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const res = await sendTextMessage(text, sessionId.current);
      setSentiment(res.sentiment);
      const sysMsg: Message = {
        role: "system",
        text: res.ai_text,
        ts: new Date().toISOString(),
        complaint: res.complaint,
      };
      setMessages((prev) => [...prev, sysMsg]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "system",
          text: "Sorry, there was an error connecting to the server. Please try again.",
          ts: new Date().toISOString(),
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden flex flex-col h-[600px]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 bg-gradient-to-r from-orange-500 to-green-600 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
            <MessageSquare className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-semibold text-sm">BharatEcho Text Chat</p>
            <p className="text-white/70 text-xs">Type your complaint or query</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className={`text-xs border ${SENTIMENT_STYLE[sentiment] ?? SENTIMENT_STYLE.Neutral}`}>
            {sentiment}
          </Badge>
          <button
            onClick={resetChat}
            title="New conversation"
            className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 text-white" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4 bg-slate-50">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex gap-2.5 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            {/* Avatar */}
            <div
              className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center
                ${msg.role === "user"
                  ? "bg-blue-100"
                  : "bg-gradient-to-br from-orange-400 to-green-500"}`}
            >
              {msg.role === "user"
                ? <User className="w-3.5 h-3.5 text-blue-600" />
                : <Bot className="w-3.5 h-3.5 text-white" />}
            </div>

            {/* Bubble */}
            <div className={`max-w-[75%] space-y-1 ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
              <div
                className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap
                  ${msg.role === "user"
                    ? "bg-blue-600 text-white rounded-tr-sm"
                    : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm"}`}
              >
                {msg.text}
              </div>

              {/* Complaint registered badge */}
              {msg.complaint && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg text-xs text-emerald-700">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Complaint registered: <strong>{msg.complaint.id}</strong></span>
                </div>
              )}

              <p className="text-xs text-slate-400 px-1">
                {new Date(msg.ts).toLocaleTimeString("en-IN", {
                  hour: "2-digit", minute: "2-digit", second: "2-digit",
                })}
              </p>
            </div>
          </div>
        ))}

        {/* Typing indicator */}
        {loading && (
          <div className="flex gap-2.5">
            <div className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center bg-gradient-to-br from-orange-400 to-green-500">
              <Bot className="w-3.5 h-3.5 text-white" />
            </div>
            <div className="bg-white border border-slate-200 rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
              <div className="flex gap-1 items-center h-4">
                {[0, 1, 2].map((d) => (
                  <span
                    key={d}
                    className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
                    style={{ animationDelay: `${d * 0.15}s` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* Input */}
      <div className="px-4 py-3 bg-white border-t border-slate-100 flex-shrink-0">
        <div className="flex gap-2 items-end">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Type your complaint or query… (Enter to send)"
            rows={1}
            disabled={loading}
            className="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-300 focus:border-transparent disabled:opacity-50 max-h-28 overflow-y-auto"
            style={{ lineHeight: "1.5" }}
            onInput={(e) => {
              const t = e.currentTarget;
              t.style.height = "auto";
              t.style.height = Math.min(t.scrollHeight, 112) + "px";
            }}
          />
          <Button
            onClick={send}
            disabled={!input.trim() || loading}
            className="bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90 rounded-xl h-10 w-10 p-0 flex-shrink-0"
          >
            {loading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Send className="w-4 h-4" />}
          </Button>
        </div>
        <p className="text-xs text-slate-400 mt-1.5 pl-1">
          Shift+Enter for new line · Enter to send
        </p>
      </div>
    </div>
  );
}
