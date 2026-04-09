/* =============================================================
   EditorPage — Full-screen PDF editor page (like pdfe.com)
   No navbar. Custom editor header: logo | editable filename | close
   When accessed directly (no file loaded), shows upload zone.
   ============================================================= */
import { useEffect, useState, useRef, useCallback } from "react";
import { logoParts, colors } from "@/lib/brand";
import { useLocation } from "wouter";
import PdfEditor from "@/components/PdfEditor";
import { usePdfFile } from "@/contexts/PdfFileContext";
import { useLanguage } from "@/contexts/LanguageContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Pencil, X as XIcon, Check, FileText, Upload, ArrowRight, RefreshCw, CheckCircle2, Shield, Monitor } from "lucide-react";

const FILE_FREE_TOOLS = ["jpg-to-pdf", "png-to-pdf", "word-to-pdf", "excel-to-pdf", "ppt-to-pdf"];

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/html', 'text/plain',
  'application/octet-stream',
]);

const ACCEPTED_EXTENSIONS = new Set([
  '.pdf', '.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff',
  '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.html', '.txt',
]);

/* Inline SVG logo — CloudPDF cloud icon */
const LogoSvg = () => (
  <svg width="26" height="18" viewBox="0 0 32 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="shrink-0">
    <path d="M25.5 12.5C25.5 12.5 26 12 26 11c0-2.8-2.2-5-5-5-.5 0-1 .1-1.5.2C18.3 3.7 15.9 2 13 2 9.4 2 6.5 4.9 6.5 8.5c0 .2 0 .4 0 .6C4.5 9.6 3 11.4 3 13.5 3 16 5 18 7.5 18h16c2.2 0 4-1.8 4-4 0-1.5-.8-2.8-2-3.5z" fill={colors.light} />
    <rect x="13" y="6" width="6" height="8" rx="0.8" fill="white" fillOpacity="0.9" />
    <path d="M16.5 6V6L19 8.5H16.5V6Z" fill="oklch(0.45 0.18 260)" />
  </svg>
);

const LogoText = () => (
  <span style={{ fontFamily: "'Sora', sans-serif" }}>
    <span className="font-medium text-lg" style={{ color: "rgba(255,255,255,0.85)" }}>{logoParts[0]}</span>
    <span className="font-extrabold text-lg" style={{ color: colors.light }}>{logoParts[1]}</span>
  </span>
);

/* ── Upload zone shown when editor is accessed directly (no file loaded) ── */
function EditorUploadZone({ lang }: { lang: string }) {
  const { setPendingFile, setPendingTool } = usePdfFile();
  const { t } = useLanguage();
  const [, navigate] = useLocation();
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const navy = "oklch(0.18 0.04 250)";
  const blue = "oklch(0.55 0.22 260)";
  const blueLight = "oklch(0.62 0.18 280)";

  const openEditor = useCallback((file: File) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isSupported = ACCEPTED_MIME_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.has(ext);
    if (!isSupported) {
      import('sonner').then(({ toast }) => {
        toast.error('Unsupported format. Upload a PDF, Word, Excel, PowerPoint, JPG or PNG.');
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setPendingFile(file);
    // Stay on the same page — the component will re-render with the file loaded
  }, [setPendingFile]);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) openEditor(f);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const f = e.dataTransfer.files[0];
    if (f) openEditor(f);
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      {/* Hero with upload zone — white background matching home */}
      <section className="relative overflow-hidden flex-1 bg-white">
        {/* Subtle grid */}
        <div className="absolute inset-0 pointer-events-none opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(${colors.primary} 1px, transparent 1px), linear-gradient(90deg, ${colors.primary} 1px, transparent 1px)`,
          backgroundSize: "48px 48px",
        }} />

        <div className="container relative z-10 py-12 md:py-24">
          {/* Headline */}
          <div className="text-center max-w-3xl mx-auto mb-8 md:mb-12">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-extrabold leading-tight mb-4"
              style={{ fontFamily: "'Sora', sans-serif", color: "#111" }}>
              {t.hero_title_1}{" "}
              <span style={{
                background: colors.gradient,
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
              }}>{t.hero_title_2}</span>
            </h1>
            <p className="text-base md:text-lg max-w-xl mx-auto" style={{ color: "#666" }}>
              {t.hero_subtitle}
            </p>
          </div>

          {/* Upload zone */}
          <div className="max-w-lg mx-auto">
            <input ref={fileInputRef} type="file"
              accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.html,.txt"
              className="hidden" onChange={handleFileInput} />

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-2xl flex flex-col items-center justify-center gap-4 py-10 px-8 transition-all duration-300 bg-white"
              style={{
                border: isDraggingOver ? `2px solid ${colors.primary}` : `2px dashed ${colors.lightBg}`,
                boxShadow: isDraggingOver ? `0 0 0 4px ${colors.lightBg}` : "0 2px 12px rgba(0,0,0,0.06)",
              }}
            >
              <div className="w-14 h-14 rounded-xl flex items-center justify-center" style={{ background: colors.gradient }}>
                <Upload className="w-7 h-7 text-white" />
              </div>

              <div className="text-center">
                <p className="font-bold text-lg mb-1" style={{ color: "#111", fontFamily: "'Sora', sans-serif" }}>
                  {t.hero_drag_here}
                </p>
                <p className="text-sm" style={{ color: "#999" }}>{t.hero_or}</p>
              </div>

              <button className="flex items-center gap-2 px-8 py-4 rounded-xl font-bold text-white text-base transition-all hover:-translate-y-1 hover:shadow-xl active:scale-95"
                style={{ background: colors.gradient, boxShadow: `0 4px 15px ${colors.lightBg}` }}>
                <Upload className="w-5 h-5" />
                {t.hero_upload_btn}
                <ArrowRight className="w-5 h-5" />
              </button>

              <p className="text-xs" style={{ color: "#aaa" }}>{t.hero_max_size_detail}</p>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}

