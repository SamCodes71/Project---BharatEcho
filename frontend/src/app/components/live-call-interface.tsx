// src/components/live-call-interface.tsx
import { useState, useRef, useEffect } from "react";
import {
  Mic, MicOff, PhoneOff, Phone, Wifi, WifiOff,
  Volume2, User, Bot, Clock, Activity
} from "lucide-react";
// Inline UUID — no package needed
const uuidv4 = () => crypto.randomUUID();
const API_URL = (import.meta.env.VITE_API_URL || "http://localhost:8000").replace(/\/$/, "");
import { Badge } from "./ui/badge";
import { Button } from "./ui/button";
import { sendAudio } from "@/lib/useRealtimeData";

interface TranscriptLine {
  speaker: "user" | "system";
  text: string;
  ts: string;
}

interface Props {
  activeCall?: {
    id: string;
    phone: string;
    status: string;
    sentiment: string;
    started_at: string;
  } | null;
  transcript?: TranscriptLine[];
  connected?: boolean;
}

export function LiveCallInterface({ activeCall, transcript: externalTranscript, connected }: Props) {
  const [recording, setRecording] = useState(false);
  const [callActive, setCallActive] = useState(false);
  const [localTranscript, setLocalTranscript] = useState<TranscriptLine[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [waveAmplitudes, setWaveAmplitudes] = useState<number[]>(Array(20).fill(4));
  // Stable per-session ID so state machine on backend stays in sync
  const sessionCallId = useRef<string>(uuidv4());

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunks = useRef<Blob[]>([]);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const waveRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // On mount: end any stale "active" calls left over from a previous session/server restart.
  // Without this, the dashboard always shows a zombie call as live.
  useEffect(() => {
    fetch(`${API_URL}/api/calls/end-all-active`, {
      method: "POST",
      headers: { "ngrok-skip-browser-warning": "1" },
    }).catch(() => {});
  }, []);

  // Merge external (WS) transcript with local
  const transcript = externalTranscript?.length
    ? externalTranscript
    : localTranscript;

  // Auto-scroll transcript — scroll the container, NOT the page
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = transcriptContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [transcript]);

  // Timer
  useEffect(() => {
    if (callActive) {
      timerRef.current = setInterval(() => setElapsed((e) => e + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [callActive]);

  const formatTime = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  // Waveform animation
  const animateWave = (analyse: boolean) => {
    if (waveRef.current) clearInterval(waveRef.current);
    if (!analyse) {
      setWaveAmplitudes(Array(20).fill(4));
      return;
    }
    waveRef.current = setInterval(() => {
      if (analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount);
        analyserRef.current.getByteFrequencyData(data);
        const bars = Array.from({ length: 20 }, (_, i) => {
          const idx = Math.floor((i / 20) * data.length);
          return Math.max(4, (data[idx] / 255) * 48);
        });
        setWaveAmplitudes(bars);
      } else {
        setWaveAmplitudes(Array(20).fill(0).map(() => Math.random() * 40 + 4));
      }
    }, 80);
  };

  const startCall = async () => {
    setLocalTranscript([]);
    setIsSpeaking(false);

    // ── Step 1: create the call record in the DB BEFORE enabling the UI ──────
    // This guarantees sessionCallId holds a real CALL-IN-XXXXXX id by the time
    // the user can press the mic or end button.
    let serverId: string | null = null;
    try {
      const res = await fetch(`${API_URL}/api/calls/start`, {
        method: "POST",
        headers: { "ngrok-skip-browser-warning": "1" },
      });
      if (res.ok) {
        const data = await res.json();
        serverId = data.id;
      }
    } catch (err) {
      console.error("[BharatEcho] /api/calls/start failed:", err);
    }

    // Fall back to a local UUID only if the network call failed entirely
    sessionCallId.current = serverId ?? uuidv4();
    console.log("[BharatEcho] Call started, id=", sessionCallId.current);

    // ── Step 2: now show the UI ───────────────────────────────────────────────
    setCallActive(true);
    addLine("system", "Namaste! Welcome to BharatEcho citizen services. Press and hold the microphone button to speak.");
  };

  const endCall = async () => {
    stopRecording();
    setCallActive(false);
    setRecording(false);
    setIsSpeaking(false);
    addLine("system", "Thank you for calling BharatEcho. Have a great day!");
    animateWave(false);

    const callId = sessionCallId.current;
    console.log("[BharatEcho] Ending call, id=", callId);

    // Mark completed in DB → broadcasts call_ended + stats_update to dashboard
    try {
      const res = await fetch(`${API_URL}/api/calls/${callId}/end`, {
        method: "POST",
        headers: { "ngrok-skip-browser-warning": "1" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        console.error("[BharatEcho] end call failed", res.status, body);
      }
    } catch (err) {
      console.error("[BharatEcho] end call fetch error:", err);
    }

    sessionCallId.current = uuidv4();
  };

  const addLine = (speaker: "user" | "system", text: string) => {
    const entry: TranscriptLine = { speaker, text, ts: new Date().toISOString() };
    setLocalTranscript((prev) => [...prev, entry]);
  };

  const startRecording = async () => {
    if (recording) return;
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    streamRef.current = stream;

    // Analyser for waveform
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 256;
    src.connect(analyser);
    analyserRef.current = analyser;

    const mr = new MediaRecorder(stream);
    mediaRecorderRef.current = mr;
    audioChunks.current = [];

    mr.ondataavailable = (e) => audioChunks.current.push(e.data);
    mr.onstop = async () => {
      animateWave(false);
      setIsProcessing(true);
      const blob = new Blob(audioChunks.current, { type: "audio/webm" });
      const file = new File([blob], "query.webm");

      try {
        // Use real call ID if Twilio call active, else use browser session ID
        const callId = activeCall?.id ?? sessionCallId.current;
        const res = await sendAudio(file, callId);

        // Real transcribed user speech from STT
        if (res.user_text?.trim()) {
          addLine("user", res.user_text);
        }
        // Real AI reply text
        if (res.ai_text?.trim()) {
          addLine("system", res.ai_text);
        }
        // Complaint registered confirmation
        if (res.complaint) {
          addLine("system", `✅ Complaint registered: ${res.complaint.id}`);
        }

        if (res.audio_url) {
          // Ensure full URL — backend returns /static/xxx.mp3 (relative)
          const fullUrl = res.audio_url.startsWith("http")
            ? res.audio_url
            : `${API_URL}${res.audio_url}`;

          const player = audioRef.current;
          if (player) {
            player.src = fullUrl;
            player.load();
            player.onplay  = () => setIsSpeaking(true);
            player.onended = () => {
              setIsSpeaking(false);
              // Stop mic stream only after AI finishes speaking
              stream.getTracks().forEach((t) => t.stop());
            };
            player.onerror = (e) => {
              console.error("Audio playback error:", e);
              setIsSpeaking(false);
              stream.getTracks().forEach((t) => t.stop());
            };
            try {
              await player.play();
            } catch (playErr) {
              console.error("play() failed:", playErr);
              // Fallback: stop stream anyway
              stream.getTracks().forEach((t) => t.stop());
            }
          }
        } else {
          stream.getTracks().forEach((t) => t.stop());
        }
      } catch (err) {
        console.error("Pipeline error:", err);
        addLine("system", "Sorry, there was an error processing your request. Please try again.");
        stream.getTracks().forEach((t) => t.stop());
      } finally {
        setIsProcessing(false);
      }
    };

    mr.start();
    setRecording(true);
    animateWave(true);
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    setRecording(false);
  };

  const sentimentColor = (s?: string) => {
    switch (s) {
      case "Positive": return "bg-emerald-100 text-emerald-700 border-emerald-200";
      case "Negative": return "bg-orange-100 text-orange-700 border-orange-200";
      case "Angry":    return "bg-red-100 text-red-700 border-red-200";
      default:         return "bg-slate-100 text-slate-600 border-slate-200";
    }
  };

  const currentSentiment = activeCall?.sentiment ?? "Neutral";
  const isLive = callActive || (!!activeCall && activeCall.status === "active");

  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm">
      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-orange-500 to-green-600">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <Phone className="w-5 h-5 text-white" />
            </div>
            {isLive && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-400 rounded-full border-2 border-white animate-pulse" />
            )}
          </div>
          <div>
            <p className="text-white font-semibold text-sm">
              {isLive ? "Call in Progress" : "BharatEcho Voice Agent"}
            </p>
            <p className="text-white/70 text-xs">
              {activeCall
                ? `Caller: ${activeCall.phone}`
                : isLive
                ? `Duration: ${formatTime(elapsed)}`
                : "Ready to receive calls"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isLive && (
            <Badge className="bg-red-500 text-white border-0 text-xs animate-pulse">
              ● LIVE
            </Badge>
          )}
          <Badge className={`text-xs border ${sentimentColor(currentSentiment)}`}>
            {currentSentiment}
          </Badge>
          <div className="flex items-center gap-1">
            {connected !== false ? (
              <Wifi className="w-4 h-4 text-white/80" />
            ) : (
              <WifiOff className="w-4 h-4 text-white/50" />
            )}
          </div>
        </div>
      </div>

      {/* ── Waveform + Timer ── */}
      <div className="flex items-center justify-between px-6 py-3 bg-slate-950">
        <div className="flex items-end gap-0.5 h-14">
          {waveAmplitudes.map((h, i) => (
            <div
              key={i}
              className="w-2 rounded-full transition-all duration-75"
              style={{
                height: `${h}px`,
                background: recording
                  ? `hsl(${120 + i * 3}, 70%, 55%)`
                  : isSpeaking
                  ? `hsl(${30 + i * 6}, 80%, 60%)`
                  : "#334155",
              }}
            />
          ))}
        </div>

        <div className="flex items-center gap-3">
          {isProcessing && (
            <div className="flex items-center gap-2 text-slate-400 text-xs">
              <Activity className="w-3 h-3 animate-spin" />
              Processing...
            </div>
          )}
          {isSpeaking && (
            <div className="flex items-center gap-1 text-orange-400 text-xs">
              <Volume2 className="w-3 h-3" />
              AI speaking
            </div>
          )}
          {isLive && (
            <div className="flex items-center gap-1 text-slate-300 font-mono text-sm">
              <Clock className="w-3 h-3 text-slate-500" />
              {formatTime(elapsed)}
            </div>
          )}
        </div>
      </div>

      {/* ── Transcript ── */}
      <div ref={transcriptContainerRef} className="h-64 overflow-y-auto px-5 py-4 space-y-3 bg-slate-50">
        {transcript.length === 0 && !isLive && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 text-sm gap-2">
            <Phone className="w-8 h-8 text-slate-300" />
            <p>Start a call to see live transcripts here</p>
          </div>
        )}
        {transcript.map((line, i) => (
          <div
            key={i}
            className={`flex gap-3 ${line.speaker === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            <div
              className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold
                ${line.speaker === "user"
                  ? "bg-blue-100 text-blue-600"
                  : "bg-gradient-to-br from-orange-400 to-green-500 text-white"}`}
            >
              {line.speaker === "user" ? <User className="w-3.5 h-3.5" /> : <Bot className="w-3.5 h-3.5" />}
            </div>
            <div
              className={`max-w-xs px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed
                ${line.speaker === "user"
                  ? "bg-blue-600 text-white rounded-tr-sm"
                  : "bg-white border border-slate-200 text-slate-700 rounded-tl-sm shadow-sm"}`}
            >
              {line.text}
              <div className={`text-xs mt-1 ${line.speaker === "user" ? "text-blue-200" : "text-slate-400"}`}>
                {new Date(line.ts).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
        {isProcessing && (
          <div className="flex gap-3">
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
        <div ref={transcriptEndRef} />
      </div>

      {/* ── Controls ── */}
      <div className="px-6 py-4 bg-white border-t border-slate-100 flex items-center justify-between">
        <div className="text-xs text-slate-400">
          {transcript.length > 0
            ? `${transcript.length} transcript line${transcript.length !== 1 ? "s" : ""}`
            : "No transcript yet"}
        </div>

        <div className="flex items-center gap-3">
          {!isLive ? (
            <Button
              onClick={startCall}
              className="bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90 gap-2"
            >
              <Phone className="w-4 h-4" />
              Start Demo Call
            </Button>
          ) : (
            <>
              {/* Mic button — hold to speak */}
              <button
                onMouseDown={startRecording}
                onMouseUp={stopRecording}
                onTouchStart={startRecording}
                onTouchEnd={stopRecording}
                disabled={isProcessing}
                className={`
                  w-14 h-14 rounded-full flex items-center justify-center transition-all duration-150 shadow-lg
                  ${recording
                    ? "bg-green-500 scale-110 shadow-green-300"
                    : isProcessing
                    ? "bg-slate-300 cursor-not-allowed"
                    : "bg-slate-800 hover:bg-slate-700 active:scale-95"}
                `}
                title="Hold to speak"
              >
                {recording
                  ? <Mic className="w-6 h-6 text-white" />
                  : <MicOff className="w-6 h-6 text-white/70" />}
              </button>

              <button
                onClick={endCall}
                className="w-14 h-14 rounded-full bg-red-500 hover:bg-red-600 flex items-center justify-center shadow-lg active:scale-95 transition-all"
                title="End call"
              >
                <PhoneOff className="w-6 h-6 text-white" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Audio player — must NOT be hidden for autoplay to work */}
      <audio
        ref={audioRef}
        style={{ display: "none" }}
        preload="auto"
        playsInline
      />
    </div>
  );
}
