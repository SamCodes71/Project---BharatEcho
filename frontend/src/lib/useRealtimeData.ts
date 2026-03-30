// src/lib/useRealtimeData.ts
import { useState, useEffect, useRef, useCallback } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000/ws/dashboard";
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface CallRecord {
  id: string;
  phone: string;
  direction: "inbound" | "outbound";
  status: "active" | "completed" | "escalated";
  sentiment: string;
  language: string;
  started_at: string;
  ended_at: string | null;
  duration: string | null;
  complaint_id: string | null;
}

export interface ComplaintRecord {
  id: string;
  call_id: string;
  citizen: string;
  phone: string;
  category: string;
  issue: string;
  department: string;
  assigned_to: string;
  status: string;
  priority: string;
  sentiment: string;
  language: string;
  created_at: string;
}

export interface TranscriptEntry {
  speaker: "user" | "system";
  text: string;
  ts: string;
}

export interface StatsData {
  calls: {
    total: number;
    active: number;
    inbound: number;
    outbound: number;
  };
  complaints: {
    total: number;
    pending: number;
    in_progress: number;
    resolved: number;
    resolution_rate: number;
  };
  recent_calls: CallRecord[];
  recent_complaints: ComplaintRecord[];
  unread_notifications: number;
}

export interface RealtimeState {
  stats: StatsData | null;
  activeCall: CallRecord | null;
  transcript: TranscriptEntry[];
  calls: CallRecord[];
  complaints: ComplaintRecord[];
  connected: boolean;
  unreadNotifications: number;
}

// Hook moved to RealtimeContext.tsx as singleton provider

// ─── REST helpers ────────────────────────────────────────────────────────────

export async function fetchCalls(): Promise<CallRecord[]> {
  const r = await fetch(`${API_URL}/api/calls`, { headers: { "ngrok-skip-browser-warning": "1" } });
  return r.json();
}

export async function fetchComplaints(): Promise<ComplaintRecord[]> {
  const r = await fetch(`${API_URL}/api/complaints`, { headers: { "ngrok-skip-browser-warning": "1" } });
  return r.json();
}

export interface AudioResponse {
  audio_url: string;
  user_text: string;
  ai_text: string;
  sentiment: string;
  complaint: Record<string, any> | null;
}

// Backwards-compatible alias — use useRealtime() from RealtimeContext for new code
export { useRealtime as useRealtimeData } from "./RealtimeContext";

export async function sendAudio(file: File, callId?: string): Promise<AudioResponse> {
  const form = new FormData();
  form.append("audio", file);
  const url = callId
    ? `${API_URL}/ai/chat?call_id=${encodeURIComponent(callId)}`
    : `${API_URL}/ai/chat`;
  const r = await fetch(url, { method: "POST", body: form, headers: { "ngrok-skip-browser-warning": "1" } });
  const data: AudioResponse = await r.json();

  // Ensure audio_url is always a full URL (backend may return /static/xxx.mp3)
  if (data.audio_url && !data.audio_url.startsWith("http")) {
    data.audio_url = `${API_URL}${data.audio_url}`;
  }
  return data;
}
