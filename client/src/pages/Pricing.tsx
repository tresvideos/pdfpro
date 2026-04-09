/* =============================================================
   CloudPDF Pricing Page — Deep Navy Pro design
   Two plans: Trial + Monthly, with feature comparison table
   ============================================================= */

import { useState } from "react";
import { Check, X, ChevronDown, ChevronUp, Zap, Crown } from "lucide-react";
import { toast } from "sonner";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Pricing() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const { isAuthenticated, user } = useAuth();
  const { t } = useLanguage();

  const features = [
    { name: t.pricing_feature_convert ?? "Unlimited conversions", trial: false, monthly: true },
    { name: t.pricing_feature_edit ?? "Unlimited editing", trial: false, monthly: true },
    { name: t.pricing_feature_folders ?? "Organize in folders", trial: false, monthly: true },
    { name: t.pricing_feature_storage ?? "Store PDFs over 24 hours", trial: false, monthly: true },
    { name: t.pricing_feature_team ?? "Team collaboration", trial: false, monthly: true },
    { name: t.pricing_feature_notes ?? "Create notes", trial: true, monthly: true },
    { name: t.pricing_feature_pages ?? "Manage pages", trial: true, monthly: true },
    { name: t.pricing_feature_sign ?? "Sign documents", trial: true, monthly: true },
    { name: t.pricing_feature_images ?? "Edit images", trial: true, monthly: true },
    { name: t.pricing_feature_shapes ?? "Edit objects & shapes", trial: true, monthly: true },
    { name: t.pricing_feature_highlight ?? "Highlight text", trial: true, monthly: true },
    { name: t.pricing_feature_protect ?? "Protect documents", trial: true, monthly: true },
  ];

  const pricingFaqs = [
    {
      question: t.pricing_faq_q1 ?? "Can I try all features during the trial?",
      answer: t.pricing_faq_a1 ?? "During the 7-day trial you have access to basic editing features. For unlimited access, you'll need the monthly plan.",
    },
    {
      question: t.pricing_faq_q2 ?? "What happens after the 7-day trial?",
      answer: t.pricing_faq_a2 ?? "After the trial, your plan automatically renews to the monthly plan. You can cancel anytime before the trial ends.",
    },
    {
      question: t.pricing_faq_q3 ?? "Is there any commitment with the monthly subscription?",
      answer: t.pricing_faq_a3 ?? "No long-term commitment. Cancel your monthly subscription anytime and you'll retain access until the end of the billing period.",
    },
    {
      question: t.pricing_faq_q4 ?? "Can I cancel my subscription at any time?",
      answer: t.pricing_faq_a4 ?? "Yes, you can cancel anytime from your account settings. No cancellation penalties.",
    },
    {
      question: t.pricing_faq_q5 ?? "Can I request a refund for an unused subscription?",
      answer: t.pricing_faq_a5 ?? "We evaluate refund requests case by case. Contact our support team and we'll do our best to help.",
    },
    {
      question: t.faq_q7,
      answer: t.faq_a7,
    },
  ];

  const handleSubscribe = () => {
    if (!isAuthenticated) {
      // Redirect to home page with login modal for authentication
      const langMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
      const currentLang = langMatch ? langMatch[1] : "es";
      window.location.href = `/${currentLang}?login=true`;
      return;
    }
    setShowCheckout(true);
    // Scroll to checkout section
    setTimeout(() => {
      document.getElementById("pricing-checkout")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "oklch(0.98 0.005 250)" }}>
      <Navbar />

      {/* ── HERO ─────────────────────────────────────────── */}
      <section className="py-16 md:py-24 text-center">
        <div className="container max-w-3xl mx-auto">
          <h1
            className="text-4xl md:text-5xl font-extrabold mb-4"
            style={{ fontFamily: "'Sora', sans-serif", color: "oklch(0.15 0.03 250)" }}
          >
            {t.pricing_title}
          </h1>
          <p
            className="text-base"
            style={{ color: "oklch(0.50 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
          >
            {t.pricing_subtitle}
          </p>
        </div>
      </section>

      {/* ── PLANS ────────────────────────────────────────── */}
      <section className="pb-16">
        <div className="container max-w-4xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            {/* Trial Plan */}
            <div
              className="relative rounded-2xl p-8 flex flex-col"
              style={{
                backgroundColor: "oklch(1 0 0)",
                border: "2px solid oklch(0.55 0.22 260)",
                boxShadow: "0 0 0 4px oklch(0.55 0.22 260 / 0.08)",
              }}
            >
              {/* Most popular badge */}
              <div className="absolute -top-3 left-6">
                <span
                  className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold text-white"
                  style={{
                    backgroundColor: "oklch(0.55 0.22 260)",
                    fontFamily: "'DM Sans', sans-serif",
                  }}
                >
                  <Zap className="w-3 h-3" />
                  {t.pricing_popular ?? "Most popular"}
                </span>
              </div>

              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.1)" }}
                >
                  <Zap className="w-4 h-4" style={{ color: "oklch(0.55 0.22 260)" }} />
                </div>
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: "'Sora', sans-serif", color: "oklch(0.15 0.03 250)" }}
                >
                  {t.pricing_trial_name}
                </h2>
              </div>

              <div className="mb-4">
                <span
                  className="text-4xl font-extrabold"
                  style={{ fontFamily: "'Sora', sans-serif", color: "oklch(0.15 0.03 250)" }}
                >
                  {t.pricing_trial_price}
                </span>
                <span
                  className="text-sm ml-1"
                  style={{ color: "oklch(0.50 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
                >
                  / {t.pricing_trial_period}
                </span>
              </div>

              <p
                className="text-sm leading-relaxed mb-6 flex-1"
                style={{ color: "oklch(0.45 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
              >
                {t.pricing_trial_desc}
              </p>

              <button
                className="w-full py-3 rounded-xl font-semibold text-sm text-white transition-all duration-200"
                style={{
                  backgroundColor: showCheckout ? "oklch(0.55 0.22 260)" : "oklch(0.18 0.04 250)",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.backgroundColor = "oklch(0.55 0.22 260)")
                }
                onMouseLeave={(e) =>
                  (e.currentTarget.style.backgroundColor = showCheckout ? "oklch(0.55 0.22 260)" : "oklch(0.18 0.04 250)")
                }
                onClick={handleSubscribe}
              >
                {t.pricing_cta_trial}
              </button>
            </div>

            {/* Monthly Plan */}
            <div
              className="rounded-2xl p-8 flex flex-col"
              style={{
                backgroundColor: "oklch(1 0 0)",
                border: "1px solid oklch(0.88 0.01 250)",
                boxShadow: "0 2px 12px oklch(0.18 0.04 250 / 0.06)",
              }}
            >
              <div className="flex items-center gap-2 mb-2">
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "oklch(0.18 0.04 250 / 0.08)" }}
                >
                  <Crown className="w-4 h-4" style={{ color: "oklch(0.18 0.04 250)" }} />
                </div>
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: "'Sora', sans-serif", color: "oklch(0.15 0.03 250)" }}
                >
                  {t.pricing_monthly_name}
                </h2>
              </div>

              <div className="mb-4">
                <span
                  className="text-4xl font-extrabold"
                  style={{ fontFamily: "'Sora', sans-serif", color: "oklch(0.15 0.03 250)" }}
                >
                  {t.pricing_monthly_price}
                </span>
                <span
                  className="text-sm ml-1"
                  style={{ color: "oklch(0.50 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
                >
                  / {t.pricing_monthly_period}
                </span>
              </div>

              <p
                className="text-sm mb-1"
                style={{ color: "oklch(0.50 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
              >
                {t.pricing_billed_monthly ?? "Billed monthly"}
              </p>
              <p
                className="text-sm leading-relaxed mb-6 flex-1"
                style={{ color: "oklch(0.45 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
              >
                {t.pricing_monthly_desc}
              </p>

              <button
                className="w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200"
                style={{
                  backgroundColor: "transparent",
                  border: "2px solid oklch(0.18 0.04 250)",
                  color: "oklch(0.18 0.04 250)",
                  fontFamily: "'DM Sans', sans-serif",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = "oklch(0.18 0.04 250)";
                  e.currentTarget.style.color = "white";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = "transparent";
                  e.currentTarget.style.color = "oklch(0.18 0.04 250)";
                }}
                onClick={handleSubscribe}
              >
                {t.pricing_cta_monthly}
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── COMPARISON TABLE ─────────────────────────────── */}
      <section
        className="py-16"
        style={{ backgroundColor: "oklch(0.97 0.006 250)" }}
      >
        <div className="container max-w-4xl mx-auto">
          <h2
            className="text-2xl md:text-3xl font-bold mb-8"
            style={{ fontFamily: "'Sora', sans-serif", color: "oklch(0.15 0.03 250)" }}
          >
            {t.pricing_compare_title ?? "Discover what each plan includes"}
          </h2>

          <div
            className="rounded-2xl overflow-hidden"
            style={{
              border: "1px solid oklch(0.88 0.01 250)",
              backgroundColor: "oklch(1 0 0)",
            }}
          >
            {/* Table header */}
            <div
              className="grid grid-cols-3 px-6 py-4 border-b"
              style={{ borderColor: "oklch(0.88 0.01 250)" }}
            >
              <div
                className="text-sm font-semibold"
                style={{ color: "oklch(0.35 0.02 250)", fontFamily: "'Sora', sans-serif" }}
              >
                {t.pricing_features_col ?? "Main features"}
              </div>
              <div
                className="text-sm font-semibold text-center"
                style={{ color: "oklch(0.55 0.22 260)", fontFamily: "'Sora', sans-serif" }}
              >
                {t.pricing_trial_name}
              </div>
              <div
                className="text-sm font-semibold text-center"
                style={{ color: "oklch(0.15 0.03 250)", fontFamily: "'Sora', sans-serif" }}
              >
                {t.pricing_monthly_name}
              </div>
            </div>

            {/* Table rows */}
            {features.map((feature, i) => (
              <div
                key={i}
                className="grid grid-cols-3 px-6 py-3 border-b last:border-0"
                style={{
                  borderColor: "oklch(0.92 0.01 250)",
                  backgroundColor: i % 2 === 0 ? "oklch(1 0 0)" : "oklch(0.99 0.003 250)",
                }}
              >
                <div
                  className="text-sm"
                  style={{ color: "oklch(0.35 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
                >
                  {feature.name}
                </div>
                <div className="flex justify-center">
                  {feature.trial ? (
                    <Check className="w-4 h-4" style={{ color: "oklch(0.55 0.22 260)" }} />
                  ) : (
                    <X className="w-4 h-4" style={{ color: "oklch(0.70 0.02 250)" }} />
                  )}
                </div>
                <div className="flex justify-center">
                  {feature.monthly ? (
                    <Check className="w-4 h-4" style={{ color: "oklch(0.45 0.18 145)" }} />
                  ) : (
                    <X className="w-4 h-4" style={{ color: "oklch(0.70 0.02 250)" }} />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ──────────────────────────────────────────── */}
      <section className="py-16 md:py-24">
        <div className="container max-w-3xl mx-auto">
          <h2
            className="text-2xl md:text-3xl font-bold mb-8"
            style={{ fontFamily: "'Sora', sans-serif", color: "oklch(0.15 0.03 250)" }}
          >
            {t.faq_title}
          </h2>

          <div className="space-y-3">
            {pricingFaqs.map((faq, i) => (
              <div
                key={i}
                className="rounded-xl overflow-hidden"
                style={{
                  border: `1px solid ${openFaq === i ? "oklch(0.55 0.22 260 / 0.3)" : "oklch(0.88 0.01 250)"}`,
                  backgroundColor: "oklch(1 0 0)",
                }}
              >
                <button
                  className="w-full flex items-center justify-between px-6 py-4 text-left"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span
                    className="font-semibold text-sm pr-4"
                    style={{ color: "oklch(0.15 0.03 250)", fontFamily: "'Sora', sans-serif" }}
                  >
                    {faq.question}
                  </span>
                  {openFaq === i ? (
                    <ChevronUp className="w-4 h-4 flex-shrink-0" style={{ color: "oklch(0.55 0.22 260)" }} />
                  ) : (
                    <ChevronDown className="w-4 h-4 flex-shrink-0" style={{ color: "oklch(0.50 0.02 250)" }} />
                  )}
                </button>
                {openFaq === i && (
                  <div
                    className="px-6 pb-4 text-sm leading-relaxed"
                    style={{ color: "oklch(0.45 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
                  >
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

