// pages/feedback.tsx
import { useState, useEffect, useCallback } from "react";
import {
  Star, RefreshCw, Trash2, Plus, MessageSquare,
  CheckCircle2, Clock, Phone, User, ChevronDown,
  BarChart3, ThumbsUp, ThumbsDown, Minus,
  Link2, Search, AlertCircle, Zap, Droplet, Building,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription,
} from "../components/ui/dialog";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow,
} from "../components/ui/table";
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger,
} from "../components/ui/dropdown-menu";

import { useLang } from "@/lib/LanguageContext";
import { apiGet, apiPost, apiDelete } from "@/lib/fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface FeedbackItem {
  id: string;
  complaint_id: string;
  service: string;
  citizen: string;
  phone: string;
  call_id: string;
  status: "pending" | "completed";
  rating: number | null;
  comment: string | null;
  created_at: string;
  completed_at: string | null;
}

interface FeedbackStats {
  total: number;
  completed: number;
  pending: number;
  avg_rating: number;
  distribution: Record<string, number>;
  recent: FeedbackItem[];
}

interface Complaint {
  id: string;
  citizen: string;
  phone: string;
  category: string;
  issue: string;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function StarRating({ rating, max = 5 }: { rating: number | null; max?: number }) {
  if (rating === null) return <span className="text-slate-400 text-xs">—</span>;
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${
            i < rating ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"
          }`}
        />
      ))}
    </div>
  );
}

function RatingBar({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  const colors = ["", "bg-red-400", "bg-orange-400", "bg-yellow-400", "bg-lime-400", "bg-green-500"];
  const n = parseInt(label);
  return (
    <div className="flex items-center gap-3">
      <div className="flex gap-0.5 w-20 flex-shrink-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star key={i} className={`w-3 h-3 ${i < n ? "text-amber-400 fill-amber-400" : "text-slate-200 fill-slate-200"}`} />
        ))}
      </div>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${colors[n] ?? "bg-slate-400"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{count}</span>
    </div>
  );
}

function SentimentIcon({ rating }: { rating: number | null }) {
  if (rating === null) return <Minus className="w-4 h-4 text-slate-400" />;
  if (rating >= 4) return <ThumbsUp className="w-4 h-4 text-green-500" />;
  if (rating <= 2) return <ThumbsDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-slate-400" />;
}

function CategoryIcon({ cat }: { cat: string }) {
  const cls = "w-3.5 h-3.5 flex-shrink-0";
  if (cat === "electricity") return <Zap className={`${cls} text-yellow-500`} />;
  if (cat === "water")       return <Droplet className={`${cls} text-blue-500`} />;
  if (cat === "road")        return <Building className={`${cls} text-purple-500`} />;
  return <AlertCircle className={`${cls} text-slate-400`} />;
}

// ── Empty add-form ────────────────────────────────────────────────────────────

const emptyForm = () => ({ citizen: "", phone: "", complaint_id: "", service: "" });

// ── Main component ────────────────────────────────────────────────────────────

export function Feedback() {
  const { t } = useLang();
  const [stats, setStats]     = useState<FeedbackStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Complaints for linking
  const [complaints, setComplaints]         = useState<Complaint[]>([]);
  const [loadingComplaints, setLoadingComplaints] = useState(false);
  const [linkMode, setLinkMode]             = useState<"complaint" | "service">("complaint");
  const [complaintSearch, setComplaintSearch] = useState("");

  // Dialog
  const [showAdd, setShowAdd]       = useState(false);
  const [showRate, setShowRate]     = useState(false);
  const [selected, setSelected]     = useState<FeedbackItem | null>(null);
  const [form, setForm]             = useState(emptyForm());
  const [rateValue, setRateValue]   = useState(5);
  const [rateComment, setRateComment] = useState("");
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState<string | null>(null);

  // Filter
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "completed">("all");

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setStats(await apiGet("/api/feedback"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Load complaints for the add-feedback dialog
  const loadComplaints = useCallback(async () => {
    setLoadingComplaints(true);
    try {
      setComplaints(await apiGet("/api/complaints"));
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingComplaints(false);
    }
  }, []);

  // ── Derived ───────────────────────────────────────────────────────────────

  const items: FeedbackItem[] = stats?.recent ?? [];
  const filtered = filterStatus === "all"
    ? items
    : items.filter((f) => f.status === filterStatus);

  const filteredComplaints = complaints.filter((c) => {
    const q = complaintSearch.toLowerCase();
    return !q
      || c.id.toLowerCase().includes(q)
      || c.citizen.toLowerCase().includes(q)
      || c.issue.toLowerCase().includes(q)
      || c.category.toLowerCase().includes(q);
  });

  // ── Actions ───────────────────────────────────────────────────────────────

  const createFeedback = async () => {
    if (!form.citizen.trim()) return;
    setSaving(true);
    try {
      await apiPost("/api/feedback", {
        citizen:      form.citizen,
        phone:        form.phone || "",
        complaint_id: linkMode === "complaint" ? form.complaint_id || "" : "",
        service:      linkMode === "service"   ? form.service || ""   : "",
      });
      setShowAdd(false);
      setForm(emptyForm());
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const submitRating = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await apiPost(`/api/feedback/${selected.id}/complete`, {
        rating:  rateValue,
        comment: rateComment,
      });
      setShowRate(false);
      setSelected(null);
      setRateComment("");
      setRateValue(5);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const deleteFeedback = async (id: string) => {
    setDeleting(id);
    try {
      await apiDelete(`/api/feedback/${id}`);
      await load();
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(null);
    }
  };

  const openRate = (item: FeedbackItem) => {
    setSelected(item);
    setRateValue(item.rating ?? 5);
    setRateComment(item.comment ?? "");
    setShowRate(true);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Citizen Feedback</h2>
          <p className="text-sm text-slate-500 mt-0.5">Track satisfaction ratings from resolved complaints</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button
            size="sm"
            className="bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90"
            onClick={() => {
              setForm(emptyForm());
              setLinkMode("complaint");
              setComplaintSearch("");
              setShowAdd(true);
              loadComplaints();
            }}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            Request Feedback
          </Button>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Total Requests</CardTitle>
            <MessageSquare className="w-4 h-4 text-slate-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats?.total ?? "—"}</div>
            <p className="text-xs text-slate-400 mt-1">All-time</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Completed</CardTitle>
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">{stats?.completed ?? "—"}</div>
            <p className="text-xs text-slate-400 mt-1">
              {stats ? `${stats.pending} pending` : ""}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Avg. Rating</CardTitle>
            <Star className="w-4 h-4 text-amber-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {stats?.avg_rating ? stats.avg_rating.toFixed(1) : "—"}
            </div>
            <div className="mt-1">
              <StarRating rating={stats?.avg_rating ? Math.round(stats.avg_rating) : null} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-slate-600">Response Rate</CardTitle>
            <BarChart3 className="w-4 h-4 text-blue-400" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-slate-900">
              {stats && stats.total > 0
                ? `${Math.round((stats.completed / stats.total) * 100)}%`
                : "—"}
            </div>
            <p className="text-xs text-slate-400 mt-1">Completion rate</p>
          </CardContent>
        </Card>
      </div>

      {/* Distribution + Table */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rating distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Rating Distribution</CardTitle>
            <CardDescription>
              {stats?.completed ?? 0} completed response{stats?.completed !== 1 ? "s" : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!stats || stats.completed === 0 ? (
              <div className="text-center text-slate-400 text-sm py-8">No ratings yet</div>
            ) : (
              <div className="space-y-2.5">
                {["5", "4", "3", "2", "1"].map((star) => (
                  <RatingBar
                    key={star}
                    label={star}
                    count={stats.distribution[star] ?? 0}
                    total={stats.completed}
                  />
                ))}
                <div className="pt-3 border-t border-slate-100 mt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-500">Average</span>
                    <div className="flex items-center gap-2">
                      <StarRating rating={Math.round(stats.avg_rating)} />
                      <span className="font-semibold text-slate-800">
                        {stats.avg_rating.toFixed(1)} / 5
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Table */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Feedback Requests</CardTitle>
                <CardDescription className="mt-0.5">
                  {filtered.length} record{filtered.length !== 1 ? "s" : ""}
                </CardDescription>
              </div>
              {/* Status filter */}
              <div className="flex gap-1">
                {(["all", "pending", "completed"] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterStatus(s)}
                    className={`px-3 py-1 text-xs rounded-full border transition-colors capitalize
                      ${filterStatus === s
                        ? "bg-orange-500 text-white border-orange-500"
                        : "border-slate-200 text-slate-600 hover:border-orange-300"}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center text-slate-400 text-sm py-12">Loading…</div>
            ) : filtered.length === 0 ? (
              <div className="text-center text-slate-400 text-sm py-12">No feedback records</div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-slate-50">
                      <TableHead className="text-xs">Citizen</TableHead>
                      <TableHead className="text-xs">Reference</TableHead>
                      <TableHead className="text-xs">Rating</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                      <TableHead className="text-xs">Date</TableHead>
                      <TableHead className="text-xs w-10" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((item) => (
                      <TableRow key={item.id} className="hover:bg-slate-50/60">
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-orange-100 to-green-100 flex items-center justify-center flex-shrink-0">
                              <User className="w-3.5 h-3.5 text-slate-500" />
                            </div>
                            <div>
                              <p className="text-sm font-medium leading-tight">{item.citizen}</p>
                              {item.phone && (
                                <p className="text-xs text-slate-400 flex items-center gap-1">
                                  <Phone className="w-3 h-3" /> {item.phone}
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="text-xs space-y-0.5">
                            {item.complaint_id && (
                              <p className="font-mono text-slate-700">{item.complaint_id}</p>
                            )}
                            {item.service && (
                              <p className="text-slate-400 capitalize">{item.service}</p>
                            )}
                            {!item.complaint_id && !item.service && (
                              <p className="text-slate-400">—</p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5">
                            <SentimentIcon rating={item.rating} />
                            <StarRating rating={item.rating} />
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant="outline"
                            className={`text-xs capitalize ${
                              item.status === "completed"
                                ? "bg-green-50 text-green-700 border-green-200"
                                : "bg-yellow-50 text-yellow-700 border-yellow-200"
                            }`}
                          >
                            {item.status === "completed"
                              ? <><CheckCircle2 className="w-3 h-3 mr-1 inline" />Completed</>
                              : <><Clock className="w-3 h-3 mr-1 inline" />Pending</>}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <p className="text-xs text-slate-500">
                            {new Date(item.created_at).toLocaleDateString("en-IN", {
                              day: "2-digit", month: "short", year: "numeric",
                            })}
                          </p>
                        </TableCell>
                        <TableCell>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <ChevronDown className="w-4 h-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => openRate(item)}>
                                <Star className="w-4 h-4 mr-2 text-amber-400" />
                                {item.status === "completed" ? "Update Rating" : "Enter Rating"}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-red-600 focus:text-red-600"
                                disabled={deleting === item.id}
                                onClick={() => deleteFeedback(item.id)}
                              >
                                <Trash2 className="w-4 h-4 mr-2" />
                                {deleting === item.id ? "Deleting…" : "Delete"}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* ── ADD FEEDBACK DIALOG ── */}
      <Dialog open={showAdd} onOpenChange={setShowAdd}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Request Feedback</DialogTitle>
            <DialogDescription>
              Link to a registered complaint or a specific service department
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 pt-2">

            {/* Link mode toggle */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1">
              {(["complaint", "service"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => {
                    setLinkMode(m);
                    setForm((p) => ({ ...p, complaint_id: "", service: "" }));
                    setComplaintSearch("");
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all
                    ${linkMode === m ? "bg-white shadow-sm text-slate-900" : "text-slate-500 hover:text-slate-700"}`}
                >
                  {m === "complaint" ? "📎 Link to Complaint" : "🏛️ Link to Service"}
                </button>
              ))}
            </div>

            {/* Citizen + Phone */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Citizen Name *</label>
                <Input
                  className="mt-1"
                  placeholder="Full name"
                  value={form.citizen}
                  onChange={(e) => setForm((p) => ({ ...p, citizen: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Phone</label>
                <div className="relative mt-1">
                  <Input
                    placeholder="+91XXXXXXXXXX"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    className={form.phone ? "pr-7" : ""}
                  />
                  {form.phone && (
                    <Phone className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400" />
                  )}
                </div>
                {form.phone && (
                  <p className="text-xs text-blue-500 mt-1 flex items-center gap-1">
                    📞 Automated feedback call will be placed
                  </p>
                )}
              </div>
            </div>

            {/* Complaint selector */}
            {linkMode === "complaint" ? (
              <div>
                <label className="text-sm font-medium text-slate-700">Select Complaint</label>
                {/* Search box */}
                <div className="relative mt-1 mb-2">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <Input
                    className="pl-8 text-sm"
                    placeholder="Search by ID, citizen, issue, category…"
                    value={complaintSearch}
                    onChange={(e) => setComplaintSearch(e.target.value)}
                  />
                </div>

                {loadingComplaints ? (
                  <div className="text-xs text-slate-400 py-3 text-center">Loading complaints…</div>
                ) : filteredComplaints.length === 0 ? (
                  <div className="text-xs text-slate-400 py-3 text-center">
                    {complaints.length === 0 ? "No complaints registered yet" : "No complaints match your search"}
                  </div>
                ) : (
                  <div className="max-h-44 overflow-y-auto rounded-lg border border-slate-200 divide-y divide-slate-100">
                    {filteredComplaints.map((c) => {
                      const selected = form.complaint_id === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setForm((p) => ({
                            ...p,
                            complaint_id: c.id,
                            citizen: p.citizen || c.citizen,
                            phone:   p.phone   || c.phone,
                          }))}
                          className={`w-full text-left px-3 py-2.5 flex items-start gap-2.5 transition-colors
                            ${selected
                              ? "bg-orange-50 border-l-2 border-l-orange-400"
                              : "hover:bg-slate-50"}`}
                        >
                          <CategoryIcon cat={c.category} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-xs font-semibold text-slate-700">{c.id}</span>
                              <span className="text-xs text-slate-500">{c.citizen}</span>
                              {c.phone && (
                                <span className="text-xs text-blue-500 flex items-center gap-0.5">
                                  <Phone className="w-2.5 h-2.5" />{c.phone}
                                </span>
                              )}
                              <span className={`text-xs px-1.5 py-0.5 rounded-full capitalize
                                ${c.status === "Resolved" ? "bg-emerald-50 text-emerald-600" :
                                  c.status === "Pending"  ? "bg-amber-50 text-amber-600" :
                                  "bg-slate-100 text-slate-500"}`}>
                                {c.status}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-0.5 truncate">{c.issue}</p>
                          </div>
                          {selected && (
                            <CheckCircle2 className="w-4 h-4 text-orange-500 flex-shrink-0 mt-0.5" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {form.complaint_id && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-2 bg-orange-50 rounded-lg border border-orange-100">
                    <Link2 className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />
                    <span className="text-xs text-orange-700 font-medium">Linked: </span>
                    <span className="text-xs font-mono text-orange-600">{form.complaint_id}</span>
                    <button
                      className="ml-auto text-xs text-slate-400 hover:text-red-500 transition-colors"
                      onClick={() => setForm((p) => ({ ...p, complaint_id: "" }))}
                    >
                      ✕ clear
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="text-sm font-medium text-slate-700">Service / Department</label>
                <Input
                  className="mt-1"
                  placeholder="e.g. Water Supply, Electricity, Sanitation"
                  value={form.service}
                  onChange={(e) => setForm((p) => ({ ...p, service: e.target.value }))}
                />
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={() => setShowAdd(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90"
                disabled={saving || !form.citizen.trim()}
                onClick={createFeedback}
              >
                {saving ? "Creating…" : "Create Request"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── RATE DIALOG ── */}
      <Dialog open={showRate} onOpenChange={setShowRate}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {selected?.status === "completed" ? "Update Rating" : "Enter Rating"}
            </DialogTitle>
            <DialogDescription>
              {selected?.citizen} · {selected?.complaint_id || selected?.service || selected?.id}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-5 pt-2">
            {/* Star picker */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Rating</p>
              <div className="flex gap-2">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    onClick={() => setRateValue(n)}
                    className="transition-transform hover:scale-110 focus:outline-none"
                  >
                    <Star
                      className={`w-8 h-8 transition-colors ${
                        n <= rateValue
                          ? "text-amber-400 fill-amber-400"
                          : "text-slate-200 fill-slate-200"
                      }`}
                    />
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {["", "Very Dissatisfied", "Dissatisfied", "Neutral", "Satisfied", "Very Satisfied"][rateValue]}
              </p>
            </div>

            {/* Comment */}
            <div>
              <label className="text-sm font-medium text-slate-700">Comment (optional)</label>
              <textarea
                rows={3}
                value={rateComment}
                onChange={(e) => setRateComment(e.target.value)}
                placeholder="Any additional feedback…"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300"
              />
            </div>

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowRate(false)}>
                Cancel
              </Button>
              <Button
                className="flex-1 bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90"
                disabled={saving}
                onClick={submitRating}
              >
                {saving ? "Saving…" : "Submit Rating"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
