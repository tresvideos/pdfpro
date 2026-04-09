/* =============================================================
   CookieBanner — LSSI/RGPD Cookie Consent Banner
   Shows on first visit, saves preference to localStorage
   ============================================================= */
import { useState, useEffect } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { Cookie, ChevronDown, ChevronUp, Shield, BarChart3, Check } from "lucide-react";
import { Link } from "wouter";

type CookieConsent = "all" | "essential" | null;

const COOKIE_CONSENT_KEY = "cloudpdf_cookie_consent";

function getCookieConsent(): CookieConsent {
  try {
    const val = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (val === "all" || val === "essential") return val;
    return null;
  } catch {
    return null;
  }
}

function setCookieConsent(val: "all" | "essential") {
  try {
    localStorage.setItem(COOKIE_CONSENT_KEY, val);
  } catch {
    // ignore
  }
}

export default function CookieBanner() {
  const { lang, t } = useLanguage();
  const [visible, setVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [analyticsEnabled, setAnalyticsEnabled] = useState(true);

  useEffect(() => {
    // Only show banner if no consent has been given
    const consent = getCookieConsent();
    if (!consent) {
      // Small delay so it doesn't flash on page load
      const timer = setTimeout(() => setVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  const handleAcceptAll = () => {
    setCookieConsent("all");
    setVisible(false);
  };

  const handleRejectNonEssential = () => {
    setCookieConsent("essential");
    setVisible(false);
  };

  const handleSaveSettings = () => {
    setCookieConsent(analyticsEnabled ? "all" : "essential");
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div className="fixed inset-0 bg-black/30 backdrop-blur-[2px] z-[9998] transition-opacity duration-300" />

      {/* Banner */}
      <div className="fixed bottom-0 left-0 right-0 z-[9999] animate-in slide-in-from-bottom duration-500">
        <div className="mx-auto max-w-4xl px-4 pb-4 sm:pb-6">
          <div className="rounded-2xl border border-white/10 bg-[#0a1628]/95 backdrop-blur-xl shadow-2xl shadow-black/40 overflow-hidden">
            {/* Main content */}
            <div className="p-5 sm:p-6">
              {/* Header */}
              <div className="flex items-start gap-3 mb-4">
                <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
                  <Cookie className="w-5 h-5 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold text-base mb-1">Cookies</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {t.cookie_banner_text}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    {t.cookie_banner_more_info}{" "}
                    <Link
                      href={`/${lang}/cookies`}
                      className="text-blue-400 hover:text-blue-300 underline underline-offset-2 transition-colors"
                    >
                      {t.footer_cookies}
                    </Link>
                  </p>
                </div>
              </div>

              {/* Settings panel (expandable) */}
              {showSettings && (
                <div className="mb-4 space-y-3 pl-[52px] animate-in fade-in duration-200">
                  {/* Necessary cookies - always on */}
                  <div className="flex items-center justify-between rounded-xl bg-white/5 px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Shield className="w-4 h-4 text-green-400 flex-shrink-0" />
                      <span className="text-sm text-gray-200">{t.cookie_banner_necessary}</span>
                    </div>
                    <div className="flex-shrink-0 w-10 h-6 rounded-full bg-green-500/20 flex items-center justify-end px-1">
                      <div className="w-4 h-4 rounded-full bg-green-400 flex items-center justify-center">
                        <Check className="w-3 h-3 text-green-900" />
                      </div>
                    </div>
                  </div>

                  {/* Analytics cookies - toggleable */}
                  <button
                    onClick={() => setAnalyticsEnabled(!analyticsEnabled)}
                    className="w-full flex items-center justify-between rounded-xl bg-white/5 hover:bg-white/8 px-4 py-3 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <BarChart3 className="w-4 h-4 text-blue-400 flex-shrink-0" />
                      <span className="text-sm text-gray-200">{t.cookie_banner_analytics}</span>
                    </div>
                    <div
                      className={`flex-shrink-0 w-10 h-6 rounded-full flex items-center px-1 transition-colors ${
                        analyticsEnabled ? "bg-blue-500/30 justify-end" : "bg-gray-600/30 justify-start"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded-full transition-colors ${
                          analyticsEnabled ? "bg-blue-400" : "bg-gray-500"
                        }`}
                      />
                    </div>
                  </button>
                </div>
              )}

              {/* Buttons */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 pl-0 sm:pl-[52px]">
                {!showSettings ? (
                  <>
                    <button
                      onClick={handleAcceptAll}
                      className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                    >
                      {t.cookie_banner_accept}
                    </button>
                    <button
                      onClick={handleRejectNonEssential}
                      className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 text-gray-200 text-sm font-medium transition-colors"
                    >
                      {t.cookie_banner_reject}
                    </button>
                    <button
                      onClick={() => setShowSettings(true)}
                      className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-white/10 hover:border-white/20 text-gray-300 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      {t.cookie_banner_settings}
                      <ChevronDown className="w-3.5 h-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleSaveSettings}
                      className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white text-sm font-medium transition-colors shadow-lg shadow-blue-500/20"
                    >
                      {t.cookie_banner_accept}
                    </button>
                    <button
                      onClick={() => setShowSettings(false)}
                      className="flex-1 sm:flex-none px-5 py-2.5 rounded-xl border border-white/10 hover:border-white/20 text-gray-300 text-sm font-medium transition-colors flex items-center justify-center gap-1.5"
                    >
                      <ChevronUp className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/**
 * Utility to check if the user has accepted analytics cookies.
 * Use this in other components before loading analytics scripts.
 */
export function hasAnalyticsConsent(): boolean {
  return getCookieConsent() === "all";
}
