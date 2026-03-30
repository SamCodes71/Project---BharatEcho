// pages/complaints.tsx
import { useState, useEffect, useCallback } from "react";
import {
  Search, Filter, Plus, Trash2, Edit3, Eye,
  Zap, Droplet, Building, AlertCircle, Clock,
  CheckCircle2, XCircle, MoreVertical, RefreshCw,
  CheckCheck, X, Download, MessageSquare, Star, Phone
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead,
  TableHeader, TableRow
} from "../components/ui/table";
import {
  DropdownMenu, DropdownMenuContent,
  DropdownMenuItem, DropdownMenuTrigger
} from "../components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogDescription
} from "../components/ui/dialog";

import { useLang } from "@/lib/LanguageContext";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Complaint {
  id: string;
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
  call_id: string;
}

type DialogMode = "view" | "add" | "edit" | "delete" | null;

const CATEGORIES = ["electricity", "water", "road", "sanitation", "general"];
const STATUSES   = ["Pending", "In Progress", "Resolved", "Escalated"];
const PRIORITIES = ["Low", "Medium", "High", "Critical"];
const LANGUAGES  = ["English", "Hindi", "Telugu", "Tamil", "Bengali", "Gujarati", "Marathi", "Kannada"];

const STATUS_COLOR: Record<string, string> = {
  Resolved:      "bg-green-100 text-green-800 border-green-200",
  "In Progress": "bg-blue-100 text-blue-800 border-blue-200",
  Pending:       "bg-yellow-100 text-yellow-800 border-yellow-200",
  Escalated:     "bg-red-100 text-red-800 border-red-200",
};

const PRIORITY_COLOR: Record<string, string> = {
  Critical: "bg-red-100 text-red-800 border-red-300",
  High:     "bg-orange-100 text-orange-800 border-orange-300",
  Medium:   "bg-yellow-100 text-yellow-800 border-yellow-300",
  Low:      "bg-green-100 text-green-800 border-green-300",
};

function CategoryIcon({ cat }: { cat: string }) {
  const cls = "w-4 h-4 flex-shrink-0";
  if (cat === "electricity") return <Zap className={`${cls} text-yellow-500`} />;
  if (cat === "water")       return <Droplet className={`${cls} text-blue-500`} />;
  if (cat === "road")        return <Building className={`${cls} text-purple-500`} />;
  return <AlertCircle className={`${cls} text-slate-400`} />;
}

const emptyForm = (): Partial<Complaint> => ({
  citizen: "", phone: "", category: "electricity",
  issue: "", priority: "Medium", language: "English",
  assigned_to: "", status: "Pending",
});

// ── Feedback Request Dialog ────────────────────────────────────────────────────

