import { useEffect, useState, useRef } from "react";
import { CheckCircle, ArrowRight, Upload, Loader2, Download } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function PaymentSuccess() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [countdown, setCountdown] = useState(5);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const downloadAttempted = useRef(false);

  useEffect(() => {
    // Invalidate subscription status so it refreshes
    utils.subscription.status.invalidate();

    // Auto-download PDF if documentId is present
    const params = new URLSearchParams(window.location.search);
    const documentId = params.get("documentId");
    if (documentId && !downloadAttempted.current) {
      downloadAttempted.current = true;
      autoDownload(documentId);
    }

    // Detect lang from URL
    const langMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    const lang = langMatch ? langMatch[1] : "es";

    // Auto-redirect after countdown
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          navigate(`/${lang}`);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const autoDownload = async (documentId: string) => {
    setDownloading(true);
    try {
      const res = await fetch(`/api/documents/proxy?id=${documentId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "document.pdf";
      // Try to get filename from content-disposition header
      const disposition = res.headers.get("content-disposition");
      if (disposition) {
        const match = disposition.match(/filename="?([^";\n]+)"?/);
        if (match) a.download = match[1];
      }
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setDownloaded(true);
    } catch (err) {
      console.error("[PaymentSuccess] Auto-download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  const handleGoNow = () => {
    const langMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    const lang = langMatch ? langMatch[1] : "es";
    navigate(`/${lang}`);
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 text-center"
      style={{ backgroundColor: "oklch(0.98 0.005 250)" }}
    >
      {/* Success icon */}
      <div
        className="w-20 h-20 rounded-full flex items-center justify-center mb-6"
        style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.12)" }}
      >
        <CheckCircle className="w-10 h-10" style={{ color: "oklch(0.55 0.22 260)" }} />
      </div>

      <h1
        className="text-3xl font-extrabold mb-3"
        style={{ fontFamily: "'Sora', sans-serif", color: "oklch(0.15 0.03 250)" }}
      >
        Payment complete!
      </h1>

      {/* Download status */}
      {downloading && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
          <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
          <span className="text-sm font-medium text-blue-700">Your PDF is downloading...</span>
        </div>
      )}

      {downloaded && (
        <div className="flex items-center gap-2 mb-4 px-4 py-3 rounded-xl bg-green-50 border border-green-200">
          <Download className="w-4 h-4 text-green-500" />
          <span className="text-sm font-medium text-green-700">PDF downloaded successfully!</span>
        </div>
      )}

      <p
        className="text-base mb-4 max-w-md"
        style={{ color: "oklch(0.45 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
      >
        Your subscription is active. Your document is saved in your dashboard and ready to download.
      </p>

      {/* Countdown redirect notice */}
      <div
        className="flex items-center gap-2 mb-8 px-4 py-3 rounded-xl"
        style={{
          backgroundColor: "oklch(0.55 0.22 260 / 0.08)",
          border: "1px solid oklch(0.55 0.22 260 / 0.20)",
        }}
      >
        <Loader2 className="w-4 h-4 animate-spin flex-shrink-0" style={{ color: "oklch(0.55 0.22 260)" }} />
        <span className="text-sm font-medium" style={{ color: "oklch(0.35 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}>
          Redirecting in <strong>{countdown}</strong>s...
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col sm:flex-row gap-3 mb-10">
        <button
          onClick={handleGoNow}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-lg text-white font-semibold text-sm transition-all duration-200"
          style={{
            backgroundColor: "oklch(0.55 0.22 260)",
            fontFamily: "'DM Sans', sans-serif",
          }}
        >
          <Upload className="w-4 h-4" />
          Edit another PDF
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>

      {/* What you can do now */}
      <div
        className="p-5 rounded-xl max-w-sm w-full text-left"
        style={{
          backgroundColor: "oklch(1 0 0)",
          border: "1px solid oklch(0.90 0.01 250)",
        }}
      >
        <h3
          className="font-bold mb-3 text-sm"
          style={{ color: "oklch(0.15 0.03 250)", fontFamily: "'Sora', sans-serif" }}
        >
          What you can do now:
        </h3>
        <ul className="space-y-2 text-sm" style={{ color: "oklch(0.40 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}>
          {[
            "Download your edited PDFs without watermark",
            "Edit any document from your dashboard",
            "Add text, signatures and annotations",
            "Compress, merge and split PDFs",
            "Access your documents anytime",
          ].map((item, i) => (
            <li key={i} className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "oklch(0.55 0.22 260)" }} />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
