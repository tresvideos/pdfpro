import { useEffect, useState, useRef } from "react";
import { CheckCircle, ArrowRight, Upload, Loader2 } from "lucide-react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";

export default function PaymentSuccess() {
  const utils = trpc.useUtils();
  const [, navigate] = useLocation();
  const [countdown, setCountdown] = useState(5);
  const trackedRef = useRef(false);

  useEffect(() => {
    // Invalidate subscription status so it refreshes
    utils.subscription.status.invalidate();

    trackedRef.current = true;

    // Detect lang from URL
    const langMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    const lang = langMatch ? langMatch[1] : "es";

    // Auto-redirect to dashboard documents tab after countdown
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
        ¡Pago completado!
      </h1>
      <p
        className="text-base mb-4 max-w-md"
        style={{ color: "oklch(0.45 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}
      >
        Tu suscripción está activa. Tu documento está guardado en tu panel y listo para descargar.
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
          Redirigiendo en <strong>{countdown}</strong>s...
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
          Editar otro PDF
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
          ¿Qué puedes hacer ahora?
        </h3>
        <ul className="space-y-2 text-sm" style={{ color: "oklch(0.40 0.02 250)", fontFamily: "'DM Sans', sans-serif" }}>
          {[
            "Descargar tus PDFs editados sin marca de agua",
            "Editar cualquier documento desde tu panel",
            "Añadir texto, firmas y anotaciones",
            "Comprimir, fusionar y dividir PDFs",
            "Acceder a tus documentos en cualquier momento",
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
