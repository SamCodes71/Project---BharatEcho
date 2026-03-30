// pages/analytics.tsx
import { useState, useEffect } from "react";
import {
  TrendingUp, Phone, AlertCircle, Star,
  CheckCircle, RefreshCw, BarChart3
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from "recharts";

import { useLang } from "@/lib/LanguageContext";
import { apiGet, apiPost, apiPatch, apiDelete, apiFetch, API } from "@/lib/fetch";

const DEPT_COLORS: Record<string, string> = {
  electricity: "#f59e0b", water: "#3b82f6", road: "#8b5cf6",
  sanitation: "#06b6d4",  general: "#6b7280",
};
const SENT_COLORS: Record<string, string> = {
  Positive: "#22c55e", Neutral: "#94a3b8", Negative: "#f97316", Angry: "#ef4444",
};

interface AnalyticsData {
  call_trend:          { date: string; inbound: number; outbound: number }[];
  sentiment_dist:      { name: string; value: number }[];
  category_dist:       { name: string; value: number }[];
  avg_resolution_minutes: number;
  satisfaction_avg:    number;
  satisfaction_dist:   Record<string, number>;
  total_calls:         number;
  total_complaints:    number;
  total_surveys:       number;
  resolution_rate:     number;
}

export function Analytics() {
  const { t } = useLang();
  const [data, setData]     = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      setData(await apiGet('/api/analytics'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const satisfactionBars = data
    ? [5, 4, 3, 2, 1].map((s) => ({
        name: `${s}★`, value: data.satisfaction_dist[String(s)] ?? 0,
      }))
    : [];

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
      {t("loading")}
    </div>
  );

  const noData = !data || data.total_calls === 0;

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: t("total_calls"),        value: data?.total_calls ?? 0,        icon: <Phone className="w-5 h-5 text-blue-400" />,    bg: "bg-blue-50" },
          { label: t("total_complaints"),   value: data?.total_complaints ?? 0,   icon: <AlertCircle className="w-5 h-5 text-orange-400" />, bg: "bg-orange-50" },
          { label: t("resolution_rate"),    value: `${data?.resolution_rate ?? 0}%`, icon: <CheckCircle className="w-5 h-5 text-emerald-400" />, bg: "bg-emerald-50" },
          { label: t("satisfaction"),   value: data?.satisfaction_avg ? `${data.satisfaction_avg}/5` : "—", icon: <Star className="w-5 h-5 text-amber-400 fill-amber-400" />, bg: "bg-amber-50" },
        ].map((k) => (
          <Card key={k.label}>
            <CardContent className="pt-5">
              <div className={`w-9 h-9 ${k.bg} rounded-lg flex items-center justify-center mb-3`}>
                {k.icon}
              </div>
              <p className="text-2xl font-bold text-slate-900">{k.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{k.label}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {noData ? (
        <Card>
          <CardContent className="py-20 text-center">
            <BarChart3 className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-400 text-sm font-medium">No data yet</p>
            <p className="text-slate-300 text-xs mt-1">Charts will appear as calls and complaints come in.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Call Trend */}
          {data!.call_trend.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Call Volume Trend</CardTitle>
                    <CardDescription>Inbound vs outbound over time</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={load} className="gap-1">
                    <RefreshCw className="w-3.5 h-3.5" /> Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <AreaChart data={data!.call_trend}>
                    <defs>
                      <linearGradient id="gradIn" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="gradOut" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%"  stopColor="#10b981" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="inbound"  stroke="#3b82f6" fill="url(#gradIn)"  name="Inbound" />
                    <Area type="monotone" dataKey="outbound" stroke="#10b981" fill="url(#gradOut)" name="Outbound" />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sentiment */}
            {data!.sentiment_dist.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Sentiment Distribution</CardTitle>
                  <CardDescription>Across all calls</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data!.sentiment_dist} cx="50%" cy="50%"
                        outerRadius={80} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                        labelLine={false}>
                        {data!.sentiment_dist.map((e, i) => (
                          <Cell key={i} fill={SENT_COLORS[e.name] ?? "#94a3b8"} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Category */}
            {data!.category_dist.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Complaint Categories</CardTitle>
                  <CardDescription>By department</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie data={data!.category_dist} cx="50%" cy="50%"
                        outerRadius={80} dataKey="value"
                        label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}
                        labelLine={false}>
                        {data!.category_dist.map((e, i) => (
                          <Cell key={i} fill={DEPT_COLORS[e.name] ?? "#6b7280"} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}

            {/* Satisfaction Distribution */}
            {satisfactionBars.some(b => b.value > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Satisfaction Scores</CardTitle>
                  <CardDescription>From survey responses</CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={satisfactionBars} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={28} />
                      <Tooltip />
                      <Bar dataKey="value" fill="#f59e0b" radius={[0, 4, 4, 0]} name="Responses" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Resolution time */}
          {(data?.avg_resolution_minutes ?? 0) > 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900">
                      {data!.avg_resolution_minutes} min
                    </p>
                    <p className="text-sm text-slate-500">Average complaint resolution time</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  );
}
