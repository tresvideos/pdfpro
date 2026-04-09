/*
 * PaywallModal — Payment wall for premium features
 * - Handles auth (login/register)
 * - Embedded Stripe payment form inside modal (SetupIntent + subscription)
 */
import { useState, useEffect } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, PaymentElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { X, Check, Loader2, Mail, CreditCard, ArrowRight, Eye, EyeOff, Lock, Shield } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { usePdfFile } from "@/contexts/PdfFileContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { logoParts, colors } from "@/lib/brand";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLIC_KEY ?? "");

// PDF data can be base64 (from editor) or tempKey (from S3 temp upload after login redirect)
type PdfPayload =
  | { base64: string; name: string; size: number }
  | { tempKey: string; name: string };

interface PaywallModalProps {
  isOpen: boolean;
  onClose: () => void;
  action?: string;
  pdfData?: { base64: string; name: string; size: number };
  onPaymentSuccess?: (transactionId?: string) => void;
  thumbnailUrl?: string;
  buildPdfForUpload?: () => Promise<{ base64: string; name: string; size: number } | null>;
}

type Step = "auth-choice" | "email-form" | "plans";

// ── Inner payment form (inside <Elements>) ──────────────────────────────────
function StripeCardForm({ customerId, onSuccess }: { customerId: string; onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [paying, setPaying] = useState(false);
  const { t } = useLanguage();
  const activateSubscription = trpc.subscription.activateSubscription.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setPaying(true);
    try {
      // Save the card via SetupIntent
      const { error } = await stripe.confirmSetup({
        elements,
        redirect: "if_required",
      });
      if (error) {
        toast.error(error.message ?? "Card error");
        setPaying(false);
        return;
      }
      // Card saved — now create the subscription + charge 0.50€ server-side
      const trialPriceId = import.meta.env.VITE_STRIPE_TRIAL_PRICE_ID ?? "";
      const proPriceId = import.meta.env.VITE_STRIPE_PRO_PRICE_ID ?? "";
      await activateSubscription.mutateAsync({ customerId, trialPriceId, proPriceId });
      // Success — redirect to payment success page
      const langMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
      const lang = langMatch ? langMatch[1] : "es";
      window.location.href = `/${lang}/payment/success`;
    } catch (err) {
      console.error("[Stripe] Payment error:", err);
      toast.error("Error processing payment. Please try again.");
      setPaying(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <PaymentElement />
      <button
        type="submit"
        disabled={!stripe || paying}
        className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-emerald-500 text-white font-bold text-sm hover:bg-emerald-600 transition-colors disabled:opacity-60"
      >
        {paying ? (
          <><Loader2 className="w-4 h-4 animate-spin" /> Processing...</>
        ) : (
          <><ArrowRight className="w-4 h-4" /> Download PDF</>
        )}
      </button>
      <div className="flex items-center justify-center gap-2 text-xs text-slate-400">
        <Shield className="w-3.5 h-3.5" />
        <span>Secure payment with Stripe</span>
      </div>
    </form>
  );
}

// ── Checkout form with embedded Stripe ───────────────────────────────────────
function CheckoutForm({
  onSuccess,
  pdfData,
  thumbnailUrl,
}: {
  onSuccess: (transactionId?: string) => void;
  pdfData?: PdfPayload;
  thumbnailUrl?: string;
}) {
  const { t } = useLanguage();
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const createSetupIntent = trpc.subscription.createSetupIntent.useMutation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await createSetupIntent.mutateAsync();
        if (!cancelled) {
          setClientSecret(result.clientSecret);
          setCustomerId(result.customerId);
        }
      } catch (err) {
        console.error("[Stripe] createSetupIntent error:", err);
        if (!cancelled) setError("Error loading payment form");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="flex flex-col min-h-0">
      <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
        <div className="w-7 h-7 rounded-full bg-green-500 flex items-center justify-center flex-shrink-0">
          <Check className="w-4 h-4 text-white" />
        </div>
        <p className="text-base font-semibold text-slate-800">Your document is ready!</p>
      </div>

      <div className="flex flex-col md:flex-row min-h-0">
        {/* Left: document preview */}
        <div className="hidden md:flex flex-col items-center bg-slate-50 border-r border-slate-100 p-5" style={{ minWidth: 220, maxWidth: 260 }}>
          <div className="flex items-center gap-1 mb-5">
            <svg width="28" height="20" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
              <path d="M25.5 12.5C25.5 12.5 26 12 26 11c0-2.8-2.2-5-5-5-.5 0-1 .1-1.5.2C18.3 3.7 15.9 2 13 2 9.4 2 6.5 4.9 6.5 8.5c0 .2 0 .4 0 .6C4.5 9.6 3 11.4 3 13.5 3 16 5 18 7.5 18h16c2.2 0 4-1.8 4-4 0-1.5-.8-2.8-2-3.5z" fill={colors.light} />
              <rect x="13" y="6" width="6" height="8" rx="0.8" fill="white" fillOpacity="0.9" />
              <path d="M16.5 6V6L19 8.5H16.5V6Z" fill={colors.primaryHover} />
            </svg>
            <span className="font-medium text-lg text-slate-500">{logoParts[0]}</span>
            <span className="font-extrabold text-lg" style={{ color: colors.light }}>{logoParts[1]}</span>
          </div>
          <div
            className="w-full rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden flex items-center justify-center"
            style={{ aspectRatio: "0.707", maxHeight: 200 }}
          >
            {thumbnailUrl ? (
              <img src={thumbnailUrl} alt="Document preview" className="w-full h-full object-contain" />
            ) : (
              <div className="w-full h-full p-3 flex flex-col gap-2">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-7 bg-red-100 rounded flex items-center justify-center flex-shrink-0">
                    <span className="text-red-500 text-[8px] font-bold">PDF</span>
                  </div>
                  <div className="flex-1 space-y-1">
                    <div className="h-1.5 bg-slate-200 rounded w-full" />
                    <div className="h-1.5 bg-slate-200 rounded w-3/4" />
                  </div>
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-1.5 bg-slate-100 rounded" style={{ width: `${70 + (i % 3) * 10}%` }} />
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-2 text-center leading-tight truncate w-full">
            {pdfData?.name ?? "documento.pdf"}
          </p>
        </div>

        {/* Right: pricing + payment form */}
        <div className="flex-1 flex flex-col p-6 min-h-[300px]">
          <div className="text-center mb-5">
            <h3 className="text-xl font-bold text-slate-800 mb-1">
              Your PDF for €0.50
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              One-time payment to download your edited PDF
            </p>
          </div>

          {loading && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300 mb-3" />
              <p className="text-sm text-slate-500">Loading payment form...</p>
            </div>
          )}

          {error && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          {clientSecret && customerId && (
            <Elements stripe={stripePromise} options={{ clientSecret, appearance: { theme: "stripe" }, locale: "en" }}>
              <StripeCardForm customerId={customerId} onSuccess={() => onSuccess()} />
            </Elements>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────
export default function PaywallModal({
  isOpen,
  onClose,
  action,
  pdfData,
  onPaymentSuccess,
  thumbnailUrl,
  buildPdfForUpload,
}: PaywallModalProps) {
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { savePdfToSession, setPendingPaywall, pendingFile, pendingEditedPdf, clearPendingEditedPdf, saveEditedPdfToSession } = usePdfFile();
  const [step, setStep] = useState<Step>(isAuthenticated ? "plans" : "auth-choice");
  const [emailInput, setEmailInput] = useState("");
  const [passwordInput, setPasswordInput] = useState("");
  const [nameInput, setNameInput] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [emailMode, setEmailMode] = useState<"register" | "login">("register");
  const [emailLoading, setEmailLoading] = useState(false);
  const registerMutation = trpc.auth.register.useMutation();
  const loginMutation = trpc.auth.login.useMutation();
  const { refresh } = useAuth();

  if (!isOpen) return null;

  const currentStep = isAuthenticated ? "plans" : step;
  const effectivePdfData = pdfData ?? pendingEditedPdf ?? undefined;

  const handleGoogleLogin = async () => {
    if (pendingFile) {
      try { await savePdfToSession(pendingFile); } catch {}
    }
    if (pdfData) {
      try { await saveEditedPdfToSession(pdfData.base64, pdfData.name, pdfData.size); } catch {}
    }
    setPendingPaywall(true);
    sessionStorage.setItem("cloudpdf_pending_action", "download");
    const returnPath = window.location.pathname + window.location.search;
    window.location.href = `/api/auth/google?origin=${encodeURIComponent(window.location.origin)}&returnPath=${encodeURIComponent(returnPath)}`;
  };

  const handleEmailSubmit = async () => {
    if (!emailInput.trim() || !emailInput.includes("@")) {
      toast.error(t.paywall_enter_email);
      return;
    }
    if (!passwordInput || passwordInput.length < 6) {
      toast.error(t.paywall_password_min);
      return;
    }
    setEmailLoading(true);
    try {
      if (emailMode === "register") {
        await registerMutation.mutateAsync({
          email: emailInput.trim(),
          password: passwordInput,
          name: nameInput.trim() || undefined,
        });
      } else {
        await loginMutation.mutateAsync({
          email: emailInput.trim(),
          password: passwordInput,
        });
      }
      await refresh();
      // Auto-save the document
      const docToSave = (effectivePdfData && "base64" in effectivePdfData ? effectivePdfData : null) ?? (buildPdfForUpload ? await buildPdfForUpload() : null);
      if (docToSave && "base64" in docToSave) {
        try {
          const binaryStr = atob(docToSave.base64);
          const bytes = new Uint8Array(binaryStr.length);
          for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
          const blob = new Blob([bytes], { type: "application/pdf" });
          const fd = new FormData();
          fd.append("file", blob, docToSave.name);
          fd.append("name", docToSave.name);
          await fetch("/api/documents/auto-save", { method: "POST", credentials: "include", body: fd });
        } catch (e) {
          console.warn("[PaywallModal] Auto-save after registration failed:", e);
        }
      }
      // Auth updated → currentStep becomes "plans" → payment form appears automatically
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Error";
      toast.error(message);
    } finally {
      setEmailLoading(false);
    }
  };

  const handlePaymentSuccess = (transactionId?: string) => {
    clearPendingEditedPdf();
    onClose();
    if (onPaymentSuccess) onPaymentSuccess(transactionId);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.55)", backdropFilter: "blur(3px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="relative w-full bg-white rounded-2xl shadow-2xl overflow-hidden"
        style={{ maxWidth: currentStep === "plans" ? 820 : 520, maxHeight: "92vh", overflowY: "auto" }}
      >
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 w-8 h-8 rounded-full flex items-center justify-center bg-gray-100 hover:bg-gray-200 transition-colors"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>

        {/* ── Auth Choice ── */}
        {currentStep === "auth-choice" && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-[#1a3c6e] flex items-center justify-center mx-auto mb-4">
                <CreditCard className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {t.paywall_create_account}
              </h2>
              <p className="text-sm text-gray-500">
                {t.paywall_sign_up_seconds}
              </p>
            </div>
            <div className="space-y-3 max-w-sm mx-auto">
              <button
                onClick={handleGoogleLogin}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border-2 border-gray-200 font-semibold text-sm text-gray-700 bg-white hover:border-gray-400 transition-all"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 01-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4"/>
                  <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 009 18z" fill="#34A853"/>
                  <path d="M3.964 10.71A5.41 5.41 0 013.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 000 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
                  <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 00.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
                </svg>
                {t.paywall_continue_google}
              </button>
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-200" />
                <span className="text-xs text-gray-400">{t.paywall_or}</span>
                <div className="flex-1 h-px bg-gray-200" />
              </div>
              <button
                onClick={() => setStep("email-form")}
                className="w-full flex items-center justify-center gap-3 py-3.5 rounded-xl border-2 border-gray-200 font-semibold text-sm text-gray-700 bg-white hover:border-gray-400 transition-all"
              >
                <Mail className="w-4 h-4" />
                {t.paywall_continue_email}
              </button>
            </div>
            <p className="text-center text-xs mt-5 text-gray-400">
              {t.paywall_by_continuing}{" "}
              <a href="/terms" className="underline text-gray-600">{t.paywall_terms}</a>{" "}
              {t.paywall_or}{" "}
              <a href="/privacy" className="underline text-gray-600">{t.paywall_privacy}</a>
            </p>
          </div>
        )}

        {/* ── Email Form (register/login) ── */}
        {currentStep === "email-form" && (
          <div className="p-8">
            <div className="text-center mb-6">
              <div className="w-14 h-14 rounded-2xl bg-[#1a3c6e] flex items-center justify-center mx-auto mb-4">
                <Lock className="w-7 h-7 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-gray-900 mb-2">
                {emailMode === "register" ? t.paywall_register : t.paywall_login}
              </h2>
              <p className="text-sm text-gray-500">
                {emailMode === "register" ? t.paywall_sign_up_seconds : t.paywall_enter_email}
              </p>
            </div>
            <div className="max-w-sm mx-auto space-y-3">
              {emailMode === "register" && (
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  placeholder={t.paywall_name}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3c6e]"
                />
              )}
              <input
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                placeholder="you@email.com"
                className="w-full border border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3c6e]"
              />
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder={t.paywall_password}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 pr-12 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3c6e]"
                  onKeyDown={(e) => e.key === "Enter" && handleEmailSubmit()}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {emailMode === "register" && (
                <p className="text-xs text-gray-400">{t.paywall_password_min}</p>
              )}
              <button
                onClick={handleEmailSubmit}
                disabled={emailLoading}
                className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-[#1a3c6e] text-white font-bold text-sm hover:bg-[#15305a] transition-colors disabled:opacity-60"
              >
                {emailLoading ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> {emailMode === "register" ? t.paywall_registering : t.paywall_logging_in}</>
                ) : (
                  <><ArrowRight className="w-4 h-4" /> {emailMode === "register" ? t.paywall_register : t.paywall_login}</>
                )}
              </button>
              <div className="text-center text-sm text-gray-500 pt-1">
                {emailMode === "register" ? (
                  <>{t.paywall_have_account}{" "}<button onClick={() => setEmailMode("login")} className="text-[#1a3c6e] font-semibold hover:underline">{t.paywall_login}</button></>
                ) : (
                  <>{t.paywall_no_account}{" "}<button onClick={() => setEmailMode("register")} className="text-[#1a3c6e] font-semibold hover:underline">{t.paywall_register}</button></>
                )}
              </div>
              <button
                onClick={() => setStep("auth-choice")}
                className="w-full text-sm text-gray-400 hover:text-gray-700 py-2 transition-colors"
              >
                {t.paywall_back}
              </button>
            </div>
          </div>
        )}

        {/* ── Payment: embedded Stripe form (auto-loads after auth) ── */}
        {currentStep === "plans" && (
          <CheckoutForm
            onSuccess={handlePaymentSuccess}
            pdfData={effectivePdfData}
            thumbnailUrl={thumbnailUrl}
          />
        )}
      </div>
    </div>
  );
}
