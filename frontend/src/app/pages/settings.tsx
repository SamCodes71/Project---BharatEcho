// pages/settings.tsx
import { useState, useEffect } from "react";
import {
  Save, RefreshCw, Phone, Globe, Bell,
  Clock, Mic, CheckCircle, AlertTriangle, Languages
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { apiGet, apiPost } from "@/lib/fetch";
import { useLang } from "@/lib/LanguageContext";

interface Settings {
  auto_followup_days:      number;
  escalation_threshold:    string;
  default_language:        string;
  tts_language:            string;
  ui_language:             string;
  notifications_enabled:   boolean;
  survey_after_resolution: boolean;
  working_hours_start:     string;
  working_hours_end:       string;
  max_call_duration:       number;
  twilio_phone:            string;
  ngrok_url:               string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none
        ${value ? "bg-gradient-to-r from-orange-500 to-green-600" : "bg-slate-200"}`}
    >
      <span
        className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200
          ${value ? "translate-x-5" : "translate-x-0"}`}
      />
    </button>
  );
}

function Section({ icon, title, description, children }: {
  icon: React.ReactNode; title: string; description: string; children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">{icon} {title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">{children}</CardContent>
    </Card>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex-1">
        <p className="text-sm font-medium text-slate-700">{label}</p>
        {hint && <p className="text-xs text-slate-400 mt-0.5">{hint}</p>}
      </div>
      <div className="flex-shrink-0">{children}</div>
    </div>
  );
}

const SELECT_CLS = "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-orange-300";