export default function EditorPage() {
  const { pendingFile, pendingTool, pendingPaywall, setPendingPaywall, isRestoringFromSession } = usePdfFile();
  const [, navigate] = useLocation();
  const { lang } = useLanguage();
  const isFileFree = pendingTool ? FILE_FREE_TOOLS.includes(pendingTool) : false;

  /* Editable filename */
  const [fileName, setFileName] = useState("document.pdf");
  const [isEditingName, setIsEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState("");
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (pendingFile) setFileName(pendingFile.name || "document.pdf"); }, [pendingFile]);
  useEffect(() => { if (isEditingName && nameInputRef.current) { nameInputRef.current.focus(); nameInputRef.current.select(); } }, [isEditingName]);

  const startEdit = () => { setEditNameValue(fileName.replace(/\.pdf$/i, "")); setIsEditingName(true); };
  const confirmEdit = () => { const t = editNameValue.trim(); if (t) setFileName(t.endsWith(".pdf") ? t : t + ".pdf"); setIsEditingName(false); };
  const handleClose = () => navigate(`/${lang}`);

  /* Loading state while restoring from session */
  if (isRestoringFromSession) {
    return (
      <div className="flex flex-col min-h-screen" style={{ backgroundColor: "oklch(0.97 0.005 250)" }}>
        <div className="flex items-center px-4 h-12 border-b" style={{ backgroundColor: "oklch(0.18 0.04 250)", borderColor: "oklch(0.25 0.04 250)" }}>
          <div className="flex items-center gap-1"><LogoSvg /><LogoText /></div>
        </div>
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center" style={{ color: "oklch(0.55 0.22 260)" }}>
            <div className="w-8 h-8 border-2 border-current border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm font-medium">Loading document...</p>
          </div>
        </div>
      </div>
    );
  }

  /* No file loaded — show upload zone */
  if (!pendingFile && !isFileFree && !pendingPaywall) {
    return <EditorUploadZone lang={lang} />;
  }

  return (
    <div className="flex flex-col" style={{ height: "100dvh", overflow: "hidden" }}>
      {/* ── Custom Editor Header Bar ── */}
      <div className="flex items-center justify-between px-3 md:px-4 h-11 md:h-12 shrink-0 border-b"
        style={{ backgroundColor: "oklch(0.18 0.04 250)", borderColor: "oklch(0.25 0.04 250)" }}>
        {/* Left: Logo */}
        <button onClick={handleClose} className="flex items-center gap-1 shrink-0 hover:opacity-80 transition-opacity" title="Back to home">
          <LogoSvg />
          <LogoText />
        </button>
        {/* Center: Editable filename */}
        <div className="flex items-center gap-1.5 min-w-0 max-w-[50%]">
          {isEditingName ? (
            <div className="flex items-center gap-1">
              <input ref={nameInputRef} type="text" value={editNameValue}
                onChange={e => setEditNameValue(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") confirmEdit(); if (e.key === "Escape") setIsEditingName(false); }}
                onBlur={confirmEdit}
                className="bg-white/10 text-white text-sm px-2 py-0.5 rounded border border-white/20 outline-none focus:border-white/40 min-w-[120px] max-w-[300px]"
                style={{ fontFamily: "'DM Sans', sans-serif" }} />
              <button onMouseDown={e => { e.preventDefault(); confirmEdit(); }} className="p-0.5 rounded hover:bg-white/10 transition-colors" title="Confirm">
                <Check className="w-3.5 h-3.5" style={{ color: "oklch(0.65 0.18 145)" }} />
              </button>
            </div>
          ) : (
            <button onClick={startEdit} className="flex items-center gap-1.5 min-w-0 hover:bg-white/5 rounded px-2 py-0.5 transition-colors group" title="Click to rename">
              <span className="text-sm font-medium truncate" style={{ color: "rgba(255,255,255,0.85)", fontFamily: "'DM Sans', sans-serif" }}>{fileName}</span>
              <Pencil className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: "rgba(255,255,255,0.5)" }} />
            </button>
          )}
        </div>
        {/* Right: Close */}
        <button onClick={handleClose} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors shrink-0" title="Close editor">
          <XIcon className="w-5 h-5" style={{ color: "rgba(255,255,255,0.7)" }} />
        </button>
      </div>

      {/* Full-screen editor */}
      <div className="flex-1 overflow-hidden">
        <PdfEditor
          initialFile={pendingFile ?? undefined}
          initialTool={pendingTool ?? undefined}
          initialOpenPaywall={pendingPaywall}
          onPaywallOpened={() => setPendingPaywall(false)}
          fullscreen
          onFileNameChange={setFileName}
          displayName={fileName}
        />
      </div>
    </div>
  );
}
