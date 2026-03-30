// pages/overview.tsx
import {
  Phone, PhoneIncoming, PhoneOutgoing, AlertCircle,
  CheckCircle, TrendingUp, Users, Zap, Droplet,
  Building, Wifi, WifiOff
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Progress } from "../components/ui/progress";
import { Badge } from "../components/ui/badge";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer
} from "recharts";
import { LiveCallInterface } from "../components/live-call-interface";
import { TextChat } from "../components/text-chat";
import { useRealtime } from "@/lib/RealtimeContext";
import { useLang } from "@/lib/LanguageContext";

const DEPT_COLORS: Record<string, string> = {
  electricity: "#f59e0b", water: "#3b82f6",
  road: "#8b5cf6", sanitation: "#06b6d4", general: "#6b7280",
};
const SENTIMENT_COLORS: Record<string, string> = {
  Positive: "#22c55e", Neutral: "#94a3b8", Negative: "#f97316", Angry: "#ef4444",
};

export function Overview() {
  const { stats, activeCall, transcript, connected } = useRealtime();
  const { t } = useLang();

  const deptCounts: Record<string, number> = {};
  stats?.recent_complaints.forEach((c) => {
    const key = c.category.toLowerCase();
    deptCounts[key] = (deptCounts[key] ?? 0) + 1;
  });
  const departmentData = Object.entries(deptCounts).map(([name, value]) => ({
    name: name.charAt(0).toUpperCase() + name.slice(1), value,
    color: DEPT_COLORS[name] ?? "#6b7280",
  }));

  const sentCounts: Record<string, number> = {};
  stats?.recent_calls.forEach((c) => {
    sentCounts[c.sentiment] = (sentCounts[c.sentiment] ?? 0) + 1;
  });
  const total = stats?.recent_calls.length || 1;
  const sentimentData = Object.entries(sentCounts).map(([name, count]) => ({
    name, value: Math.round((count / total) * 100),
    color: SENTIMENT_COLORS[name] ?? "#94a3b8",
  }));

  const s = stats;

  return (
    <div className="space-y-6">
      {/* Connection banner */}
      <div className={`flex items-center gap-2 text-xs px-3 py-2 rounded-lg w-fit
        ${connected ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600"}`}>
        {connected
          ? <><Wifi className="w-3.5 h-3.5" /> {t("live_connected")}</>
          : <><WifiOff className="w-3.5 h-3.5" /> {t("live_connecting")}</>}
      </div>

      {/* Voice + Text */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LiveCallInterface activeCall={activeCall} transcript={transcript} connected={connected} />
        <TextChat />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">{t("total_calls")}</CardTitle>
            <Phone className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{s?.calls.total ?? "—"}</div>
            {s?.calls.active ? (
              <div className="flex items-center gap-1 mt-1">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <p className="text-xs text-green-600">{s.calls.active} {t("active_calls").toLowerCase()}</p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 mt-1">—</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">{t("total_complaints")}</CardTitle>
            <AlertCircle className="w-4 h-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {/* FIX: use s.complaints.total — previously only summed pending + in_progress,
                which excluded Resolved and Escalated complaints causing a mismatch
                with the Complaints page which counts all records. */}
            <div className="text-2xl font-bold text-slate-900">
              {s?.complaints.total ?? "—"}
            </div>
            {s && (
              <p className="text-xs text-slate-500 mt-1">
                {s.complaints.pending} {t("pending").toLowerCase()} · {s.complaints.in_progress} {t("in_progress").toLowerCase()} · {s.complaints.resolved} resolved
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">{t("resolution_rate")}</CardTitle>
            <CheckCircle className="w-4 h-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {s ? `${s.complaints.resolution_rate}%` : "—"}
            </div>
            <Progress value={s?.complaints.resolution_rate ?? 0} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">
              {t("inbound")} / {t("outbound")}
            </CardTitle>
            <TrendingUp className="w-4 h-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {s ? `${s.calls.inbound} / ${s.calls.outbound}` : "— / —"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>{t("dept_breakdown")}</CardTitle>
            <CardDescription>{t("recent_complaints")}</CardDescription>
          </CardHeader>
          <CardContent>
            {departmentData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">
                {t("no_complaints")}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={departmentData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                    label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                    {departmentData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("sentiment_dist")}</CardTitle>
          </CardHeader>
          <CardContent>
            {sentimentData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-slate-400 text-sm">—</div>
            ) : (
              <div className="space-y-4 pt-2">
                {sentimentData.map((s) => (
                  <div key={s.name}>
                    <div className="flex justify-between mb-1">
                      <span className="text-sm font-medium">{s.name}</span>
                      <span className="text-sm text-slate-500">{s.value}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${s.value}%`, background: s.color }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Complaints */}
      <Card>
        <CardHeader>
          <CardTitle>{t("recent_complaints")}</CardTitle>
          <CardDescription>{t("live_connected")}</CardDescription>
        </CardHeader>
        <CardContent>
          {(!s || s.recent_complaints.length === 0) ? (
            <div className="text-center text-slate-400 text-sm py-8">{t("no_complaints")}</div>
          ) : (
            <div className="space-y-3">
              {s.recent_complaints.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-white rounded-lg border border-slate-200 flex items-center justify-center">
                      {c.category === "electricity" && <Zap className="w-4 h-4 text-yellow-500" />}
                      {c.category === "water"       && <Droplet className="w-4 h-4 text-blue-500" />}
                      {c.category === "road"        && <Building className="w-4 h-4 text-purple-500" />}
                      {!["electricity","water","road"].includes(c.category)
                        && <AlertCircle className="w-4 h-4 text-slate-400" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium">{c.id}</p>
                      <p className="text-xs text-slate-500 capitalize">{c.category} · {c.language}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="text-xs capitalize">{c.status}</Badge>
                    <Badge variant="outline" className={`text-xs ${
                      c.sentiment === "Angry"    ? "bg-red-50 text-red-700 border-red-200" :
                      c.sentiment === "Negative" ? "bg-orange-50 text-orange-700 border-orange-200" :
                      "bg-green-50 text-green-700 border-green-200"}`}>
                      {c.sentiment}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Quick Stats */}
      <Card>
        <CardHeader><CardTitle>{t("total_calls")}</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
              <PhoneIncoming className="w-8 h-8 text-blue-600" />
              <div>
                <p className="text-2xl font-bold text-blue-900">{s?.calls.inbound ?? 0}</p>
                <p className="text-xs text-blue-700">{t("inbound")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-green-50 rounded-lg">
              <PhoneOutgoing className="w-8 h-8 text-green-600" />
              <div>
                <p className="text-2xl font-bold text-green-900">{s?.calls.outbound ?? 0}</p>
                <p className="text-xs text-green-700">{t("outbound")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-purple-50 rounded-lg">
              <Users className="w-8 h-8 text-purple-600" />
              <div>
                {/* FIX: use total, not pending+in_progress */}
                <p className="text-2xl font-bold text-purple-900">{s?.complaints.total ?? 0}</p>
                <p className="text-xs text-purple-700">{t("total_complaints")}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 p-3 bg-orange-50 rounded-lg">
              <TrendingUp className="w-8 h-8 text-orange-600" />
              <div>
                <p className="text-2xl font-bold text-orange-900">
                  {s ? `${s.complaints.resolution_rate}%` : "0%"}
                </p>
                <p className="text-xs text-orange-700">{t("resolution_rate")}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