export function Settings() {
  const { t, lang, setLang } = useLang();

  const [settings,  setSettings]  = useState<Settings | null>(null);
  const [draft,     setDraft]     = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loading,   setLoading]   = useState(true);

  const load = async () => {
    try {
      const data = await apiGet<Settings>("/api/settings");
      // Ensure ui_language always has a value
      if (!data.ui_language) data.ui_language = "English";
      setSettings(data);
      setDraft(data);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const set = (key: keyof Settings, value: any) =>
    setDraft((prev) => prev ? { ...prev, [key]: value } : prev);

  const isDirty = JSON.stringify(settings) !== JSON.stringify(draft);

  const save = async () => {
    if (!draft) return;
    setSaveState("saving");
    try {
      await apiPost("/api/settings", { updates: draft });
      setSettings({ ...draft });
      setSaveState("saved");
      // Apply UI language change immediately
      const newLang = draft.ui_language === "Hindi" ? "hi" : "en";
      if (newLang !== lang) setLang(newLang);
      setTimeout(() => setSaveState("idle"), 2500);
    } catch {
      setSaveState("error");
      setTimeout(() => setSaveState("idle"), 3000);
    }
  };

  const reset = () => setDraft(settings ? { ...settings } : null);

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-slate-400 text-sm">
      {t("loading")}
    </div>
  );
  if (!draft) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Save bar */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">{t("settings_title")}</h2>
          <p className="text-sm text-slate-400">{t("settings_sub")}</p>
        </div>
        <div className="flex items-center gap-2">
          {isDirty && (
            <Button variant="outline" size="sm" onClick={reset} className="gap-1">
              <RefreshCw className="w-3.5 h-3.5" /> {t("reset")}
            </Button>
          )}
          <Button
            size="sm"
            onClick={save}
            disabled={!isDirty || saveState === "saving"}
            className={`gap-1 ${
              saveState === "saved"  ? "bg-emerald-600 hover:bg-emerald-700 text-white" :
              saveState === "error"  ? "bg-red-600 hover:bg-red-700 text-white" :
              "bg-gradient-to-r from-orange-500 to-green-600 text-white hover:opacity-90"
            }`}
          >
            {saveState === "saving" ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> {t("saving")}</> :
             saveState === "saved"  ? <><CheckCircle className="w-3.5 h-3.5" /> {t("saved")}</> :
             saveState === "error"  ? <><AlertTriangle className="w-3.5 h-3.5" /> Error</> :
             <><Save className="w-3.5 h-3.5" /> {t("save_changes")}</>}
          </Button>
        </div>
      </div>

      {isDirty && (
        <div className="flex items-center gap-2 text-xs text-amber-600 bg-amber-50 border border-amber-200 px-3 py-2 rounded-lg">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          {t("unsaved_changes")}
        </div>
      )}

      {/* Telephony */}
      <Section
        icon={<Phone className="w-4 h-4 text-green-600" />}
        title={t("telephony")}
        description={t("telephony_desc")}
      >
        <Field label={t("twilio_phone")} hint="+91XXXXXXXXXX">
          <Input value={draft.twilio_phone}
            onChange={(e) => set("twilio_phone", e.target.value)}
            placeholder="+91XXXXXXXXXX" className="w-48 text-sm" />
        </Field>
        <Field label={t("ngrok_url")} hint="https://xxx.ngrok-free.app">
          <Input value={draft.ngrok_url}
            onChange={(e) => set("ngrok_url", e.target.value)}
            placeholder="https://xxx.ngrok-free.app" className="w-64 text-sm" />
        </Field>
      </Section>

      {/* Language */}
      <Section
        icon={<Languages className="w-4 h-4 text-blue-600" />}
        title={t("lang_section")}
        description={t("lang_desc")}
      >
        {/* Dashboard UI language — the primary new control */}
        <Field label={t("ui_language")} hint={t("ui_language_hint")}>
          <div className="flex items-center gap-2">
            <select
              value={draft.ui_language}
              onChange={(e) => set("ui_language", e.target.value)}
              className={SELECT_CLS}
            >
              <option value="English">English</option>
              <option value="Hindi">हिन्दी (Hindi)</option>
            </select>
            {/* Live preview badge */}
            <span className={`text-xs px-2 py-1 rounded-full font-medium
              ${draft.ui_language === "Hindi"
                ? "bg-orange-100 text-orange-700"
                : "bg-blue-100 text-blue-700"}`}>
              {draft.ui_language === "Hindi" ? "हिन्दी" : "EN"}
            </span>
          </div>
        </Field>

        {/* Voice agent default language */}
        <Field label={t("default_lang")} hint={t("default_lang_hint")}>
          <select value={draft.default_language}
            onChange={(e) => set("default_language", e.target.value)}
            className={SELECT_CLS}>
            {["English", "Hindi", "Telugu", "Tamil", "Bengali",
              "Gujarati", "Marathi", "Kannada"].map((l) => (
              <option key={l}>{l}</option>
            ))}
          </select>
        </Field>

        <Field label={t("tts_code")} hint={t("tts_code_hint")}>
          <Input value={draft.tts_language}
            onChange={(e) => set("tts_language", e.target.value)}
            placeholder="en" className="w-24 text-sm" />
        </Field>
      </Section>

      {/* Call Behaviour */}
      <Section
        icon={<Mic className="w-4 h-4 text-purple-600" />}
        title={t("call_behaviour")}
        description={t("call_behaviour_desc")}
      >
        <Field label={t("max_duration")} hint="5–60">
          <Input type="number" value={draft.max_call_duration}
            onChange={(e) => set("max_call_duration", Number(e.target.value))}
            min={5} max={60} className="w-24 text-sm" />
        </Field>
        <Field label={t("auto_followup")} hint="1–30">
          <Input type="number" value={draft.auto_followup_days}
            onChange={(e) => set("auto_followup_days", Number(e.target.value))}
            min={1} max={30} className="w-24 text-sm" />
        </Field>
        <Field label={t("escalation")}>
          <select value={draft.escalation_threshold}
            onChange={(e) => set("escalation_threshold", e.target.value)}
            className={SELECT_CLS}>
            {["Angry", "Negative", "Neutral"].map((s) => <option key={s}>{s}</option>)}
          </select>
        </Field>
      </Section>

      {/* Working Hours */}
      <Section
        icon={<Clock className="w-4 h-4 text-orange-600" />}
        title={t("working_hours")}
        description={t("working_hours_desc")}
      >
        <Field label={t("start_time")}>
          <Input type="time" value={draft.working_hours_start}
            onChange={(e) => set("working_hours_start", e.target.value)}
            className="w-36 text-sm" />
        </Field>
        <Field label={t("end_time")}>
          <Input type="time" value={draft.working_hours_end}
            onChange={(e) => set("working_hours_end", e.target.value)}
            className="w-36 text-sm" />
        </Field>
      </Section>

      {/* Notifications & Surveys */}
      <Section
        icon={<Bell className="w-4 h-4 text-amber-600" />}
        title={t("notif_surveys")}
        description={t("notif_surveys_desc")}
      >
        <Field label={t("enable_notif")} hint={t("enable_notif_hint")}>
          <Toggle value={draft.notifications_enabled}
            onChange={(v) => set("notifications_enabled", v)} />
        </Field>
        <Field label={t("survey_after")} hint={t("survey_after_hint")}>
          <Toggle value={draft.survey_after_resolution}
            onChange={(v) => set("survey_after_resolution", v)} />
        </Field>
      </Section>
    </div>
  );
}
