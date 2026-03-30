// pages/calls.tsx
import { useState, useEffect, useRef } from "react";
import {
  PhoneIncoming, PhoneOutgoing, Phone, Clock, Volume2, User, Calendar
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import { Progress } from "../components/ui/progress";
import { useRealtime } from "@/lib/RealtimeContext";
import { useLang } from "@/lib/LanguageContext";

// ── Live duration hook ────────────────────────────────────────────────────────
// For active calls we tick every second from started_at.
// For completed calls we just format the stored duration string.

function useElapsed(startedAt: string, isActive: boolean): string {
  const [elapsed, setElapsed] = useState("");

  useEffect(() => {
    if (!isActive) return;

    const calc = () => {
      const diffSec = Math.max(
        0,
        Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)
      );
      const m = Math.floor(diffSec / 60);
      const s = diffSec % 60;
      setElapsed(`${m}m ${String(s).padStart(2, "0")}s`);
    };

    calc(); // run immediately so there's no 1-second blank
    const id = setInterval(calc, 1000);
    return () => clearInterval(id);
  }, [startedAt, isActive]);

  return elapsed;
}

// ── CallRow ───────────────────────────────────────────────────────────────────

interface CallRecord {
  id: string;
  phone: string;
  direction: string;
  status: string;
  sentiment: string;
  language: string;
  started_at: string;
  ended_at: string | null;
  duration: string | null;
  complaint_id: string | null;
}

function CallRow({ call, color }: { call: CallRecord; color: string }) {
  const { t } = useLang();
  const isActive = call.status === "active";
  const liveElapsed = useElapsed(call.started_at, isActive);

  const durationLabel = isActive
    ? liveElapsed          // ticking live timer
    : (call.duration ?? "—");

  const sentimentCls = (s: string) =>
    ({
      Positive: "bg-green-100 text-green-800",
      Neutral:  "bg-gray-100 text-gray-800",
      Negative: "bg-orange-100 text-orange-800",
      Angry:    "bg-red-100 text-red-800",
    }[s] ?? "bg-gray-100 text-gray-800");

  return (
    <div className={`border rounded-lg p-4 transition-colors ${
      isActive ? "border-green-300 bg-green-50/40" : "border-slate-200"
    }`}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className={`w-10 h-10 bg-${color}-100 rounded-full flex items-center justify-center relative`}>
            <User className={`w-5 h-5 text-${color}-600`} />
            {isActive && (
              <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-white animate-pulse" />
            )}
          </div>
          <div>
            <p className="font-medium">{call.phone}</p>
            <div className="flex items-center gap-1 mt-0.5">
              <Calendar className="w-3 h-3 text-slate-400" />
              <p className="text-xs text-slate-500">
                {new Date(call.started_at).toLocaleString("en-IN")}
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Badge variant="outline" className={`bg-${color}-50 text-${color}-700 text-xs`}>
            {call.id}
          </Badge>
          <Badge
            variant="outline"
            className={`text-xs capitalize ${
              isActive
                ? "bg-green-100 text-green-700 border-green-300"
                : ""
            }`}
          >
            {isActive && (
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse mr-1.5 inline-block" />
            )}
            {call.status}
          </Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Duration — live for active calls */}
        <div className="flex items-center gap-2">
          <Clock className={`w-4 h-4 ${isActive ? "text-green-400" : "text-slate-300"}`} />
          <span className={`text-sm font-mono tabular-nums ${isActive ? "text-green-700 font-semibold" : ""}`}>
            {durationLabel}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-slate-300" />
          <span className="text-sm">{call.language}</span>
        </div>

        <Badge className={sentimentCls(call.sentiment)} variant="outline">
          {call.sentiment}
        </Badge>

        {call.complaint_id && (
          <span className="text-sm text-slate-500">→ {call.complaint_id}</span>
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export function Calls() {
  const { stats, calls: liveCalls, connected } = useRealtime();
  const { t } = useLang();

  const allCalls = liveCalls.length ? liveCalls : (stats?.recent_calls ?? []);
  const inbound  = allCalls.filter((c: CallRecord) => c.direction === "inbound");
  const outbound = allCalls.filter((c: CallRecord) => c.direction === "outbound");

  const langCounts: Record<string, number> = {};
  allCalls.forEach((c: CallRecord) => {
    langCounts[c.language] = (langCounts[c.language] ?? 0) + 1;
  });
  const totalCalls = allCalls.length || 1;
  const langData = Object.entries(langCounts).map(([lang, count]) => ({
    lang, count, percent: Math.round((count / totalCalls) * 100),
  }));

  return (
    <div className="space-y-6">
      <div className={`text-xs px-3 py-1.5 rounded-full w-fit flex items-center gap-1.5
        ${connected ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-green-500 animate-pulse" : "bg-slate-400"}`} />
        {connected ? t("live_connected") : t("live_connecting")}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: t("total_calls"),  val: stats?.calls.total    ?? 0, icon: <Phone className="w-8 h-8 text-slate-300" />,        color: "text-slate-900" },
          { label: t("inbound"),      val: stats?.calls.inbound  ?? 0, icon: <PhoneIncoming className="w-8 h-8 text-blue-200" />,  color: "text-blue-600"  },
          { label: t("outbound"),     val: stats?.calls.outbound ?? 0, icon: <PhoneOutgoing className="w-8 h-8 text-green-200" />, color: "text-green-600" },
          { label: t("active_calls"), val: stats?.calls.active   ?? 0, icon: <Clock className="w-8 h-8 text-purple-200" />,       color: "text-purple-600"},
        ].map(({ label, val, icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600">{label}</p>
                  <p className={`text-2xl font-bold mt-1 ${color}`}>{val}</p>
                </div>
                {icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Language distribution */}
      {langData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t("lang_breakdown")}</CardTitle>
            <CardDescription>{t("language")}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {langData.map((item) => (
                <div key={item.lang}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium">{item.lang}</span>
                    <span className="text-sm text-slate-600">{item.count} ({item.percent}%)</span>
                  </div>
                  <Progress value={item.percent} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tabs */}
      <Tabs defaultValue="inbound" className="space-y-4">
        <TabsList>
          <TabsTrigger value="inbound" className="flex items-center gap-2">
            <PhoneIncoming className="w-4 h-4" /> {t("inbound")} ({inbound.length})
          </TabsTrigger>
          <TabsTrigger value="outbound" className="flex items-center gap-2">
            <PhoneOutgoing className="w-4 h-4" /> {t("outbound")} ({outbound.length})
          </TabsTrigger>
        </TabsList>

        {[
          { value: "inbound",  list: inbound,  color: "blue"  },
          { value: "outbound", list: outbound, color: "green" },
        ].map(({ value, list, color }) => (
          <TabsContent key={value} value={value}>
            <Card>
              <CardHeader>
                <CardTitle>{value === "inbound" ? t("inbound") : t("outbound")}</CardTitle>
              </CardHeader>
              <CardContent>
                {list.length === 0 ? (
                  <div className="text-center text-slate-400 text-sm py-10">{t("no_calls")}</div>
                ) : (
                  <div className="space-y-3">
                    {list.map((call: CallRecord) => (
                      <CallRow key={call.id} call={call} color={color} />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
