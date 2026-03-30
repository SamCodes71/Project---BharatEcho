// pages/surveys.tsx
import { useState, useEffect, useRef } from "react";
import {
  ClipboardList, Plus, Trash2, BarChart3, Users,
  CheckCircle2, XCircle, ChevronRight, ArrowLeft,
  Send, RefreshCw, Eye, MoreVertical, Lock,
  Phone, Upload, Filter, AlertCircle, X, CheckCheck,
  PhoneCall, Building, Zap, Droplet
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "../components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "../components/ui/dropdown-menu";

import { useLang } from "@/lib/LanguageContext";
import { apiGet, apiPost, apiPatch, apiDelete, apiFetch, API } from "@/lib/fetch";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Question {
  id: string;
  text: string;
  type: "rating" | "yesno" | "text" | "mcq";
  options: string[];
}

interface Survey {
  id: string;
  title: string;
  description: string;
  target: "department" | "scheme" | "general";
  target_name: string;
  questions: Question[];
  created_by: string;
  status: "active" | "closed";
  created_at: string;
  response_count: number;
}

interface SurveyStats {
  total: number;
  active: number;
  closed: number;
  total_responses: number;
  surveys: Survey[];
}

interface Complaint {
  id: string;
  citizen: string;
  phone: string;
  category: string;
  department: string;
  status: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const TARGET_LABELS: Record<string, string> = {
  department: "Government Department",
  scheme: "Government Scheme",
  general: "General / Other",
};

const Q_TYPE_LABELS: Record<string, string> = {
  rating: "⭐ Rating (1–5)",
  yesno:  "✅ Yes / No",
  text:   "💬 Open Text",
  mcq:    "📋 Multiple Choice",
};

const DEPT_CATEGORIES: Record<string, string> = {
  "Electricity Board": "electricity",
  "Water Department": "water",
  "Highway Department": "road",
  "Municipal Corporation": "sanitation",
};

function uid() { return Math.random().toString(36).slice(2, 8).toUpperCase(); }

function CategoryIcon({ cat }: { cat: string }) {
  const cls = "w-3.5 h-3.5 flex-shrink-0";
  if (cat === "electricity") return <Zap className={`${cls} text-yellow-500`} />;
  if (cat === "water")       return <Droplet className={`${cls} text-blue-500`} />;
  if (cat === "road")        return <Building className={`${cls} text-purple-500`} />;
  return <AlertCircle className={`${cls} text-slate-400`} />;
}

// ── Dispatch Calls Dialog ─────────────────────────────────────────────────────
// Lets the admin choose HOW to target recipients for survey calls:
//   1. Upload a CSV/TXT file of phone numbers
//   2. Filter by complaint department/category
//   3. Select individual resolved complaints

function DispatchCallsDialog({
  survey,
  open,
  onClose,
}: {
  survey: Survey | null;
  open: boolean;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<"upload" | "department" | "complaints" | null>(null);

  // Upload mode
  const [uploadedNumbers, setUploadedNumbers] = useState<string[]>([]);
  const [uploadError, setUploadError]         = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Department mode
  const [selectedDept, setSelectedDept]       = useState("");
  const [deptComplaints, setDeptComplaints]   = useState<Complaint[]>([]);
  const [loadingDept, setLoadingDept]         = useState(false);

  // Complaints mode
  const [allComplaints, setAllComplaints]     = useState<Complaint[]>([]);
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [loadingComp, setLoadingComp]         = useState(false);
  const [compFilter, setCompFilter]           = useState("");

  // Dispatch state
  const [dispatching, setDispatching]         = useState(false);
  const [dispatchResult, setDispatchResult]   = useState<{ sent: number; failed: number } | null>(null);

  const reset = () => {
    setMode(null);
    setUploadedNumbers([]); setUploadError("");
    setSelectedDept(""); setDeptComplaints([]);
    setAllComplaints([]); setSelectedIds(new Set()); setCompFilter("");
    setDispatching(false); setDispatchResult(null);
  };

  const close = () => { reset(); onClose(); };

  // ── Load complaints when mode = "complaints" ──────────────────────────────
  useEffect(() => {
    if (mode === "complaints" && allComplaints.length === 0) {
      setLoadingComp(true);
      apiGet("/api/complaints")
        .then((data: Complaint[]) => {
          // Only show complaints with phone numbers
          setAllComplaints(data.filter((c) => c.phone && c.phone !== "Unknown"));
        })
        .catch(() => {})
        .finally(() => setLoadingComp(false));
    }
  }, [mode]);

  // ── Load dept complaints ──────────────────────────────────────────────────
  useEffect(() => {
    if (mode === "department" && selectedDept) {
      setLoadingDept(true);
      apiGet("/api/complaints")
        .then((data: Complaint[]) => {
          const cat = DEPT_CATEGORIES[selectedDept] ?? selectedDept.toLowerCase();
          setDeptComplaints(
            data.filter(
              (c) => (c.department === selectedDept || c.category === cat)
                && c.phone && c.phone !== "Unknown"
            )
          );
        })
        .catch(() => {})
        .finally(() => setLoadingDept(false));
    }
  }, [mode, selectedDept]);

  // ── Parse uploaded file ───────────────────────────────────────────────────
  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadError("");
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      // Accept CSV (first column) or plain text (one number per line)
      const lines = text.split(/[\n,;]+/).map((l) => l.trim()).filter(Boolean);
      const phones = lines
        .map((l) => l.replace(/[^+\d]/g, ""))
        .filter((l) => l.length >= 8);
      if (phones.length === 0) {
        setUploadError("No valid phone numbers found. Use one number per line or a CSV.");
        return;
      }
      setUploadedNumbers(phones);
    };
    reader.readAsText(file);
    // Reset input so same file can be re-selected
    e.target.value = "";
  };

  // ── Dispatch ──────────────────────────────────────────────────────────────
  const getTargetNumbers = (): string[] => {
    if (mode === "upload") return uploadedNumbers;
    if (mode === "department") return deptComplaints.map((c) => c.phone).filter(Boolean);
    if (mode === "complaints") {
      return allComplaints
        .filter((c) => selectedIds.has(c.id))
        .map((c) => c.phone)
        .filter(Boolean);
    }
    return [];
  };

  const dispatch = async () => {
    if (!survey) return;
    const numbers = getTargetNumbers();
    if (numbers.length === 0) return;

    setDispatching(true);
    let sent = 0, failed = 0;

    for (const phone of numbers) {
      try {
        // Create a feedback entry which auto-triggers an outbound call via make_feedback_call
        await apiPost("/api/feedback", {
          citizen:      "Survey Recipient",
          phone,
          complaint_id: survey.id,
          service:      survey.title,
        });
        sent++;
      } catch {
        failed++;
      }
    }
    setDispatchResult({ sent, failed });
    setDispatching(false);
  };

  const targetNumbers = getTargetNumbers();
  const canDispatch   = targetNumbers.length > 0 && !dispatching && !dispatchResult;

  if (!survey) return null;

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PhoneCall className="w-4 h-4 text-orange-500" />
            Dispatch Survey Calls
          </DialogTitle>
          <DialogDescription>
            Automatically call citizens to collect responses for: <strong>{survey.title}</strong>
          </DialogDescription>
        </DialogHeader>

        {/* Success state */}
        {dispatchResult && (
          <div className="flex flex-col items-center gap-3 py-6">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <CheckCheck className="w-7 h-7 text-green-600" />
            </div>
            <p className="text-lg font-semibold text-slate-800">Calls Dispatched!</p>
            <div className="flex gap-6 text-sm">
              <span className="text-green-600 font-medium">{dispatchResult.sent} scheduled</span>
              {dispatchResult.failed > 0 && (
                <span className="text-red-500">{dispatchResult.failed} failed</span>
              )}
            </div>
            <p className="text-xs text-slate-400 text-center max-w-sm">
              Each recipient will receive an automated call. Ratings will appear in the Feedback page.
            </p>
            <Button onClick={close} variant="outline" className="mt-2">Done</Button>
          </div>
        )}

        {!dispatchResult && (
          <div className="space-y-5">
            {/* Mode selector */}
            <div>
              <p className="text-sm font-medium text-slate-700 mb-2">Choose recipients</p>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: "upload",      icon: <Upload className="w-4 h-4" />,    label: "Upload File",         sub: "CSV or TXT"              },
                  { key: "department",  icon: <Filter className="w-4 h-4" />,    label: "By Department",       sub: "Filter complaints"       },
                  { key: "complaints",  icon: <ClipboardList className="w-4 h-4" />, label: "Select Complaints", sub: "Pick individually"   },
                ] as const).map((opt) => (
                  <button key={opt.key} onClick={() => setMode(opt.key)}
                    className={`p-3 rounded-xl border text-left transition-all
                      ${mode === opt.key
                        ? "border-orange-400 bg-orange-50"
                        : "border-slate-200 hover:border-slate-300"}`}>
                    <div className={`mb-1.5 ${mode === opt.key ? "text-orange-600" : "text-slate-400"}`}>
                      {opt.icon}
                    </div>
                    <p className={`text-xs font-semibold ${mode === opt.key ? "text-orange-700" : "text-slate-700"}`}>
                      {opt.label}
                    </p>
                    <p className="text-xs text-slate-400">{opt.sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* ── Upload mode ── */}
            {mode === "upload" && (
              <div className="space-y-3">
                <div
                  onClick={() => fileRef.current?.click()}
                  className="border-2 border-dashed border-slate-200 hover:border-orange-300 rounded-xl p-6 text-center cursor-pointer transition-colors">
                  <Upload className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-600">Click to upload a file</p>
                  <p className="text-xs text-slate-400 mt-1">
                    CSV (first column = phone) or TXT (one number per line)
                  </p>
                  <input ref={fileRef} type="file" accept=".csv,.txt,.tsv" className="hidden" onChange={handleFile} />
                </div>
                {uploadError && (
                  <p className="text-xs text-red-500 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" /> {uploadError}
                  </p>
                )}
                {uploadedNumbers.length > 0 && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-green-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" />
                      {uploadedNumbers.length} phone number{uploadedNumbers.length !== 1 ? "s" : ""} loaded
                    </p>
                    <div className="mt-2 max-h-24 overflow-y-auto space-y-1">
                      {uploadedNumbers.slice(0, 8).map((n, i) => (
                        <p key={i} className="text-xs text-green-600 font-mono">{n}</p>
                      ))}
                      {uploadedNumbers.length > 8 && (
                        <p className="text-xs text-green-500">…and {uploadedNumbers.length - 8} more</p>
                      )}
                    </div>
                    <button onClick={() => { setUploadedNumbers([]); setUploadError(""); }}
                      className="text-xs text-red-400 hover:text-red-600 mt-2 flex items-center gap-1">
                      <X className="w-3 h-3" /> Clear
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Department mode ── */}
            {mode === "department" && (
              <div className="space-y-3">
                <div>
                  <label className="text-sm font-medium text-slate-700">Select Department</label>
                  <select value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                    <option value="">— Choose a department —</option>
                    {Object.keys(DEPT_CATEGORIES).map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                    <option value="General Administration">General Administration</option>
                  </select>
                </div>
                {loadingDept && (
                  <p className="text-xs text-slate-400 animate-pulse">Loading complaints…</p>
                )}
                {!loadingDept && selectedDept && deptComplaints.length === 0 && (
                  <p className="text-xs text-slate-400">
                    No complaints with phone numbers found for this department.
                  </p>
                )}
                {deptComplaints.length > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm font-medium text-blue-700">
                      {deptComplaints.length} citizen{deptComplaints.length !== 1 ? "s" : ""} will be called
                    </p>
                    <div className="mt-2 max-h-28 overflow-y-auto space-y-1.5">
                      {deptComplaints.slice(0, 6).map((c) => (
                        <div key={c.id} className="flex items-center justify-between text-xs">
                          <span className="text-slate-700 font-medium">{c.citizen}</span>
                          <span className="text-slate-500 font-mono">{c.phone}</span>
                        </div>
                      ))}
                      {deptComplaints.length > 6 && (
                        <p className="text-xs text-blue-500">…and {deptComplaints.length - 6} more</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ── Complaints mode ── */}
            {mode === "complaints" && (
              <div className="space-y-3">
                <div className="relative">
                  <ClipboardList className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <Input
                    className="pl-9 h-9 text-sm"
                    placeholder="Search by citizen name, ID, category…"
                    value={compFilter}
                    onChange={(e) => setCompFilter(e.target.value)}
                  />
                </div>
                {loadingComp ? (
                  <p className="text-xs text-slate-400 animate-pulse">Loading complaints…</p>
                ) : (
                  <div className="border border-slate-200 rounded-lg max-h-64 overflow-y-auto divide-y divide-slate-50">
                    {allComplaints
                      .filter((c) => {
                        const q = compFilter.toLowerCase();
                        return !q || [c.id, c.citizen, c.category, c.department]
                          .some((v) => v?.toLowerCase().includes(q));
                      })
                      .map((c) => (
                        <label key={c.id}
                          className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(c.id)}
                            onChange={(e) => {
                              setSelectedIds((prev) => {
                                const next = new Set(prev);
                                e.target.checked ? next.add(c.id) : next.delete(c.id);
                                return next;
                              });
                            }}
                            className="rounded border-slate-300 text-orange-500 focus:ring-orange-300"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <CategoryIcon cat={c.category} />
                              <span className="text-sm font-medium text-slate-800">{c.citizen}</span>
                              <span className="font-mono text-xs text-slate-400">{c.id}</span>
                            </div>
                            <p className="text-xs text-slate-500 mt-0.5">{c.department || c.category}</p>
                          </div>
                          <span className="text-xs text-slate-500 font-mono flex-shrink-0">{c.phone}</span>
                        </label>
                      ))}
                    {allComplaints.length === 0 && (
                      <p className="text-xs text-slate-400 text-center py-8">
                        No complaints with phone numbers found.
                      </p>
                    )}
                  </div>
                )}
                {selectedIds.size > 0 && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-orange-600 font-medium">
                      {selectedIds.size} complaint{selectedIds.size !== 1 ? "s" : ""} selected
                    </span>
                    <button onClick={() => setSelectedIds(new Set())}
                      className="text-slate-400 hover:text-red-500 flex items-center gap-1">
                      <X className="w-3 h-3" /> Clear selection
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Dispatch summary + button */}
            {mode && targetNumbers.length > 0 && (
              <div className="bg-slate-50 rounded-xl p-4 flex items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {targetNumbers.length} call{targetNumbers.length !== 1 ? "s" : ""} will be placed
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Each recipient will be asked to rate the service on a 1–5 scale.
                  </p>
                </div>
                <Button
                  className="bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90 gap-1.5 flex-shrink-0"
                  disabled={!canDispatch}
                  onClick={dispatch}
                >
                  {dispatching ? (
                    <><RefreshCw className="w-4 h-4 animate-spin" /> Calling…</>
                  ) : (
                    <><Phone className="w-4 h-4" /> Dispatch Calls</>
                  )}
                </Button>
              </div>
            )}

            {mode && targetNumbers.length === 0 && mode !== null && (
              <p className="text-xs text-slate-400 text-center py-2">
                {mode === "upload" && "Upload a file above to see recipients."}
                {mode === "department" && "Select a department above to see recipients."}
                {mode === "complaints" && "Check one or more complaints above."}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Create Survey Wizard ──────────────────────────────────────────────────────

function CreateSurveyDialog({
  open, onClose, onCreated,
  departments, schemes,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  departments: string[];
  schemes: string[];
}) {
  const [step, setStep]             = useState(1);
  const [title, setTitle]           = useState("");
  const [desc, setDesc]             = useState("");
  const [target, setTarget]         = useState<"department"|"scheme"|"general">("department");
  const [targetName, setTargetName] = useState("");
  const [customTarget, setCustomTarget] = useState("");
  const [questions, setQuestions]   = useState<Question[]>([]);
  const [saving, setSaving]         = useState(false);

  const reset = () => {
    setStep(1); setTitle(""); setDesc(""); setTarget("department");
    setTargetName(""); setCustomTarget(""); setQuestions([]);
  };
  const close = () => { reset(); onClose(); };

  const addQuestion = () => {
    setQuestions((prev) => [...prev, { id: uid(), text: "", type: "rating", options: [] }]);
  };

  const updateQ = (idx: number, patch: Partial<Question>) =>
    setQuestions((prev) => prev.map((q, i) => i === idx ? { ...q, ...patch } : q));

  const removeQ = (idx: number) =>
    setQuestions((prev) => prev.filter((_, i) => i !== idx));

  const addOption = (idx: number) =>
    setQuestions((prev) => prev.map((q, i) =>
      i === idx ? { ...q, options: [...q.options, ""] } : q));

  const updateOption = (qIdx: number, oIdx: number, val: string) =>
    setQuestions((prev) => prev.map((q, i) =>
      i === qIdx ? { ...q, options: q.options.map((o, j) => j === oIdx ? val : o) } : q));

  const removeOption = (qIdx: number, oIdx: number) =>
    setQuestions((prev) => prev.map((q, i) =>
      i === qIdx ? { ...q, options: q.options.filter((_, j) => j !== oIdx) } : q));

  const finalTarget = targetName === "Other" ? customTarget : targetName;
  const canProceed1 = title.trim() && (target === "general" || (targetName && (targetName !== "Other" || customTarget.trim())));
  const canProceed2 = questions.length > 0 && questions.every((q) =>
    q.text.trim() && (q.type !== "mcq" || q.options.filter(Boolean).length >= 2));

  const submit = async () => {
    setSaving(true);
    try {
      await apiPost('/api/surveys', {
        title, description: desc,
        target, target_name: target === "general" ? "General Public" : finalTarget,
        questions, created_by: "Admin",
      });
      close();
      onCreated();
    } finally { setSaving(false); }
  };

  const targetList = target === "department" ? departments : target === "scheme" ? schemes : [];

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="w-4 h-4" /> Create New Survey
            <span className="ml-auto text-xs text-slate-400 font-normal">Step {step} of 2</span>
          </DialogTitle>
          <DialogDescription>Build a survey for citizens about government services</DialogDescription>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          {[1, 2].map((s) => (
            <div key={s} className={`h-1 flex-1 rounded-full transition-colors
              ${s <= step ? "bg-gradient-to-r from-orange-500 to-green-600" : "bg-slate-100"}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="space-y-5">
            <div>
              <label className="text-sm font-medium text-slate-700">Survey Title *</label>
              <Input className="mt-1" placeholder="e.g. Water Supply Satisfaction Survey Q1 2025"
                value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Description</label>
              <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)}
                placeholder="Brief purpose of this survey…"
                className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-orange-300" />
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Survey Target *</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {(["department", "scheme", "general"] as const).map((t) => (
                  <button key={t} onClick={() => { setTarget(t); setTargetName(""); }}
                    className={`p-3 rounded-xl border text-xs font-medium text-center transition-all
                      ${target === t
                        ? "border-orange-400 bg-orange-50 text-orange-700"
                        : "border-slate-200 hover:border-slate-300 text-slate-600"}`}>
                    {TARGET_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            {target !== "general" && (
              <div>
                <label className="text-sm font-medium text-slate-700">
                  Select {target === "department" ? "Department" : "Scheme"} *
                </label>
                <select value={targetName} onChange={(e) => setTargetName(e.target.value)}
                  className="mt-1 w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                  <option value="">— Choose one —</option>
                  {targetList.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
                {targetName === "Other" && (
                  <Input className="mt-2" placeholder="Specify name…"
                    value={customTarget} onChange={(e) => setCustomTarget(e.target.value)} />
                )}
              </div>
            )}

            <Button onClick={() => setStep(2)} disabled={!canProceed1}
              className="w-full bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90 gap-1">
              Next: Add Questions <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <button onClick={() => setStep(1)}
              className="text-sm text-slate-500 hover:text-slate-700 flex items-center gap-1">
              <ArrowLeft className="w-3.5 h-3.5" /> Back
            </button>

            <div className="space-y-4 max-h-96 overflow-y-auto pr-1">
              {questions.map((q, idx) => (
                <div key={q.id} className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-start gap-2">
                    <span className="text-xs font-bold text-slate-400 mt-2.5 w-5 flex-shrink-0">Q{idx + 1}</span>
                    <div className="flex-1 space-y-2">
                      <Input placeholder="Question text *" value={q.text}
                        onChange={(e) => updateQ(idx, { text: e.target.value })} />
                      <select value={q.type}
                        onChange={(e) => updateQ(idx, { type: e.target.value as Question["type"], options: [] })}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300">
                        {Object.entries(Q_TYPE_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>

                      {q.type === "mcq" && (
                        <div className="space-y-2">
                          {q.options.map((opt, oIdx) => (
                            <div key={oIdx} className="flex gap-2">
                              <Input placeholder={`Option ${oIdx + 1}`} value={opt}
                                onChange={(e) => updateOption(idx, oIdx, e.target.value)}
                                className="text-sm" />
                              <button onClick={() => removeOption(idx, oIdx)} className="text-red-400 hover:text-red-600">
                                <XCircle className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                          <button onClick={() => addOption(idx)}
                            className="text-xs text-orange-600 hover:text-orange-700 font-medium flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Add option
                          </button>
                        </div>
                      )}
                    </div>
                    <button onClick={() => removeQ(idx)} className="text-red-400 hover:text-red-600 mt-1">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {questions.length === 0 && (
                <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed border-slate-200 rounded-xl">
                  No questions yet. Add your first question below.
                </div>
              )}
            </div>

            <Button variant="outline" onClick={addQuestion} className="w-full gap-1 border-dashed">
              <Plus className="w-4 h-4" /> Add Question
            </Button>
            <Button onClick={submit} disabled={!canProceed2 || saving}
              className="w-full bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90">
              {saving ? "Creating…" : "Create Survey"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Survey Detail / Responses ─────────────────────────────────────────────────

function SurveyDetailDialog({ surveyId, onClose }: { surveyId: string; onClose: () => void }) {
  const [survey, setSurvey]   = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!surveyId) return;
    setLoading(true);
    setSurvey(null);
    apiGet(`/api/surveys/${surveyId}`)
      .then((d) => { setSurvey(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [surveyId]);

  if (!surveyId) return null;

  return (
    <Dialog open={!!surveyId} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{survey?.title ?? "Loading…"}</DialogTitle>
          <DialogDescription>
            {survey?.target_name} · {survey?.response_count ?? 0} responses
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <div className="text-center py-10 text-slate-400 text-sm">Loading…</div>
        ) : (
          <div className="space-y-5">
            {survey.description && (
              <p className="text-sm text-slate-500">{survey.description}</p>
            )}
            <div className="space-y-4">
              {survey.questions.map((q: Question, idx: number) => {
                const answers = (survey.responses ?? []).map((r: any) =>
                  r.answers.find((a: any) => a.question_id === q.id)?.answer
                ).filter(Boolean);

                return (
                  <div key={q.id} className="border border-slate-100 rounded-xl p-4">
                    <p className="font-medium text-sm mb-2">
                      Q{idx + 1}. {q.text}
                      <span className="ml-2 text-xs text-slate-400 font-normal">{Q_TYPE_LABELS[q.type]}</span>
                    </p>
                    {answers.length === 0 ? (
                      <p className="text-xs text-slate-400">No responses yet</p>
                    ) : q.type === "rating" ? (
                      <p className="text-lg font-bold text-amber-500">
                        {(answers.reduce((a: number, b: any) => a + Number(b), 0) / answers.length).toFixed(1)}
                        <span className="text-sm font-normal text-slate-400"> / 5 avg ({answers.length} responses)</span>
                      </p>
                    ) : q.type === "yesno" ? (
                      <div className="flex gap-4 text-sm">
                        <span className="text-emerald-600 font-medium">Yes: {answers.filter((a: any) => a === "yes").length}</span>
                        <span className="text-red-500 font-medium">No: {answers.filter((a: any) => a === "no").length}</span>
                      </div>
                    ) : q.type === "mcq" ? (
                      <div className="space-y-1.5">
                        {q.options.map((opt) => {
                          const count = answers.filter((a: any) => a === opt).length;
                          const pct = Math.round((count / answers.length) * 100);
                          return (
                            <div key={opt} className="flex items-center gap-2 text-sm">
                              <span className="w-32 truncate text-slate-600">{opt}</span>
                              <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                                <div className="h-full bg-orange-400 rounded-full" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="w-12 text-right text-slate-500 text-xs">{count} ({pct}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {answers.map((a: any, i: number) => (
                          <p key={i} className="text-xs text-slate-600 bg-slate-50 rounded px-2 py-1">"{a}"</p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export function Surveys() {
  const { t } = useLang();
  const [data, setData]             = useState<SurveyStats | null>(null);
  const [loading, setLoading]       = useState(true);
  const [departments, setDepts]     = useState<string[]>([]);
  const [schemes, setSchemes]       = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [viewId, setViewId]         = useState("");
  const [deleteTarget, setDeleteTarget] = useState("");
  const [deleting, setDeleting]     = useState(false);
  const [closing, setClosing]       = useState("");

  // Dispatch dialog
  const [dispatchSurvey, setDispatchSurvey] = useState<Survey | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [s, m] = await Promise.all([
        apiGet('/api/surveys'),
        apiGet('/api/surveys/meta'),
      ]);
      setData(s);
      setDepts(m.departments ?? []);
      setSchemes(m.schemes ?? []);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const deleteSurvey = async () => {
    setDeleting(true);
    try {
      await apiDelete(`/api/surveys/${deleteTarget}`);
      setDeleteTarget("");
      await load();
    } finally { setDeleting(false); }
  };

  const closeSurvey = async (id: string) => {
    setClosing(id);
    try {
      await apiPost(`/api/surveys/${id}/close`);
      await load();
    } finally { setClosing(""); }
  };

  const targetBadge = (s: Survey) => {
    const colors: Record<string, string> = {
      department: "bg-blue-50 text-blue-700 border-blue-200",
      scheme:     "bg-purple-50 text-purple-700 border-purple-200",
      general:    "bg-slate-50 text-slate-600 border-slate-200",
    };
    return (
      <Badge variant="outline" className={`text-xs ${colors[s.target] ?? ""}`}>
        {s.target_name || TARGET_LABELS[s.target]}
      </Badge>
    );
  };

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Total Surveys",   value: data?.total ?? 0,           color: "text-slate-900"   },
          { label: "Active",          value: data?.active ?? 0,          color: "text-emerald-600" },
          { label: "Closed",          value: data?.closed ?? 0,          color: "text-slate-500"   },
          { label: "Total Responses", value: data?.total_responses ?? 0, color: "text-orange-600"  },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-6">
              <p className="text-sm text-slate-500">{s.label}</p>
              <p className={`text-3xl font-bold mt-1 ${s.color}`}>{s.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t("surveys_title")}</h2>
          <p className="text-sm text-slate-400">
            Multi-question surveys targeting government departments, schemes, or general public
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={load} className="gap-1">
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}
            className="gap-1 bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90">
            <Plus className="w-3.5 h-3.5" />{t("create_survey")}
          </Button>
        </div>
      </div>

      {/* Survey list */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-16 text-slate-400 text-sm">{t("loading")}</div>
          ) : !data?.surveys?.length ? (
            <div className="text-center py-16">
              <ClipboardList className="w-12 h-12 text-slate-200 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-400">No surveys yet</p>
              <p className="text-xs text-slate-300 mt-1">
                Create a survey to collect feedback from citizens about any government department or scheme.
              </p>
              <Button size="sm" onClick={() => setCreateOpen(true)}
                className="mt-4 gap-1 bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90">
                <Plus className="w-3.5 h-3.5" />{t("create_survey")}
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-50">
              {data.surveys.map((s) => (
                <div key={s.id} className="flex items-start gap-4 px-5 py-4 hover:bg-slate-50/50 transition-colors">
                  {/* Icon */}
                  <div className={`w-10 h-10 rounded-xl flex-shrink-0 flex items-center justify-center
                    ${s.status === "active" ? "bg-orange-50" : "bg-slate-100"}`}>
                    <ClipboardList className={`w-5 h-5 ${s.status === "active" ? "text-orange-500" : "text-slate-400"}`} />
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="font-medium text-sm text-slate-900">{s.title}</p>
                      <Badge variant="outline"
                        className={s.status === "active"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 text-xs"
                          : "bg-slate-50 text-slate-500 text-xs"}>
                        {s.status}
                      </Badge>
                      {targetBadge(s)}
                    </div>
                    {s.description && (
                      <p className="text-xs text-slate-500 truncate">{s.description}</p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-slate-400">
                      <span>{s.questions.length} question{s.questions.length !== 1 ? "s" : ""}</span>
                      <span>·</span>
                      <span className="flex items-center gap-1">
                        <Users className="w-3 h-3" /> {s.response_count} response{s.response_count !== 1 ? "s" : ""}
                      </span>
                      <span>·</span>
                      <span>{new Date(s.created_at).toLocaleDateString("en-IN")}</span>
                    </div>
                  </div>

                  {/* Dispatch button — only for active surveys */}
                  {s.status === "active" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="flex-shrink-0 gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50"
                      onClick={() => setDispatchSurvey(s)}
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      Call Citizens
                    </Button>
                  )}

                  {/* Actions dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button className="w-8 h-8 rounded-lg hover:bg-slate-100 flex items-center justify-center flex-shrink-0">
                        <MoreVertical className="w-4 h-4 text-slate-400" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => setViewId(s.id)}>
                        <Eye className="w-3.5 h-3.5 mr-2" /> View Responses
                      </DropdownMenuItem>
                      {s.status === "active" && (
                        <>
                          <DropdownMenuItem onClick={() => setDispatchSurvey(s)}>
                            <PhoneCall className="w-3.5 h-3.5 mr-2" /> Dispatch Calls
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => closeSurvey(s.id)} disabled={closing === s.id}>
                            <Lock className="w-3.5 h-3.5 mr-2" />
                            {closing === s.id ? "Closing…" : "Close Survey"}
                          </DropdownMenuItem>
                        </>
                      )}
                      <DropdownMenuItem className="text-red-600 focus:text-red-600"
                        onClick={() => setDeleteTarget(s.id)}>
                        <Trash2 className="w-3.5 h-3.5 mr-2" /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <CreateSurveyDialog
        open={createOpen} onClose={() => setCreateOpen(false)}
        onCreated={load} departments={departments} schemes={schemes} />

      <SurveyDetailDialog surveyId={viewId} onClose={() => setViewId("")} />

      <DispatchCallsDialog
        survey={dispatchSurvey}
        open={!!dispatchSurvey}
        onClose={() => setDispatchSurvey(null)}
      />

      <Dialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget("")}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Delete Survey?</DialogTitle>
            <DialogDescription>
              This will delete the survey and all its responses permanently.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2 pt-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteTarget("")}>{t("btn_cancel")}</Button>
            <Button variant="destructive" className="flex-1" disabled={deleting} onClick={deleteSurvey}>
              {deleting ? "Deleting…" : t("btn_delete")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
