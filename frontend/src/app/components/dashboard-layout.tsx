// src/app/components/dashboard-layout.tsx
import { Link, Outlet, useLocation } from "react-router";
import {
  LayoutDashboard, AlertCircle, PhoneCall, FileText,
  BarChart3, Bell, Settings as SettingsIcon,
  Menu, X, Globe, MessageSquare, Languages,
} from "lucide-react";
import { Button } from "./ui/button";
import { useRealtime } from "@/lib/RealtimeContext";
import { useLang } from "@/lib/LanguageContext";
import { useState } from "react";

export function DashboardLayout() {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { unreadNotifications } = useRealtime();
  const { t, lang, setLang } = useLang();

  const navigation = [
    { key: "nav_overview",      path: "/",             icon: LayoutDashboard },
    { key: "nav_complaints",    path: "/complaints",   icon: AlertCircle },
    { key: "nav_calls",         path: "/calls",        icon: PhoneCall },
    { key: "nav_surveys",       path: "/surveys",      icon: FileText },
    { key: "nav_feedback",      path: "/feedback",     icon: MessageSquare },
    { key: "nav_analytics",     path: "/analytics",    icon: BarChart3 },
    { key: "nav_notifications", path: "/notifications",icon: Bell },
    { key: "nav_settings",      path: "/settings",     icon: SettingsIcon },
  ] as const;

  return (
    <div className="min-h-screen bg-slate-50">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 z-50 h-full w-64 bg-white border-r border-slate-200
        transform transition-transform duration-300 ease-in-out
        lg:translate-x-0
        ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
      `}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-orange-500 to-green-600 rounded-lg flex items-center justify-center">
              <Globe className="w-5 h-5 text-white" />
              <img src="/logo.png" alt="logo" className="w-8 h-8 object-contain" />
            </div>
            <span className="font-bold text-lg bg-gradient-to-r from-orange-600 to-green-600 bg-clip-text text-transparent ">
              BharatEcho
            </span>
          </div>
          <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(false)}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="p-4 space-y-1">
          {navigation.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-colors
                  ${isActive
                    ? "bg-gradient-to-r from-orange-500 to-green-600 text-white shadow-md"
                    : "text-slate-700 hover:bg-slate-100"
                  }
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium flex-1">{t(item.key)}</span>
                {item.key === "nav_notifications" && unreadNotifications > 0 && (
                  <span className="w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Version */}
        <div className="absolute bottom-4 left-4 right-4 p-3 bg-slate-50 rounded-lg">
          <p className="text-xs text-slate-600">BharatEcho by Team Saarthi</p>
          <p className="text-xs text-slate-400 mt-1">Version 1.0.0</p>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:ml-64">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 sticky top-0 z-30">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
              <Menu className="w-5 h-5" />
            </Button>
            <h1 className="text-xl font-semibold text-slate-800">
              {t("header_title")}
            </h1>
          </div>

          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <button
              onClick={() => setLang(lang === "en" ? "hi" : "en")}
              title={lang === "en" ? "Switch to Hindi" : "अंग्रेज़ी में बदलें"}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-slate-200 hover:border-orange-400 hover:text-orange-600 transition-colors bg-white"
            >
              <Languages className="w-3.5 h-3.5" />
              {lang === "en" ? "हिन्दी" : "English"}
            </button>

            <span className="text-xs text-slate-400 bg-slate-100 px-3 py-1.5 rounded-full">
              {t("version_badge")}
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