function FeedbackRequestDialog({
  complaint,
  onClose,
  onSent,
}: {
  complaint: Complaint | null;
  onClose: () => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);
  const [sent, setSent]       = useState(false);

  useEffect(() => {
    if (!complaint) { setSent(false); setSending(false); }
  }, [complaint]);

  if (!complaint) return null;

  const send = async () => {
    setSending(true);
    try {
      await apiPost("/api/feedback", {
        citizen:      complaint.citizen,
        phone:        complaint.phone || "",
        complaint_id: complaint.id,
        service:      complaint.department || complaint.category,
      });
      setSent(true);
      setTimeout(() => { onSent(); onClose(); }, 1200);
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={!!complaint} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-orange-500" />
            Request Feedback
          </DialogTitle>
          <DialogDescription>
            Send a feedback request to the citizen for this complaint
          </DialogDescription>
        </DialogHeader>

        {sent ? (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
            </div>
            <p className="text-sm font-medium text-green-700">Feedback request sent!</p>
            {complaint.phone && (
              <p className="text-xs text-slate-500">
                An automated call will be placed to {complaint.phone}
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 pt-2">
            {/* Complaint summary */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs text-slate-500">{complaint.id}</span>
                <Badge variant="outline" className={`text-xs ${STATUS_COLOR[complaint.status] ?? ""}`}>
                  {complaint.status}
                </Badge>
              </div>
              <p className="font-medium text-sm">{complaint.citizen}</p>
              <p className="text-xs text-slate-500">{complaint.issue}</p>
              <div className="flex items-center gap-4 text-xs text-slate-400 pt-1">
                <span className="flex items-center gap-1 capitalize">
                  <CategoryIcon cat={complaint.category} /> {complaint.category}
                </span>
                {complaint.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" /> {complaint.phone}
                  </span>
                )}
              </div>
            </div>

            {!complaint.phone && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-700">
                <AlertCircle className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
                No phone number on record — feedback request will be created but no automated call will be placed.
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
              <Button
                className="flex-1 bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90"
                disabled={sending}
                onClick={send}
              >
                {sending ? "Sending…" : "Send Request"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function Complaints() {
  const { t } = useLang();
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [deleting, setDeleting]     = useState(false);

  // Dialog state
  const [mode, setMode]         = useState<DialogMode>(null);
  const [selected, setSelected] = useState<Complaint | null>(null);
  const [form, setForm]         = useState<Partial<Complaint>>(emptyForm());

  // Feedback dialog
  const [feedbackTarget, setFeedbackTarget] = useState<Complaint | null>(null);

  // Search + filter
  const [search, setSearch]                 = useState("");
  const [filterStatus, setFilterStatus]     = useState("all");
  const [filterPriority, setFilterPriority] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  // ── Load ──────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setComplaints(await apiGet('/api/complaints'));
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const filtered = complaints.filter((c) => {
    const q = search.toLowerCase();
    const matchSearch = !q || [c.id, c.citizen, c.category, c.issue, c.phone]
      .some((v) => v?.toLowerCase().includes(q));
    const matchStatus   = filterStatus   === "all" || c.status   === filterStatus;
    const matchPriority = filterPriority === "all" || c.priority === filterPriority;
    const matchCategory = filterCategory === "all" || c.category === filterCategory;
    return matchSearch && matchStatus && matchPriority && matchCategory;
  });

  // Complaints eligible for feedback: Resolved or Escalated
  const feedbackEligible = complaints.filter(
    (c) => c.status === "Resolved" || c.status === "Escalated"
  );

  const counts = {
    total:    complaints.length,
    pending:  complaints.filter((c) => c.status === "Pending").length,
    inProg:   complaints.filter((c) => c.status === "In Progress").length,
    resolved: complaints.filter((c) => c.status === "Resolved").length,
  };

  // ── Actions ───────────────────────────────────────────────────────────────

  const openAdd    = () => { setForm(emptyForm()); setSelected(null); setMode("add"); };
  const openEdit   = (c: Complaint) => { setForm({ ...c }); setSelected(c); setMode("edit"); };
  const openView   = (c: Complaint) => { setSelected(c); setMode("view"); };
  const openDelete = (c: Complaint) => { setSelected(c); setMode("delete"); };
  const closeDialog = () => { setMode(null); setSelected(null); };
  const setField   = (key: keyof Complaint, val: string) =>
    setForm((prev) => ({ ...prev, [key]: val }));

  const saveComplaint = async () => {
    if (!form.citizen?.trim() || !form.issue?.trim()) return;
    setSaving(true);
    try {
      if (mode === "add") {
        await apiPost('/api/complaints', {
          citizen:  form.citizen,
          phone:    form.phone || "",
          category: form.category || "general",
          issue:    form.issue,
          priority: form.priority || "Medium",
          language: form.language || "English",
        });
      } else if (mode === "edit" && selected) {
        await apiPatch(`/api/complaints/${selected.id}`, {
          status:      form.status,
          priority:    form.priority,
          assigned_to: form.assigned_to,
        });
      }
      closeDialog();
      await load();
    } finally { setSaving(false); }
  };

  const deleteComplaint = async () => {
    if (!selected) return;
    setDeleting(true);
    try {
      await apiDelete(`/api/complaints/${selected.id}`);
      closeDialog();
      await load();
    } finally { setDeleting(false); }
  };

  const quickStatus = async (c: Complaint, status: string) => {
    await apiPatch(`/api/complaints/${c.id}`, { status });
    await load();
  };

  const clearFilters = () => {
    setSearch(""); setFilterStatus("all");
    setFilterPriority("all"); setFilterCategory("all");
  };

  const filtersActive = search || filterStatus !== "all" ||
    filterPriority !== "all" || filterCategory !== "all";

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total",       value: counts.total,    color: "text-slate-900",   icon: <AlertCircle className="w-7 h-7 text-slate-200" /> },
          { label: "Pending",     value: counts.pending,  color: "text-yellow-600",  icon: <Clock className="w-7 h-7 text-yellow-200" /> },
          { label: "In Progress", value: counts.inProg,   color: "text-blue-600",    icon: <Clock className="w-7 h-7 text-blue-200" /> },
          { label: "Resolved",    value: counts.resolved, color: "text-emerald-600", icon: <CheckCircle2 className="w-7 h-7 text-emerald-200" /> },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-500">{s.label}</p>
                  <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
                </div>
                {s.icon}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ── Tabs ── */}
      <Tabs defaultValue="all" className="space-y-4">
        <TabsList>
          <TabsTrigger value="all">
            All Complaints ({complaints.length})
          </TabsTrigger>
          <TabsTrigger value="feedback" className="flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5" />
            Request Feedback
            {feedbackEligible.length > 0 && (
              <span className="ml-1 w-5 h-5 bg-orange-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                {feedbackEligible.length > 9 ? "9+" : feedbackEligible.length}
              </span>
            )}
          </TabsTrigger>
        </TabsList>

        {/* ── ALL COMPLAINTS TAB ── */}
        <TabsContent value="all">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <CardTitle>{t("complaints_title")}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={load} className="gap-1">
                      <RefreshCw className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" onClick={openAdd}
                      className="gap-1 bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90">
                      <Plus className="w-3.5 h-3.5" />{t("add_complaint")}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <div className="relative flex-1 min-w-48">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input placeholder="Search by name, ID, issue…"
                      className="pl-9 h-9 text-sm" value={search}
                      onChange={(e) => setSearch(e.target.value)} />
                  </div>
                  {[
                    { label: "Status",   value: filterStatus,   onChange: setFilterStatus,   options: STATUSES },
                    { label: "Priority", value: filterPriority, onChange: setFilterPriority, options: PRIORITIES },
                    { label: "Category", value: filterCategory, onChange: setFilterCategory, options: CATEGORIES },
                  ].map((f) => (
                    <select key={f.label} value={f.value} onChange={(e) => f.onChange(e.target.value)}
                      className="h-9 px-3 border border-slate-200 rounded-lg text-sm bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-300">
                      <option value="all">All {f.label}s</option>
                      {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ))}
                  {filtersActive && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 gap-1 text-slate-500">
                      <X className="w-3.5 h-3.5" /> Clear
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>

            <CardContent>
              {loading ? (
                <div className="text-center py-12 text-slate-400 text-sm">{t("loading")}</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">
                    {complaints.length === 0
                      ? "No complaints yet. Add one manually or they appear automatically when citizens call."
                      : "No complaints match your filters."}
                  </p>
                  {complaints.length === 0 && (
                    <Button size="sm" onClick={openAdd}
                      className="mt-4 gap-1 bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90">
                      <Plus className="w-3.5 h-3.5" />{t("add_complaint")}
                    </Button>
                  )}
                </div>
              ) : (
                <>
                  <p className="text-xs text-slate-400 mb-3">
                    Showing {filtered.length} of {complaints.length} complaints
                  </p>
                  <div className="rounded-lg border border-slate-200">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50">
                          <TableHead className="w-32">ID</TableHead>
                          <TableHead>Citizen</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead className="max-w-xs">Issue</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Priority</TableHead>
                          <TableHead>Assigned To</TableHead>
                          <TableHead className="text-right w-36">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filtered.map((c) => (
                          <TableRow key={c.id} className="hover:bg-slate-50/50">
                            <TableCell className="font-mono text-xs text-slate-500">{c.id}</TableCell>
                            <TableCell>
                              <p className="font-medium text-sm">{c.citizen}</p>
                              {c.phone && <p className="text-xs text-slate-400">{c.phone}</p>}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <CategoryIcon cat={c.category} />
                                <span className="text-sm capitalize">{c.category}</span>
                              </div>
                            </TableCell>
                            <TableCell className="max-w-xs">
                              <p className="text-sm truncate" title={c.issue}>{c.issue}</p>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline"
                                className={`text-xs ${STATUS_COLOR[c.status] ?? "bg-slate-100 text-slate-600"}`}>
                                {c.status}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline"
                                className={`text-xs ${PRIORITY_COLOR[c.priority] ?? "bg-slate-100 text-slate-600"}`}>
                                {c.priority}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm text-slate-500">
                              {c.assigned_to || "—"}
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-1">
                                <button onClick={() => openView(c)} title="View details"
                                  className="p-1.5 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors">
                                  <Eye className="w-4 h-4" />
                                </button>
                                <button onClick={() => openEdit(c)} title="Edit"
                                  className="p-1.5 rounded hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors">
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button onClick={() => quickStatus(c, "Resolved")} title="Mark resolved"
                                  disabled={c.status === "Resolved"}
                                  className="p-1.5 rounded hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed">
                                  <CheckCheck className="w-4 h-4" />
                                </button>
                                {(c.status === "Resolved" || c.status === "Escalated") && (
                                  <button onClick={() => setFeedbackTarget(c)} title="Request feedback"
                                    className="p-1.5 rounded hover:bg-orange-50 text-slate-400 hover:text-orange-500 transition-colors">
                                    <MessageSquare className="w-4 h-4" />
                                  </button>
                                )}
                                <button onClick={() => openDelete(c)} title="Delete"
                                  className="p-1.5 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors">
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </>
              )}
              {filtered.length > 0 && (
                <p className="text-xs text-slate-400 mt-2 flex items-center gap-3">
                  <span className="flex items-center gap-1"><Eye className="w-3 h-3" /> View</span>
                  <span className="flex items-center gap-1"><Edit3 className="w-3 h-3" /> Edit</span>
                  <span className="flex items-center gap-1"><CheckCheck className="w-3 h-3" /> Resolve</span>
                  <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" /> Feedback</span>
                  <span className="flex items-center gap-1"><Trash2 className="w-3 h-3" /> Delete</span>
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FEEDBACK TAB ── */}
        <TabsContent value="feedback">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4 text-orange-500" />
                    Feedback Eligible Complaints
                  </CardTitle>
                  <p className="text-sm text-slate-400 mt-0.5">
                    Showing <strong>Resolved</strong> and <strong>Escalated</strong> complaints — request citizen feedback for any of these
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={load} className="gap-1">
                  <RefreshCw className="w-3.5 h-3.5" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-12 text-slate-400 text-sm">{t("loading")}</div>
              ) : feedbackEligible.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle2 className="w-10 h-10 text-slate-200 mx-auto mb-3" />
                  <p className="text-sm text-slate-400">
                    No resolved or escalated complaints yet.
                  </p>
                  <p className="text-xs text-slate-300 mt-1">
                    Resolve a complaint first, then come back here to request feedback.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {feedbackEligible.map((c) => (
                    <div key={c.id}
                      className="flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-orange-200 hover:bg-orange-50/30 transition-colors group">

                      {/* Category icon */}
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 group-hover:border-orange-200">
                        <CategoryIcon cat={c.category} />
                      </div>

                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <span className="font-mono text-xs text-slate-400">{c.id}</span>
                          <Badge variant="outline" className={`text-xs ${STATUS_COLOR[c.status] ?? ""}`}>
                            {c.status}
                          </Badge>
                          <Badge variant="outline" className={`text-xs ${PRIORITY_COLOR[c.priority] ?? ""}`}>
                            {c.priority}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm text-slate-900">{c.citizen}</p>
                        <p className="text-xs text-slate-500 truncate">{c.issue}</p>
                        <div className="flex items-center gap-3 mt-1 text-xs text-slate-400">
                          <span className="capitalize flex items-center gap-1">
                            <CategoryIcon cat={c.category} /> {c.category}
                          </span>
                          {c.phone && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" /> {c.phone}
                            </span>
                          )}
                          <span>
                            {new Date(c.created_at).toLocaleDateString("en-IN", {
                              day: "2-digit", month: "short", year: "numeric",
                            })}
                          </span>
                        </div>
                      </div>

                      {/* Phone presence indicator + action */}
                      <div className="flex flex-col items-end gap-2 flex-shrink-0">
                        {c.phone ? (
                          <span className="text-xs text-green-600 flex items-center gap-1">
                            <Phone className="w-3 h-3" /> Call will be placed
                          </span>
                        ) : (
                          <span className="text-xs text-amber-500 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" /> No phone — record only
                          </span>
                        )}
                        <Button
                          size="sm"
                          className="bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90 gap-1.5"
                          onClick={() => setFeedbackTarget(c)}
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          Request Feedback
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ── ADD / EDIT DIALOG ── */}
      <Dialog open={mode === "add" || mode === "edit"} onOpenChange={closeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{mode === "add" ? "Add New Complaint" : "Edit Complaint"}</DialogTitle>
            <DialogDescription>
              {mode === "add"
                ? "Manually register a citizen complaint"
                : `Editing ${selected?.id}`}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-2">
            {mode === "add" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Citizen Name *</label>
                    <Input className="mt-1" placeholder="Full name"
                      value={form.citizen ?? ""} onChange={(e) => setField("citizen", e.target.value)} />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Phone</label>
                    <Input className="mt-1" placeholder="+91XXXXXXXXXX"
                      value={form.phone ?? ""} onChange={(e) => setField("phone", e.target.value)} />
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium text-slate-700">Issue Description *</label>
                  <textarea rows={3} value={form.issue ?? ""}
                    onChange={(e) => setField("issue", e.target.value)}
                    placeholder="Describe the complaint in detail…"
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-sm font-medium text-slate-700">Category</label>
                    <select value={form.category ?? "general"} onChange={(e) => setField("category", e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                      {CATEGORIES.map((c) => <option key={c} value={c} className="capitalize">{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700">Language</label>
                    <select value={form.language ?? "English"} onChange={(e) => setField("language", e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                      {LANGUAGES.map((l) => <option key={l}>{l}</option>)}
                    </select>
                  </div>
                </div>
              </>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-slate-700">Status</label>
                <select value={form.status ?? "Pending"} onChange={(e) => setField("status", e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                  {STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div>
                <label className="text-sm font-medium text-slate-700">Priority</label>
                <select value={form.priority ?? "Medium"} onChange={(e) => setField("priority", e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                  {PRIORITIES.map((p) => <option key={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium text-slate-700">Assigned To</label>
              <Input className="mt-1" placeholder="Officer name or department"
                value={form.assigned_to ?? ""} onChange={(e) => setField("assigned_to", e.target.value)} />
            </div>

            {mode === "edit" && (
              <div>
                <p className="text-xs text-slate-500 mb-2">Quick status</p>
                <div className="flex gap-2 flex-wrap">
                  {[
                    { label: "Resolved",    cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
                    { label: "In Progress", cls: "bg-blue-50 text-blue-700 border-blue-200" },
                    { label: "Escalated",   cls: "bg-red-50 text-red-700 border-red-200" },
                    { label: "Pending",     cls: "bg-yellow-50 text-yellow-700 border-yellow-200" },
                  ].map((b) => (
                    <button key={b.label} onClick={() => setField("status", b.label)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
                        ${form.status === b.label ? "ring-2 ring-orange-400 shadow-sm" : "opacity-70 hover:opacity-100"}
                        ${b.cls}`}>
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button variant="outline" className="flex-1" onClick={closeDialog}>{t("btn_cancel")}</Button>
              <Button disabled={saving || !form.citizen?.trim() || !form.issue?.trim()} onClick={saveComplaint}
                className="flex-1 bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90">
                {saving ? t("saving") : mode === "add" ? "Create Complaint" : "Save Changes"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── VIEW DIALOG ── */}
      <Dialog open={mode === "view"} onOpenChange={closeDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Complaint Details</DialogTitle>
            <DialogDescription>{selected?.id}</DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: "Citizen",     value: selected.citizen },
                  { label: "Phone",       value: selected.phone || "—" },
                  { label: "Category",    value: selected.category },
                  { label: "Language",    value: selected.language },
                  { label: "Department",  value: selected.department },
                  { label: "Assigned To", value: selected.assigned_to || "—" },
                  { label: "Created",     value: new Date(selected.created_at).toLocaleString("en-IN") },
                  { label: "Sentiment",   value: selected.sentiment },
                ].map((f) => (
                  <div key={f.label}>
                    <p className="text-xs text-slate-400">{f.label}</p>
                    <p className="font-medium text-sm mt-0.5 capitalize">{f.value}</p>
                  </div>
                ))}
                <div className="col-span-2">
                  <p className="text-xs text-slate-400">Issue</p>
                  <p className="font-medium text-sm mt-0.5 leading-relaxed">{selected.issue}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Badge variant="outline" className={`${STATUS_COLOR[selected.status] ?? ""}`}>
                  {selected.status}
                </Badge>
                <Badge variant="outline" className={`${PRIORITY_COLOR[selected.priority] ?? ""}`}>
                  {selected.priority}
                </Badge>
              </div>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" onClick={() => { closeDialog(); openEdit(selected); }}>
                  <Edit3 className="w-4 h-4 mr-2" /> Edit Complaint
                </Button>
                {(selected.status === "Resolved" || selected.status === "Escalated") && (
                  <Button variant="outline" className="flex-1 text-orange-600 border-orange-200 hover:bg-orange-50"
                    onClick={() => { closeDialog(); setFeedbackTarget(selected); }}>
                    <MessageSquare className="w-4 h-4 mr-2" /> Request Feedback
                  </Button>
                )}
                <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => { closeDialog(); openDelete(selected); }}>
                  <Trash2 className="w-4 h-4 mr-2" /> Delete
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── DELETE DIALOG ── */}
      <Dialog open={mode === "delete"} onOpenChange={closeDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Complaint?</DialogTitle>
            <DialogDescription>
              <span className="font-medium">{selected?.id}</span> — {selected?.citizen}
              <br />This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={closeDialog}>{t("btn_cancel")}</Button>
            <Button variant="destructive" className="flex-1" disabled={deleting} onClick={deleteComplaint}>
              {deleting ? "Deleting…" : t("btn_delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ── FEEDBACK REQUEST DIALOG ── */}
      <FeedbackRequestDialog
        complaint={feedbackTarget}
        onClose={() => setFeedbackTarget(null)}
        onSent={load}
      />
    </div>
  );
}
