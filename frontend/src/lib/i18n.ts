// src/lib/i18n.ts
// All UI strings in English and Hindi (Devanagari).
// Add keys here; consume via useI18n() hook anywhere in the app.

export type Lang = "en" | "hi";

export const translations = {
  // ── Navigation ──────────────────────────────────────────────────────────────
  nav_overview:      { en: "Overview",       hi: "अवलोकन" },
  nav_complaints:    { en: "Complaints",     hi: "शिकायतें" },
  nav_calls:         { en: "Calls",          hi: "कॉल" },
  nav_surveys:       { en: "Surveys",        hi: "सर्वेक्षण" },
  nav_feedback:      { en: "Feedback",       hi: "प्रतिक्रिया" },
  nav_analytics:     { en: "Analytics",      hi: "विश्लेषण" },
  nav_notifications: { en: "Notifications",  hi: "सूचनाएँ" },
  nav_settings:      { en: "Settings",       hi: "सेटिंग्स" },

  // ── Header ──────────────────────────────────────────────────────────────────
  header_title:      { en: "BharatEcho Intelligence Dashboard", hi: "BharatEcho नागरिक सेवा डैशबोर्ड" },
  version_badge:     { en: "🇮🇳 BharatEcho v1.0", hi: "🇮🇳 भारतEcho v1.0" },

  // ── Overview ────────────────────────────────────────────────────────────────
  live_connected:    { en: "Live data connected",     hi: "लाइव डेटा जुड़ा है" },
  live_connecting:   { en: "Connecting to backend…",  hi: "बैकएंड से जुड़ रहे हैं…" },
  total_calls:       { en: "Total Calls",             hi: "कुल कॉल" },
  active_calls:      { en: "Active Calls",            hi: "सक्रिय कॉल" },
  total_complaints:  { en: "Total Complaints",        hi: "कुल शिकायतें" },
  resolved:          { en: "Resolved",                hi: "हल हुईं" },
  pending:           { en: "Pending",                 hi: "लंबित" },
  in_progress:       { en: "In Progress",             hi: "प्रक्रिया में" },
  resolution_rate:   { en: "Resolution Rate",         hi: "समाधान दर" },
  recent_complaints: { en: "Recent Complaints",       hi: "हाल की शिकायतें" },
  recent_calls:      { en: "Recent Calls",            hi: "हाल के कॉल" },
  dept_breakdown:    { en: "Department Breakdown",    hi: "विभाग विवरण" },
  sentiment_dist:    { en: "Sentiment Distribution",  hi: "भावना वितरण" },

  // ── Complaints ──────────────────────────────────────────────────────────────
  complaints_title:  { en: "Complaints",              hi: "शिकायतें" },
  add_complaint:     { en: "Add Complaint",           hi: "शिकायत जोड़ें" },
  search_complaints: { en: "Search complaints…",      hi: "शिकायत खोजें…" },
  citizen:           { en: "Citizen",                 hi: "नागरिक" },
  category:          { en: "Category",                hi: "श्रेणी" },
  status:            { en: "Status",                  hi: "स्थिति" },
  priority:          { en: "Priority",                hi: "प्राथमिकता" },
  assigned_to:       { en: "Assigned To",             hi: "असाइन किया गया" },
  created:           { en: "Created",                 hi: "बनाई गई" },
  actions:           { en: "Actions",                 hi: "क्रियाएँ" },
  no_complaints:     { en: "No complaints found.",    hi: "कोई शिकायत नहीं मिली।" },

  // ── Status labels ────────────────────────────────────────────────────────────
  status_pending:    { en: "Pending",                 hi: "लंबित" },
  status_progress:   { en: "In Progress",             hi: "प्रक्रिया में" },
  status_resolved:   { en: "Resolved",                hi: "हल हुई" },
  status_escalated:  { en: "Escalated",               hi: "वरिष्ठ को भेजी" },

  // ── Calls ────────────────────────────────────────────────────────────────────
  calls_title:       { en: "Call Records",            hi: "कॉल रिकॉर्ड" },
  inbound:           { en: "Inbound",                 hi: "आने वाली" },
  outbound:          { en: "Outbound",                hi: "जाने वाली" },
  duration:          { en: "Duration",                hi: "अवधि" },
  language:          { en: "Language",                hi: "भाषा" },
  sentiment:         { en: "Sentiment",               hi: "भावना" },
  no_calls:          { en: "No calls recorded yet.",  hi: "अभी तक कोई कॉल नहीं।" },
  lang_breakdown:    { en: "Language Breakdown",      hi: "भाषा विवरण" },

  // ── Feedback ─────────────────────────────────────────────────────────────────
  feedback_title:    { en: "Feedback",                hi: "प्रतिक्रिया" },
  add_feedback:      { en: "Add Feedback",            hi: "प्रतिक्रिया जोड़ें" },
  avg_rating:        { en: "Avg Rating",              hi: "औसत रेटिंग" },
  completed:         { en: "Completed",               hi: "पूर्ण" },
  no_feedback:       { en: "No feedback yet.",        hi: "अभी तक कोई प्रतिक्रिया नहीं।" },

  // ── Surveys ──────────────────────────────────────────────────────────────────
  surveys_title:     { en: "Surveys",                 hi: "सर्वेक्षण" },
  create_survey:     { en: "Create Survey",           hi: "सर्वेक्षण बनाएँ" },
  active:            { en: "Active",                  hi: "सक्रिय" },
  closed:            { en: "Closed",                  hi: "बंद" },
  responses:         { en: "Responses",               hi: "उत्तर" },
  no_surveys:        { en: "No surveys yet.",         hi: "अभी तक कोई सर्वेक्षण नहीं।" },

  // ── Analytics ────────────────────────────────────────────────────────────────
  analytics_title:   { en: "Analytics",               hi: "विश्लेषण" },
  call_trend:        { en: "Call Trend",              hi: "कॉल प्रवृत्ति" },
  avg_resolution:    { en: "Avg Resolution Time",     hi: "औसत समाधान समय" },
  satisfaction:      { en: "Satisfaction Score",      hi: "संतुष्टि स्कोर" },
  minutes:           { en: "minutes",                 hi: "मिनट" },

  // ── Notifications ────────────────────────────────────────────────────────────
  notif_title:       { en: "Notifications",           hi: "सूचनाएँ" },
  mark_all_read:     { en: "Mark all read",           hi: "सभी पढ़ी गईं" },
  no_notifications:  { en: "No notifications.",       hi: "कोई सूचना नहीं।" },
  unread:            { en: "unread",                  hi: "अपठित" },

  // ── Settings ─────────────────────────────────────────────────────────────────
  settings_title:    { en: "System Settings",         hi: "सिस्टम सेटिंग्स" },
  settings_sub:      { en: "Configure BharatEcho behaviour", hi: "BharatEcho व्यवहार कॉन्फ़िगर करें" },
  save_changes:      { en: "Save changes",            hi: "परिवर्तन सहेजें" },
  saving:            { en: "Saving…",                 hi: "सहेज रहे हैं…" },
  saved:             { en: "Saved",                   hi: "सहेजा गया" },
  reset:             { en: "Reset",                   hi: "रीसेट" },
  unsaved_changes:   { en: "You have unsaved changes", hi: "आपके पास असहेजे परिवर्तन हैं" },
  telephony:         { en: "Telephony",               hi: "टेलीफोनी" },
  telephony_desc:    { en: "Twilio and ngrok configuration", hi: "Twilio और ngrok कॉन्फ़िगरेशन" },
  twilio_phone:      { en: "Twilio Phone Number",     hi: "Twilio फोन नंबर" },
  ngrok_url:         { en: "Public Base URL (ngrok)", hi: "पब्लिक बेस URL (ngrok)" },
  lang_section:      { en: "Language",                hi: "भाषा" },
  lang_desc:         { en: "Speech and response language settings", hi: "वाक् और प्रतिक्रिया भाषा सेटिंग्स" },
  default_lang:      { en: "Default Language",        hi: "डिफ़ॉल्ट भाषा" },
  default_lang_hint: { en: "Language used when detection fails", hi: "जब पहचान विफल हो तो उपयोग की जाने वाली भाषा" },
  tts_code:          { en: "TTS Language Code",       hi: "TTS भाषा कोड" },
  tts_code_hint:     { en: "gTTS language code for voice responses", hi: "वॉइस प्रतिक्रियाओं के लिए gTTS भाषा कोड" },
  ui_language:       { en: "Dashboard Language",      hi: "डैशबोर्ड भाषा" },
  ui_language_hint:  { en: "Changes the language of this dashboard", hi: "इस डैशबोर्ड की भाषा बदलता है" },
  call_behaviour:    { en: "Call Behaviour",          hi: "कॉल व्यवहार" },
  call_behaviour_desc: { en: "How the AI handles incoming and outbound calls", hi: "AI आने वाली और जाने वाली कॉल को कैसे संभालता है" },
  max_duration:      { en: "Max Call Duration (seconds)", hi: "अधिकतम कॉल अवधि (सेकंड)" },
  auto_followup:     { en: "Auto Follow-up (days)",   hi: "स्वचालित फॉलो-अप (दिन)" },
  escalation:        { en: "Escalation Sentiment",    hi: "एस्केलेशन भावना" },
  working_hours:     { en: "Working Hours",           hi: "कार्य समय" },
  working_hours_desc:{ en: "Hours during which outbound calls are permitted", hi: "वे घंटे जब आउटबाउंड कॉल की अनुमति है" },
  start_time:        { en: "Start Time",              hi: "शुरू का समय" },
  end_time:          { en: "End Time",                hi: "समाप्ति का समय" },
  notif_surveys:     { en: "Notifications & Surveys", hi: "सूचनाएँ और सर्वेक्षण" },
  notif_surveys_desc:{ en: "Automation toggles",      hi: "स्वचालन टॉगल" },
  enable_notif:      { en: "Enable Notifications",    hi: "सूचनाएँ सक्षम करें" },
  enable_notif_hint: { en: "Push notifications for new complaints and calls", hi: "नई शिकायतों और कॉल के लिए पुश सूचनाएँ" },
  survey_after:      { en: "Survey After Resolution", hi: "समाधान के बाद सर्वेक्षण" },
  survey_after_hint: { en: "Auto-create survey when a complaint is resolved", hi: "शिकायत हल होने पर स्वचालित सर्वेक्षण बनाएँ" },

  // ── Common buttons ────────────────────────────────────────────────────────────
  btn_refresh:       { en: "Refresh",     hi: "ताज़ा करें" },
  btn_delete:        { en: "Delete",      hi: "हटाएँ" },
  btn_edit:          { en: "Edit",        hi: "संपादित करें" },
  btn_view:          { en: "View",        hi: "देखें" },
  btn_close:         { en: "Close",       hi: "बंद करें" },
  btn_confirm:       { en: "Confirm",     hi: "पुष्टि करें" },
  btn_cancel:        { en: "Cancel",      hi: "रद्द करें" },
  btn_save:          { en: "Save",        hi: "सहेजें" },
  btn_add:           { en: "Add",         hi: "जोड़ें" },
  loading:           { en: "Loading…",    hi: "लोड हो रहा है…" },
  error_load:        { en: "Failed to load data.", hi: "डेटा लोड करने में विफल।" },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, lang: Lang): string {
  const entry = translations[key];
  if (!entry) return key;
  return entry[lang] ?? entry["en"];
}
