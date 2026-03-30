// src/lib/RealtimeContext.tsx
// Singleton WebSocket context — prevents multiple WS connections being opened
// when multiple components call useRealtimeData() simultaneously.
//
// Usage: wrap your app root with <RealtimeProvider>, then call useRealtimeData()
// anywhere — it returns the same shared state, backed by a single WS connection.

import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from "react";
import type { RealtimeState, CallRecord, ComplaintRecord, TranscriptEntry, StatsData } from "./useRealtimeData";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/dashboard";

const defaultState: RealtimeState = {
  stats: null,
  activeCall: null,
  transcript: [],
  calls: [],
  complaints: [],
  connected: false,
  unreadNotifications: 0,
};

const RealtimeContext = createContext<RealtimeState>(defaultState);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<RealtimeState>(defaultState);
  const wsRef = useRef<WebSocket | null>(null);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (mountedRef.current) setState((s) => ({ ...s, connected: true }));
    };

    ws.onmessage = (evt) => {
      if (!mountedRef.current) return;
      try {
        const { event, data } = JSON.parse(evt.data);
        setState((prev) => {
          switch (event) {
            case "stats_update":
              return {
                ...prev,
                stats: data,
                calls: data.recent_calls ?? prev.calls,
                complaints: data.recent_complaints ?? prev.complaints,
                unreadNotifications: data.unread_notifications ?? prev.unreadNotifications,
              };
            case "call_started":
              return { ...prev, activeCall: data.call, transcript: data.transcript ?? [] };
            case "call_ended":
              return {
                ...prev,
                activeCall: prev.activeCall?.id === data.call.id ? null : prev.activeCall,
                calls: [data.call, ...prev.calls.filter((c) => c.id !== data.call.id)],
              };
            case "transcript_update":
              if (prev.activeCall?.id === data.call_id) {
                return { ...prev, transcript: [...prev.transcript, ...(data.entries ?? [])] };
              }
              return prev;
            case "new_complaint":
              return { ...prev, complaints: [data, ...prev.complaints] };
            default:
              return prev;
          }
        });
      } catch (e) {
        console.error("WS parse error", e);
      }
    };

    ws.onclose = () => {
      if (mountedRef.current) {
        setState((s) => ({ ...s, connected: false }));
        setTimeout(connect, 3000);
      }
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) wsRef.current.send("ping");
    }, 20000);
    return () => {
      mountedRef.current = false;
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, [connect]);

  return (
    <RealtimeContext.Provider value={state}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime(): RealtimeState {
  return useContext(RealtimeContext);
}
