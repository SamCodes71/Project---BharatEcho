// pages/notifications.tsx
import { useState, useEffect } from "react";
import {
  Bell, BellOff, CheckCheck, AlertCircle,
  ClipboardList, Phone, Info, RefreshCw, Trash2
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { useRealtime } from "@/lib/RealtimeContext";

import { useLang } from "@/lib/LanguageContext";
import { apiGet, apiPost, apiPatch, apiDelete, apiFetch, API } from "@/lib/fetch";

interface Notification {
  id: string;
  title: string;
  message: string;
  kind: "complaint" | "survey" | "call" | "system";
  ref_id: string;
  read: boolean;
  created_at: string;
}

const KIND_ICON: Record<string, React.ReactNode> = {
  complaint: <AlertCircle className="w-4 h-4 text-orange-500" />,
  survey:    <ClipboardList className="w-4 h-4 text-blue-500" />,
  call:      <Phone className="w-4 h-4 text-green-500" />,
  system:    <Info className="w-4 h-4 text-slate-400" />,
};

const KIND_BG: Record<string, string> = {
  complaint: "bg-orange-50",
  survey:    "bg-blue-50",
  call:      "bg-green-50",
  system:    "bg-slate-50",
};

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60)   return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

export function Notifications() {
  const { t } = useLang();
  const { connected } = useRealtime();
  const [items, setItems]     = useState<Notification[]>([]);
  const [unread, setUnread]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<string>("all");

  const load = async () => {
    try {
      const data = await apiGet('/api/notifications');
      setItems(data.items ?? []);
      setUnread(data.unread ?? 0);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // Re-fetch whenever a new WS event fires (stats change = new notification possible)
  useEffect(() => {
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  const markRead = async (id: string) => {
    await apiPost(`/api/notifications/${id}/read`);
    setItems((prev) => prev.map((n) => n.id === id ? { ...n, read: true } : n));
    setUnread((u) => Math.max(0, u - 1));
  };

  const markAllRead = async () => {
    await apiPost('/api/notifications/read-all');
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnread(0);
  };

  const filtered = filter === "all" ? items : items.filter((n) => n.kind === filter);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-6 h-6 text-slate-700" />
            {unread > 0 && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-800">{t("notif_title")}</h2>
            <p className="text-sm text-slate-400">{unread} {t("unread")} · {items.length} total</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </Button>
          {unread > 0 && (
            <Button variant="outline" size="sm" onClick={markAllRead} className="gap-1">
              <CheckCheck className="w-3.5 h-3.5" />{t("mark_all_read")}
            </Button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 flex-wrap">
        {["all", "complaint", "survey", "call", "system"].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors capitalize
              ${filter === f
                ? "bg-gradient-to-r from-orange-500 to-green-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            {f}
            {f === "all" && items.length > 0 && (
              <span className="ml-1.5 opacity-70">{items.length}</span>
            )}
            {f !== "all" && (
              <span className="ml-1.5 opacity-70">
                {items.filter((n) => n.kind === f).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center text-slate-400 text-sm py-16">{t("loading")}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <BellOff className="w-10 h-10 text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">{t("no_notifications")}</p>
              <p className="text-xs text-slate-300 mt-1">
                They appear automatically when complaints are registered, surveys completed, and calls end.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {filtered.map((n) => (
                <div
                  key={n.id}
                  className={`flex gap-4 px-5 py-4 transition-colors cursor-pointer
                    ${!n.read ? "bg-orange-50/40 hover:bg-orange-50/60" : "hover:bg-slate-50/80"}`}
                  onClick={() => !n.read && markRead(n.id)}
                >
                  {/* Icon */}
                  <div className={`w-9 h-9 rounded-full flex-shrink-0 flex items-center justify-center
                    ${KIND_BG[n.kind] ?? "bg-slate-50"}`}>
                    {KIND_ICON[n.kind] ?? <Info className="w-4 h-4 text-slate-400" />}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${!n.read ? "font-semibold text-slate-900" : "font-medium text-slate-700"}`}>
                        {n.title}
                      </p>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs text-slate-400">{timeAgo(n.created_at)}</span>
                        {!n.read && (
                          <span className="w-2 h-2 rounded-full bg-orange-500 flex-shrink-0" />
                        )}
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{n.message}</p>
                    {n.ref_id && (
                      <span className="text-xs text-slate-400 font-mono mt-1 inline-block">
                        {n.ref_id}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
