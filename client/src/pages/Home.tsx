/* =============================================================
   PDFPro Home Page — Professional & Trustworthy Design
   Light theme, indigo-violet accents, upload-first hero,
   social proof, testimonials, security section, tools, FAQ
   ============================================================= */

import { useState, useRef, useCallback, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  FileText, PenTool, Share2, MessageSquare, Type, Image, Lock,
  ChevronDown, ChevronUp, ArrowRight, Upload, Download, Edit3,
  Layers, Shield, Zap, Monitor, CheckCircle2, RefreshCw, Sparkles,
  Star, Trash2, Clock, Globe, Cloud, Users, FileLock2, Check, Merge,
  Scissors, RotateCcw, Minimize2, FileImage, FileSpreadsheet,
  Presentation, FileCode,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { usePdfFile } from "@/contexts/PdfFileContext";
import { useLanguage } from "@/contexts/LanguageContext";

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

// ─── Design tokens ───────────────────────────────────────────
const INDIGO     = "oklch(0.47 0.24 264)";
const VIOLET     = "oklch(0.42 0.26 290)";
const TEXT_MAIN  = "oklch(0.13 0.015 264)";
const TEXT_MUTED = "oklch(0.48 0.015 264)";
const TEXT_LIGHT = "oklch(0.62 0.015 264)";
const BORDER     = "oklch(0.91 0.008 264)";
const SURFACE    = "oklch(0.985 0.003 264)";

const GRAD = `linear-gradient(135deg, ${INDIGO}, ${VIOLET})`;

// ─── Tool definitions ─────────────────────────────────────────
const TOOLS_EDIT = [
  { icon: Type,           label_key: "tool_edit_text",  tool: "text",         color: "oklch(0.96 0.03 264)", iconColor: INDIGO },
  { icon: PenTool,        label_key: "tool_add_sign",   tool: "sign",         color: "oklch(0.96 0.03 264)", iconColor: INDIGO },
  { icon: MessageSquare,  label_key: "tool_annotate",   tool: "notes",        color: "oklch(0.96 0.03 264)", iconColor: INDIGO },
  { icon: Image,          label_key: "tool_images",     tool: "image",        color: "oklch(0.96 0.03 264)", iconColor: INDIGO },
  { icon: Lock,           label_key: "tool_protect",    tool: "protect",      color: "oklch(0.96 0.03 264)", iconColor: INDIGO },
  { icon: Merge,          label_key: "tool_merge",      tool: "merge",        color: "oklch(0.96 0.03 264)", iconColor: INDIGO },
  { icon: Scissors,       label_key: "tool_split",      tool: "split",        color: "oklch(0.96 0.03 264)", iconColor: INDIGO },
  { icon: RotateCcw,      label_key: "tool_rotate",     tool: "rotate",       color: "oklch(0.96 0.03 264)", iconColor: INDIGO },
  { icon: Minimize2,      label_key: "tool_compress",   tool: "compress",     color: "oklch(0.96 0.03 264)", iconColor: INDIGO },
];
const TOOLS_FROM_PDF = [
  { icon: FileText,        label_key: "tool_pdf_word",  tool: "convert-word",  color: "oklch(0.96 0.04 220)", iconColor: "oklch(0.40 0.22 220)" },
  { icon: FileSpreadsheet, label_key: "tool_pdf_excel", tool: "convert-excel", color: "oklch(0.96 0.04 220)", iconColor: "oklch(0.40 0.22 220)" },
  { icon: Presentation,    label_key: "tool_pdf_ppt",   tool: "convert-ppt",   color: "oklch(0.96 0.04 220)", iconColor: "oklch(0.40 0.22 220)" },
  { icon: FileImage,       label_key: "tool_pdf_jpg",   tool: "convert-jpg",   color: "oklch(0.96 0.04 220)", iconColor: "oklch(0.40 0.22 220)" },
  { icon: FileImage,       label_key: "tool_pdf_png",   tool: "convert-png",   color: "oklch(0.96 0.04 220)", iconColor: "oklch(0.40 0.22 220)" },
  { icon: FileCode,        label_key: "tool_pdf_html",  tool: "convert-html",  color: "oklch(0.96 0.04 220)", iconColor: "oklch(0.40 0.22 220)" },
];
const TOOLS_TO_PDF = [
  { icon: FileText,        label_key: "tool_word_pdf",  tool: "word-to-pdf",  color: "oklch(0.96 0.05 145)", iconColor: "oklch(0.42 0.18 145)" },
  { icon: FileSpreadsheet, label_key: "tool_excel_pdf", tool: "excel-to-pdf", color: "oklch(0.96 0.05 145)", iconColor: "oklch(0.42 0.18 145)" },
  { icon: Presentation,    label_key: "tool_ppt_pdf",   tool: "ppt-to-pdf",   color: "oklch(0.96 0.05 145)", iconColor: "oklch(0.42 0.18 145)" },
  { icon: FileImage,       label_key: "tool_jpg_pdf",   tool: "jpg-to-pdf",   color: "oklch(0.96 0.05 145)", iconColor: "oklch(0.42 0.18 145)" },
  { icon: FileImage,       label_key: "tool_png_pdf",   tool: "png-to-pdf",   color: "oklch(0.96 0.05 145)", iconColor: "oklch(0.42 0.18 145)" },
  { icon: FileCode,        label_key: "tool_html_pdf",  tool: "html-to-pdf",  color: "oklch(0.96 0.05 145)", iconColor: "oklch(0.42 0.18 145)" },
];

const FILE_FREE_TOOLS = ["jpg-to-pdf", "png-to-pdf", "word-to-pdf", "excel-to-pdf", "ppt-to-pdf", "html-to-pdf"];

// ─── Testimonials ─────────────────────────────────────────────
const TESTIMONIALS_META = [
  { name: "María García",      avatar: "MG", avatarColor: "oklch(0.55 0.18 264)", textKey: "testimonial1_text", roleKey: "testimonial1_role" },
  { name: "Carlos Rodríguez",  avatar: "CR", avatarColor: "oklch(0.48 0.18 145)", textKey: "testimonial2_text", roleKey: "testimonial2_role" },
  { name: "Ana Martínez",      avatar: "AM", avatarColor: "oklch(0.52 0.20 30)",  textKey: "testimonial3_text", roleKey: "testimonial3_role" },
];

export default function Home() {
  const [activeTab, setActiveTab] = useState<"edit" | "fromPdf" | "toPdf">("edit");
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [docsCount, setDocsCount] = useState(3847);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { setPendingFile, setPendingTool } = usePdfFile();
  const { lang, t } = useLanguage();
  const [, navigate] = useLocation();

  // Animated counter: +1 to +8 every 0.5-1s randomly
  useEffect(() => {
    const tick = () => {
      setDocsCount((c) => c + 1 + Math.floor(Math.random() * 8));
      const next = 500 + Math.random() * 500;
      timer = window.setTimeout(tick, next);
    };
    let timer = window.setTimeout(tick, 800);
    return () => clearTimeout(timer);
  }, []);

  const toolsMap = { edit: TOOLS_EDIT, fromPdf: TOOLS_FROM_PDF, toPdf: TOOLS_TO_PDF };
  const activeTools = toolsMap[activeTab].map((tool) => ({
    ...tool,
    label: (t as any)[tool.label_key] ?? tool.label_key,
  }));

  const faqs = [
    { question: t.faq_q1, answer: t.faq_a1 },
    { question: t.faq_q2, answer: t.faq_a2 },
    { question: t.faq_q3, answer: t.faq_a3 },
    { question: t.faq_q4, answer: t.faq_a4 },
    { question: t.faq_q5, answer: t.faq_a5 },
    { question: t.faq_q6, answer: t.faq_a6 },
    { question: t.faq_q7, answer: t.faq_a7 },
  ];

  const openEditor = useCallback((file: File, tool?: string) => {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    const isSupported = ACCEPTED_MIME_TYPES.has(file.type) || ACCEPTED_EXTENSIONS.has(ext);
    if (!isSupported) {
      import('sonner').then(({ toast }) => {
        toast.error('Formato no soportado. Sube un PDF, Word, Excel, PowerPoint, JPG o PNG.');
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setPendingFile(file);
    if (tool) setPendingTool(tool);
    navigate(`/${lang}/editor`);
  }, [setPendingFile, setPendingTool, navigate, lang]);

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

  const scrollToEditor = (tool?: string) => {
    if (tool) {
      setPendingTool(tool);
      if (FILE_FREE_TOOLS.includes(tool)) {
        navigate(`/${lang}/editor`);
      } else {
        fileInputRef.current?.click();
      }
    } else {
      fileInputRef.current?.click();
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <Navbar />

      {/* ══════════════════════════════════════════════════════════
          HERO
      ══════════════════════════════════════════════════════════ */}
      <section className="relative overflow-hidden bg-white">
        {/* Background decoration */}
        <div className="absolute inset-0 pointer-events-none">
          <div
            className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full opacity-[0.07]"
            style={{ background: `radial-gradient(circle, ${INDIGO} 0%, transparent 70%)` }}
          />
          <div
            className="absolute -top-20 right-0 w-[400px] h-[400px] rounded-full opacity-[0.05]"
            style={{ background: `radial-gradient(circle, ${VIOLET} 0%, transparent 70%)` }}
          />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.025]"
            style={{
              backgroundImage: `linear-gradient(oklch(0.47 0.24 264) 1px, transparent 1px), linear-gradient(90deg, oklch(0.47 0.24 264) 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="container relative z-10 pt-8 pb-0 md:pt-12">
          {/* Headline */}
          <div className="text-center max-w-3xl mx-auto mb-4">
            <h1
              className="text-4xl md:text-5xl lg:text-[3.6rem] font-extrabold leading-[1.12] mb-5 tracking-tight"
              style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
            >
              {t.hero_title_1}{" "}
              <span
                style={{
                  background: GRAD,
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                {t.hero_title_2}
              </span>
            </h1>
            <p
              className="text-base md:text-lg max-w-xl mx-auto leading-relaxed"
              style={{ color: TEXT_MUTED }}
            >
              {t.hero_subtitle}
            </p>
          </div>

          {/* Social proof row */}
          <div className="flex flex-wrap justify-center items-center gap-x-6 gap-y-2 mb-8 text-xs" style={{ color: TEXT_MUTED }}>
            <span className="flex items-center gap-1.5">
              <span className="flex">
                {[...Array(5)].map((_, i) => (
                  <Star key={i} className="w-3.5 h-3.5 fill-current" style={{ color: "oklch(0.70 0.18 85)" }} />
                ))}
              </span>
              <strong style={{ color: TEXT_MAIN }}>4.8/5</strong>
              <span style={{ color: TEXT_LIGHT }}>{(t as any).hero_social_rating ?? "Valoración media"}</span>
            </span>
            <span className="w-px h-3 rounded-full" style={{ backgroundColor: BORDER }} />
            <span className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" style={{ color: INDIGO }} />
              <strong style={{ color: TEXT_MAIN }}>2.3M+</strong>
              <span style={{ color: TEXT_LIGHT }}>{(t as any).hero_social_users ?? "usuarios activos"}</span>
            </span>
          </div>

          {/* Upload zone — wide, rectangular, clean */}
          <div className="max-w-3xl mx-auto w-full">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.html,.txt"
              className="hidden"
              onChange={handleFileInput}
            />

            <div
              onDragOver={(e) => { e.preventDefault(); setIsDraggingOver(true); }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="cursor-pointer rounded-2xl border-2 border-dashed transition-all duration-300"
              style={{
                borderColor: isDraggingOver ? INDIGO : "oklch(0.47 0.24 264 / 0.28)",
                backgroundColor: isDraggingOver ? "oklch(0.97 0.02 264)" : "white",
                boxShadow: isDraggingOver
                  ? `0 0 0 5px oklch(0.47 0.24 264 / 0.08), 0 12px 48px oklch(0.47 0.24 264 / 0.12)`
                  : "0 4px 32px oklch(0.13 0.015 264 / 0.07), 0 1px 4px oklch(0.13 0.015 264 / 0.04)",
              }}
            >
              {/* Main content: icon → text → button, centrado vertical */}
              <div className="flex flex-col items-center gap-5 px-8 py-10">
                {/* Icon */}
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center"
                  style={{ background: GRAD, boxShadow: `0 8px 24px oklch(0.47 0.24 264 / 0.28)` }}
                >
                  <FileText className="w-8 h-8 text-white" />
                </div>

                {/* Text */}
                <div className="text-center">
                  <p
                    className="font-bold text-lg mb-1"
                    style={{ color: TEXT_MAIN, fontFamily: "'Sora', sans-serif" }}
                  >
                    {t.hero_drag_here}
                  </p>
                  <p className="text-sm" style={{ color: TEXT_LIGHT }}>
                    {t.hero_auto_convert}
                  </p>
                </div>

                {/* CTA button */}
                <button
                  className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white text-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
                  style={{ background: GRAD, boxShadow: `0 4px 16px oklch(0.47 0.24 264 / 0.35)` }}
                  onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
                >
                  <Upload className="w-4 h-4" />
                  {t.hero_upload_btn}
                  <ArrowRight className="w-4 h-4" />
                </button>
                <p className="text-xs" style={{ color: TEXT_LIGHT }}>{t.hero_max_size}</p>
              </div>

              {/* Bottom bar: formats only */}
              <div
                className="flex flex-wrap items-center justify-center gap-1.5 px-8 py-3 border-t"
                style={{ borderColor: "oklch(0.47 0.24 264 / 0.10)", backgroundColor: SURFACE }}
              >
                {["PDF", "Word", "Excel", "PPT", "JPG", "PNG"].map((fmt) => (
                  <span
                    key={fmt}
                    className="text-xs px-2 py-0.5 rounded-md font-medium border"
                    style={{ backgroundColor: "white", borderColor: BORDER, color: TEXT_MUTED }}
                  >
                    {fmt}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Stats — dentro del hero, debajo de la upload zone */}
          <div className="max-w-3xl mx-auto w-full mt-8 pb-12">
            <div
              className="grid grid-cols-2 md:grid-cols-4 rounded-2xl border"
              style={{ borderColor: "oklch(0.91 0.012 264)", backgroundColor: "oklch(0.975 0.008 264)", borderRadius: "1rem" }}
            >
              {[
                { value: "15+",   label: (t as any).hero_social_tools ?? "Herramientas PDF", icon: Sparkles },
                { value: docsCount.toLocaleString(), label: (t as any).hero_social_pdfs ?? "Documentos procesados hoy", icon: FileText },
                { value: "4.8★",  label: (t as any).hero_social_rating ?? "Valoración media", icon: Star },
                { value: "100%",  label: (t as any).hero_social_install ?? "Sin instalación", icon: Cloud },
              ].map((stat, i) => (
                <div
                  key={i}
                  className="flex flex-col items-center gap-0.5 px-4 py-4 text-center border-r last:border-r-0"
                  style={{ borderColor: "oklch(0.88 0.012 264)" }}
                >
                  <stat.icon className="w-4 h-4 mb-0.5" style={{ color: INDIGO, opacity: 0.45 }} />
                  <div
                    className="text-xl md:text-2xl font-extrabold leading-none"
                    style={{
                      fontFamily: "'Sora', sans-serif",
                      background: GRAD,
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    }}
                  >
                    {stat.value}
                  </div>
                  <div className="text-xs font-medium mt-0.5" style={{ color: TEXT_MUTED }}>
                    {stat.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          TOOLS SECTION
      ══════════════════════════════════════════════════════════ */}
      <section id="tools" className="py-16 md:py-20 bg-white">
        <div className="container">
          <div className="text-center mb-10">
            <h2
              className="text-3xl md:text-4xl font-bold mb-3"
              style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
            >
              {t.tools_title}
            </h2>
            <p className="text-base max-w-lg mx-auto" style={{ color: TEXT_MUTED }}>
              {t.tools_subtitle}
            </p>
          </div>

          {/* Category tabs */}
          <div className="flex justify-center mb-8">
            <div
              className="flex rounded-2xl p-1 gap-1 border"
              style={{ backgroundColor: SURFACE, borderColor: BORDER }}
            >
              {[
                { id: "edit" as const,    label: t.tools_tab_edit,     color: INDIGO },
                { id: "fromPdf" as const, label: t.tools_tab_from_pdf, color: "oklch(0.40 0.22 220)" },
                { id: "toPdf" as const,   label: t.tools_tab_to_pdf,   color: "oklch(0.42 0.18 145)" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setActiveTab(cat.id)}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200"
                  style={{
                    backgroundColor: activeTab === cat.id ? "white" : "transparent",
                    color: activeTab === cat.id ? cat.color : TEXT_MUTED,
                    boxShadow: activeTab === cat.id
                      ? "0 1px 6px oklch(0.13 0.015 264 / 0.10), 0 0 0 1px oklch(0.91 0.008 264)"
                      : "none",
                    fontWeight: activeTab === cat.id ? "600" : "400",
                  }}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Tool grid */}
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3 mb-10">
            {activeTools.map((tool, i) => (
              <button
                key={i}
                className="group flex flex-col items-center gap-3 p-4 rounded-xl border text-center transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
                style={{
                  backgroundColor: "white",
                  borderColor: BORDER,
                }}
                onClick={() => scrollToEditor(tool.tool)}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-200 group-hover:scale-110"
                  style={{ backgroundColor: tool.color }}
                >
                  <tool.icon className="w-6 h-6" style={{ color: tool.iconColor }} />
                </div>
                <span className="text-xs font-medium leading-tight" style={{ color: TEXT_MAIN }}>
                  {tool.label}
                </span>
              </button>
            ))}
          </div>

          <div className="text-center">
            <button
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-white font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5 active:scale-95"
              style={{ background: GRAD, boxShadow: `0 4px 16px oklch(0.47 0.24 264 / 0.30)` }}
              onClick={() => scrollToEditor()}
            >
              <Upload className="w-4 h-4" />
              {t.tools_cta}
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          HOW IT WORKS
      ══════════════════════════════════════════════════════════ */}
      <section id="how-it-works" className="py-16 md:py-20" style={{ backgroundColor: SURFACE }}>
        <div className="container">
          <div className="text-center mb-12">
            <h2
              className="text-3xl md:text-4xl font-bold mb-3"
              style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
            >
              {t.how_title}
            </h2>
            <p className="text-base" style={{ color: TEXT_MUTED }}>{t.how_subtitle}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { step: "01", icon: Upload,   title: t.how_step1_title, desc: t.how_step1_desc, grad: GRAD },
              { step: "02", icon: Edit3,    title: t.how_step2_title, desc: t.how_step2_desc, grad: "linear-gradient(135deg, oklch(0.42 0.18 145), oklch(0.48 0.20 165))" },
              { step: "03", icon: Download, title: t.how_step3_title, desc: t.how_step3_desc, grad: "linear-gradient(135deg, oklch(0.55 0.20 80), oklch(0.50 0.18 100))" },
            ].map((item, i) => (
              <div
                key={i}
                className="relative flex flex-col gap-5 p-7 rounded-2xl bg-white border hover:shadow-md transition-shadow duration-300"
                style={{ borderColor: BORDER }}
              >
                {/* Step number background */}
                <div
                  className="absolute top-5 right-5 text-6xl font-black leading-none select-none"
                  style={{
                    fontFamily: "'Sora', sans-serif",
                    color: "oklch(0.13 0.015 264 / 0.04)",
                  }}
                >
                  {item.step}
                </div>

                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{ background: item.grad, boxShadow: `0 6px 20px oklch(0.47 0.24 264 / 0.25)` }}
                >
                  <item.icon className="w-7 h-7 text-white" />
                </div>

                <div>
                  <h3
                    className="font-bold text-base mb-2"
                    style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
                  >
                    {item.title}
                  </h3>
                  <p className="text-sm leading-relaxed" style={{ color: TEXT_MUTED }}>
                    {item.desc}
                  </p>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-center mt-10">
            <button
              className="inline-flex items-center gap-2 px-8 py-3 rounded-xl text-white font-semibold text-sm transition-all duration-200 hover:-translate-y-0.5"
              style={{ background: GRAD, boxShadow: `0 4px 16px oklch(0.47 0.24 264 / 0.30)` }}
              onClick={() => scrollToEditor()}
            >
              <Upload className="w-4 h-4" />
              {t.how_cta}
            </button>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          BENEFITS — 4 cards
      ══════════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container">
          <div className="text-center mb-12">
            <h2
              className="text-3xl md:text-4xl font-bold"
              style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
            >
              {t.benefits_title}
            </h2>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: Zap,
                title: t.benefit1_title,
                desc: t.benefit1_desc,
                color: "oklch(0.96 0.06 80)",
                iconColor: "oklch(0.55 0.20 80)",
                points: [(t as any).benefit1_point1, (t as any).benefit1_point2, (t as any).benefit1_point3],
              },
              {
                icon: Shield,
                title: t.benefit2_title,
                desc: t.benefit2_desc,
                color: "oklch(0.96 0.05 145)",
                iconColor: "oklch(0.42 0.18 145)",
                points: [(t as any).benefit2_point1, (t as any).benefit2_point2, (t as any).benefit2_point3],
              },
              {
                icon: Edit3,
                title: t.benefit3_title,
                desc: t.benefit3_desc,
                color: "oklch(0.96 0.03 264)",
                iconColor: INDIGO,
                points: [(t as any).benefit3_point1, (t as any).benefit3_point2, (t as any).benefit3_point3],
              },
              {
                icon: Monitor,
                title: t.benefit4_title,
                desc: t.benefit4_desc,
                color: "oklch(0.96 0.06 290)",
                iconColor: VIOLET,
                points: [(t as any).benefit4_point1, (t as any).benefit4_point2, (t as any).benefit4_point3],
              },
            ].map((b, i) => (
              <div
                key={i}
                className="flex flex-col gap-4 p-6 rounded-2xl border bg-white hover:shadow-md transition-all duration-300 hover:-translate-y-0.5"
                style={{ borderColor: BORDER }}
              >
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: b.color }}
                >
                  <b.icon className="w-6 h-6" style={{ color: b.iconColor }} />
                </div>
                <div>
                  <h3
                    className="font-bold text-base mb-2"
                    style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
                  >
                    {b.title}
                  </h3>
                  <p className="text-sm leading-relaxed mb-3" style={{ color: TEXT_MUTED }}>
                    {b.desc}
                  </p>
                  <ul className="space-y-1.5">
                    {b.points.map((point, j) => (
                      <li key={j} className="flex items-center gap-2 text-xs" style={{ color: TEXT_MUTED }}>
                        <Check className="w-3.5 h-3.5 flex-shrink-0" style={{ color: b.iconColor }} />
                        {point}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          TESTIMONIALS
      ══════════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-20" style={{ backgroundColor: SURFACE }}>
        <div className="container">
          <div className="text-center mb-10">
            <div className="flex justify-center items-center gap-1 mb-3">
              {[...Array(5)].map((_, i) => (
                <Star key={i} className="w-5 h-5 fill-current" style={{ color: "oklch(0.70 0.18 85)" }} />
              ))}
            </div>
            <h2
              className="text-3xl md:text-4xl font-bold mb-2"
              style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
            >
              {(t as any).testimonials_title}
            </h2>
            <p className="text-base" style={{ color: TEXT_MUTED }}>
              {(t as any).testimonials_subtitle}
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {TESTIMONIALS_META.map((tm, i) => (
              <div
                key={i}
                className="flex flex-col gap-4 p-6 rounded-2xl bg-white border hover:shadow-md transition-all duration-300"
                style={{ borderColor: BORDER }}
              >
                {/* Stars */}
                <div className="flex items-center gap-0.5">
                  {[...Array(5)].map((_, j) => (
                    <Star key={j} className="w-4 h-4 fill-current" style={{ color: "oklch(0.70 0.18 85)" }} />
                  ))}
                </div>

                {/* Quote */}
                <p className="text-sm leading-relaxed flex-1" style={{ color: TEXT_MUTED }}>
                  "{(t as any)[tm.textKey]}"
                </p>

                {/* Author */}
                <div className="flex items-center gap-3 pt-2 border-t" style={{ borderColor: BORDER }}>
                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0"
                    style={{ background: tm.avatarColor }}
                  >
                    {tm.avatar}
                  </div>
                  <div>
                    <div className="text-sm font-semibold" style={{ color: TEXT_MAIN }}>
                      {tm.name}
                    </div>
                    <div className="text-xs" style={{ color: TEXT_LIGHT }}>
                      {(t as any)[tm.roleKey]}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          SECURITY & PRIVACY TRUST SECTION
      ══════════════════════════════════════════════════════════ */}
      <section className="py-16 md:py-20 bg-white">
        <div className="container max-w-4xl mx-auto">
          <div className="rounded-2xl border overflow-hidden" style={{ borderColor: BORDER }}>
            {/* Header */}
            <div
              className="px-8 py-6 flex items-center gap-4 border-b"
              style={{ backgroundColor: "oklch(0.97 0.015 264)", borderColor: BORDER }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: GRAD }}
              >
                <FileLock2 className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2
                  className="text-xl font-bold"
                  style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
                >
                  {(t as any).security_title}
                </h2>
                <p className="text-sm" style={{ color: TEXT_MUTED }}>
                  {(t as any).security_subtitle}
                </p>
              </div>
            </div>

            {/* Trust points grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x" style={{ borderColor: BORDER }}>
              {[
                {
                  icon: Shield,
                  title: (t as any).security_ssl_title,
                  desc: (t as any).security_ssl_desc,
                  color: "oklch(0.42 0.18 145)",
                },
                {
                  icon: Trash2,
                  title: (t as any).security_delete_title,
                  desc: (t as any).security_delete_desc,
                  color: "oklch(0.55 0.20 80)",
                },
                {
                  icon: Globe,
                  title: (t as any).security_privacy_title,
                  desc: (t as any).security_privacy_desc,
                  color: INDIGO,
                },
              ].map((item, i) => (
                <div key={i} className="flex gap-4 items-start p-6">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
                    style={{ backgroundColor: `${item.color}18` }}
                  >
                    <item.icon className="w-5 h-5" style={{ color: item.color }} />
                  </div>
                  <div>
                    <h3
                      className="font-semibold text-sm mb-1"
                      style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
                    >
                      {item.title}
                    </h3>
                    <p className="text-xs leading-relaxed" style={{ color: TEXT_MUTED }}>
                      {item.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FAQ
      ══════════════════════════════════════════════════════════ */}
      <section id="faq" className="py-16 md:py-20" style={{ backgroundColor: SURFACE }}>
        <div className="container max-w-2xl mx-auto">
          <div className="text-center mb-12">
            <h2
              className="text-3xl md:text-4xl font-bold"
              style={{ fontFamily: "'Sora', sans-serif", color: TEXT_MAIN }}
            >
              {t.faq_title}
            </h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="rounded-2xl overflow-hidden border transition-all duration-200"
                style={{
                  borderColor: openFaq === i ? "oklch(0.47 0.24 264 / 0.30)" : BORDER,
                  backgroundColor: "white",
                  boxShadow: openFaq === i ? "0 4px 20px oklch(0.47 0.24 264 / 0.06)" : "none",
                }}
              >
                <button
                  className="w-full flex items-center justify-between px-5 py-4 text-left gap-4"
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <span
                    className="font-semibold text-sm"
                    style={{ color: TEXT_MAIN, fontFamily: "'Sora', sans-serif" }}
                  >
                    {faq.question}
                  </span>
                  <div
                    className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center transition-all"
                    style={{
                      backgroundColor: openFaq === i ? "oklch(0.96 0.03 264)" : SURFACE,
                    }}
                  >
                    {openFaq === i
                      ? <ChevronUp className="w-4 h-4" style={{ color: INDIGO }} />
                      : <ChevronDown className="w-4 h-4" style={{ color: TEXT_LIGHT }} />
                    }
                  </div>
                </button>
                {openFaq === i && (
                  <div className="px-5 pb-4 text-sm leading-relaxed" style={{ color: TEXT_MUTED }}>
                    {faq.answer}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══════════════════════════════════════════════════════════
          FINAL CTA
      ══════════════════════════════════════════════════════════ */}
      <section className="relative py-16 md:py-24 overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(135deg, oklch(0.40 0.24 264) 0%, oklch(0.36 0.26 290) 60%, oklch(0.32 0.22 305) 100%)`,
          }}
        />
        {/* Decorations */}
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          <div
            className="absolute -top-24 -right-24 w-96 h-96 rounded-full opacity-[0.12]"
            style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }}
          />
          <div
            className="absolute -bottom-16 -left-16 w-72 h-72 rounded-full opacity-[0.07]"
            style={{ background: "radial-gradient(circle, white 0%, transparent 70%)" }}
          />
          {/* Grid pattern on CTA */}
          <div
            className="absolute inset-0 opacity-[0.06]"
            style={{
              backgroundImage: `linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)`,
              backgroundSize: "40px 40px",
            }}
          />
        </div>

        <div className="container relative z-10 text-center">
          {/* Stars */}
          <div className="flex justify-center items-center gap-1 mb-5">
            {[...Array(5)].map((_, i) => (
              <Star key={i} className="w-5 h-5 fill-current" style={{ color: "oklch(0.80 0.18 85)" }} />
            ))}
            <span className="ml-2 text-sm font-medium" style={{ color: "oklch(0.85 0.05 264)" }}>
              4.8/5 · 2.3M usuarios
            </span>
          </div>

          <h2
            className="text-3xl md:text-5xl font-extrabold text-white mb-4 tracking-tight"
            style={{ fontFamily: "'Sora', sans-serif" }}
          >
            {t.cta_title}
          </h2>
          <p
            className="text-base md:text-lg mb-10 max-w-lg mx-auto leading-relaxed"
            style={{ color: "oklch(0.83 0.05 264)" }}
          >
            {t.cta_subtitle}
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              className="inline-flex items-center gap-2.5 px-10 py-4 rounded-xl font-bold text-sm transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl active:scale-95"
              style={{
                backgroundColor: "white",
                color: INDIGO,
                boxShadow: "0 8px 32px oklch(0 0 0 / 0.22)",
              }}
              onClick={() => scrollToEditor()}
            >
              <Upload className="w-5 h-5" />
              {t.cta_btn}
              <ArrowRight className="w-5 h-5" />
            </button>

            <div
              className="flex items-center gap-2 text-sm rounded-xl px-5 py-3"
              style={{ color: "oklch(0.78 0.05 264)" }}
            >
              <Globe className="w-4 h-4" style={{ color: "oklch(0.75 0.16 145)" }} />
              {(t as any).cta_no_card ?? "100% Online · Sin instalación"}
            </div>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  );
}
