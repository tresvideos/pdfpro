/* =============================================================
   CloudPDF PdfEditor — Professional PDF editor layout
   Top toolbar | Left thumbnails | Center viewer | Right tool panel
   All tools functional: sign, text, highlight, compress, convert, protect
   ============================================================= */
import React, { useState, useRef, useCallback, useEffect } from "react";
import SignatureCanvas from "./SignatureCanvas";
import { toast } from "sonner";
import { useLocation } from "wouter";
import {
  Download, ChevronLeft, ChevronRight, ZoomIn, ZoomOut,
  Undo2, Redo2, PenTool, Type, Highlighter, Eraser, Brush,
  Image as ImageIcon, MousePointer, Shapes, Search, Shield,
  Minimize2, Move, StickyNote, FileText, Trash2, RotateCw,
  Plus, Scissors, Layers, X, Upload, Check, Eye, EyeOff,
  AlignLeft, Bold, Italic, Underline, ChevronDown, Lock, Unlock,
  Save, CheckCircle, Info,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PaywallModal from "./PaywallModal";
import { encryptPDF } from "@pdfsmaller/pdf-encrypt-lite";
import { useLanguage } from "@/contexts/LanguageContext";
import { usePdfFile } from "@/contexts/PdfFileContext";
// Polyfill Uint8Array.prototype.toHex (TC39 proposal) — needed by pdfjs-dist v5+
// Some browsers (Chromium < 140, Firefox, Safari) don't support it yet.
if (typeof (Uint8Array.prototype as any)["toHex"] !== "function") {
  (Uint8Array.prototype as any)["toHex"] = function () {
    return Array.from(this as Uint8Array)
      .map((b: number) => b.toString(16).padStart(2, "0"))
      .join("");
  };
}
if (typeof (Uint8Array.prototype as any)["setFromHex"] !== "function") {
  (Uint8Array.prototype as any)["setFromHex"] = function (hexString: string) {
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }
    this.set(bytes);
    return { read: hexString.length, written: bytes.length };
  };
}
if (typeof (Uint8Array as any)["fromHex"] !== "function") {
  (Uint8Array as any)["fromHex"] = function (hexString: string) {
    const bytes = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      bytes[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }
    return bytes;
  };
}
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import { PDFDocument, PDFDict, PDFName, PDFRef, PDFStream, rgb, StandardFonts, degrees } from "pdf-lib";

// Browser-safe base64 encoder for Uint8Array (replaces Node.js Buffer.from().toString('base64'))
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// Configure PDF.js worker — use local worker served by Vite to avoid CDN version mismatches
// The worker file is copied to public/ by vite.config.ts so it's available at /pdf.worker.min.mjs
pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  import.meta.url
).href;

// ── Font options ──────────────────────────────────────────────
const FONT_OPTIONS = [
  { value: "Arial, sans-serif", label: "Arial" },
  { value: "'Times New Roman', serif", label: "Times New Roman" },
  { value: "'Courier New', monospace", label: "Courier New" },
  { value: "Georgia, serif", label: "Georgia" },
  { value: "Verdana, sans-serif", label: "Verdana" },
  { value: "Helvetica, sans-serif", label: "Helvetica" },
  { value: "'Trebuchet MS', sans-serif", label: "Trebuchet MS" },
  { value: "'Comic Sans MS', cursive", label: "Comic Sans" },
];

// ── Types ─────────────────────────────────────────────────────
type ToolName =
  | "pointer" | "sign" | "text" | "edit-text" | "highlight"
  | "eraser" | "brush" | "image" | "shapes" | "find"
  | "protect" | "compress" | "move" | "notes" | "none"
  | "convert-jpg" | "convert-png" | "convert-word" | "convert-excel" | "convert-ppt" | "convert-html"
  | "word-to-pdf" | "excel-to-pdf" | "ppt-to-pdf" | "jpg-to-pdf" | "png-to-pdf" | "merge";

interface NativeTextBlock {
  id: string;
  str: string;
  editedStr?: string; // if set, this replaces str on export
  // Canvas pixel coordinates (for overlay display)
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number; // font size in canvas pixels
  // PDF point coordinates (for export) — stored separately to avoid scale confusion
  pdfX: number;      // x in PDF points
  pdfY: number;      // y baseline in PDF points (from bottom of page)
  pdfWidth: number;  // width in PDF points
  pdfFontSize: number; // font size in PDF points
  pageHeight: number; // page height in PDF points
  page: number; // 1-indexed page number
  fontColor?: string; // hex color e.g. "#000000"
}

interface Annotation {
  id: string;
  type: "signature" | "text" | "highlight" | "note" | "shape" | "image" | "drawing" | "eraser" | "textEdit";
  dataUrl?: string;
  text?: string;
  x: number; y: number;
  width: number; height: number;
  page: number;
  color?: string;
  fontSize?: number;
  fontFamily?: string;
  opacity?: number;
  rotation?: number;
  points?: { x: number; y: number }[];
  strokeWidth?: number;
}

interface HistoryEntry {
  annotations: Annotation[];
  pages: number[];
}

// ── Toolbar button ─────────────────────────────────────────────
function ToolBtn({
  icon: Icon, label, active, onClick, disabled,
}: {
  icon: React.ElementType; label: string; active?: boolean;
  onClick: () => void; disabled?: boolean;
}) {
  return (
    <button
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex flex-col items-center gap-0.5 px-2 py-1.5 rounded transition-all text-xs select-none"
      style={{
        color: active ? "oklch(0.55 0.22 260)" : "oklch(0.35 0.02 250)",
        backgroundColor: active ? "oklch(0.55 0.22 260 / 0.10)" : "transparent",
        opacity: disabled ? 0.4 : 1,
        minWidth: 48,
      }}
      onMouseEnter={(e) => {
        if (!active && !disabled)
          e.currentTarget.style.backgroundColor = "oklch(0.55 0.22 260 / 0.06)";
      }}
      onMouseLeave={(e) => {
        if (!active)
          e.currentTarget.style.backgroundColor = "transparent";
      }}
    >
      <Icon className="w-4 h-4" />
      <span style={{ fontSize: 10 }}>{label}</span>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────
export default function PdfEditor({ initialTool, initialFile, fullscreen, initialOpenPaywall, onPaywallOpened, onFileNameChange, displayName }: { initialTool?: string; initialFile?: File; fullscreen?: boolean; initialOpenPaywall?: boolean; onPaywallOpened?: () => void; onFileNameChange?: (name: string) => void; displayName?: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null); // eslint-disable-line
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.2);
  const [activeTool, setActiveTool] = useState<ToolName>("edit-text");
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [thumbnails, setThumbnails] = useState<string[]>([]);
  const [showPaywall, setShowPaywall] = useState(false);
  const paywallOpenedRef = useRef(false);
  const [pdfDataForPaywall, setPdfDataForPaywall] = useState<{ base64: string; name: string; size: number } | undefined>(undefined);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const annotationsRef = useRef<Annotation[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState({ x: 0, y: 0 });

  // Sign tool state
  // isSignDrawing is tracked ONLY via ref to avoid re-renders that would remount the canvas
  const isSignDrawingRef = useRef(false);
  const signLastPoint = useRef<{ x: number; y: number } | null>(null); // Track last point for smooth drawing
  const signCanvasRef = useRef<HTMLCanvasElement>(null);
  const [signTab, setSignTab] = useState<"draw" | "write" | "image">("draw"); // draw, write, or image
  const [signColor, setSignColor] = useState("#1a237e"); // draw tab color
  const [signStrokeWidth, setSignStrokeWidth] = useState(2.5); // draw tab stroke width
  const [signName, setSignName] = useState(""); // name for write tab
  const [signFont, setSignFont] = useState("'Dancing Script', cursive"); // font for write tab
  const [eSignName, setESignName] = useState(""); // full name for electronic signature
  const [eSignEmail, setESignEmail] = useState(""); // email for electronic signature

  // Text tool state
  const [textInput, setTextInput] = useState("");
  const [textColor, setTextColor] = useState("#000000");
  const [textSize, setTextSize] = useState(14);
  const [textBold, setTextBold] = useState(false);
  const [textFont, setTextFont] = useState("Arial, sans-serif");
  const [clickToPlaceText, setClickToPlaceText] = useState(false);
  const [editingTextId, setEditingTextId] = useState<string | null>(null); // inline text editing

  // Highlight state
  const [highlightColor, setHighlightColor] = useState("#FFFF00");
  const [brushColor, setBrushColor] = useState("#FF0000");
  const [brushSize, setBrushSize] = useState(4);
  const [eraserSize, setEraserSize] = useState(30);

  // Drawing canvas state (brush, eraser, highlight)
  // isCanvasDrawing MUST be a ref (not state) to avoid stale closures in useCallback handlers
  const isCanvasDrawingRef = useRef(false);
  const setIsCanvasDrawing = useCallback((v: boolean) => { isCanvasDrawingRef.current = v; }, []);
  const [canvasDrawStart, setCanvasDrawStart] = useState({ x: 0, y: 0 });
  const [currentBrushPoints, setCurrentBrushPoints] = useState<{ x: number; y: number }[]>([]);
  const [dragPreview, setDragPreview] = useState<{ x: number; y: number; w: number; h: number } | null>(null);

  // Protect state
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [encryptionAlgo, setEncryptionAlgo] = useState<"128-AES" | "256-AES" | "128-ARC4">("128-AES");
  const [isProtecting, setIsProtecting] = useState(false);
  const [protectProgress, setProtectProgress] = useState(0);
  // Export state
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  // PDF loading state (for native PDFs)
  const [isLoadingPdf, setIsLoadingPdf] = useState(false);
  const [pdfLoadProgress, setPdfLoadProgress] = useState(0);

  // File conversion loading state
  const [isConvertingFile, setIsConvertingFile] = useState(false);
  const [convertFileProgress, setConvertFileProgress] = useState(0);
  const [convertedFromFile, setConvertedFromFile] = useState<{ name: string; type: string } | null>(null);
  const [showConvertedBanner, setShowConvertedBanner] = useState(false);

  // Find state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ page: number; text: string }[]>([]);
  const [isSearching, setIsSearching] = useState(false);

  // Mobile panel state
  const [showMobilePanel, setShowMobilePanel] = useState(false);

  // Compress state
  const [compressQuality, setCompressQuality] = useState(70);
  const [compressResult, setCompressResult] = useState<{ originalSize: number; compressedSize: number; blob: Blob; name: string } | null>(null);
  const [isCompressing, setIsCompressing] = useState(false);
  // Protect result state
  const [protectResult, setProtectResult] = useState<{ blob: Blob; name: string } | null>(null);

  // Shape state
  const [shapeType, setShapeType] = useState<"rect" | "circle" | "line">("rect");
  const [shapeColor, setShapeColor] = useState("#2563EB");
  const [shapeFilled, setShapeFilled] = useState(false); // false = only border, true = filled

  // Note state
  const [noteText, setNoteText] = useState("");

  // Edit-text tool state
  // allNativeTextBlocks: Map<pageNum, NativeTextBlock[]> — persists edits across page navigation
  const [allNativeTextBlocks, setAllNativeTextBlocks] = useState<Map<number, NativeTextBlock[]>>(new Map());
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editingBlockText, setEditingBlockText] = useState("");
  const [editTextColor, setEditTextColor] = useState("#000000");
  // Derived: blocks for the current page
  const nativeTextBlocks = allNativeTextBlocks.get(currentPage) ?? [];

  const viewerRef = useRef<HTMLDivElement>(null);
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const mainCanvasRef = useRef<HTMLCanvasElement>(null);
  // Callback ref to detect when canvas mounts and trigger initial render
  const mainCanvasCallbackRef = useCallback((node: HTMLCanvasElement | null) => {
    mainCanvasRef.current = node;
    if (node) {
      // Trigger render on next frame to ensure layout is complete
      requestAnimationFrame(() => {
        window.dispatchEvent(new CustomEvent('pdf-canvas-mounted'));
      });
    }
  }, []);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Keep annotationsRef in sync with annotations state for use in event listeners
  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);

  // ── Sync canvas internal size with its CSS display size ──────
  // Sync the canvas internal size to its CSS display size once when the sign/draw panel opens.
  // We do NOT use a ResizeObserver here because resizing the canvas clears its content.
  // A one-time sync on mount (+ 150ms delay for panel animation) is sufficient.
  useEffect(() => {
    if (activeTool !== 'sign' || signTab !== 'draw') return;
    const canvas = signCanvasRef.current;
    if (!canvas) return;
    const syncSize = () => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width > 0) {
        // Only update if the size actually changed to avoid clearing the canvas unnecessarily.
        const newW = Math.round(rect.width);
        const newH = Math.round(rect.height || 130);
        if (canvas.width !== newW || canvas.height !== newH) {
          canvas.width = newW;
          canvas.height = newH;
        }
      }
    };
    // Sync immediately, then once more after the panel slide-in animation completes.
    syncSize();
    const timer = setTimeout(syncSize, 150);
    return () => clearTimeout(timer);
  }, [activeTool, signTab]);

  // ── Global mouseup to stop signature drawing if mouse released outside canvas
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSignDrawingRef.current) {
        isSignDrawingRef.current = false;
        signLastPoint.current = null;
      }
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, []);

  const { data: subData } = trpc.subscription.status.useQuery(undefined, {
    retry: false,
  });
  const isPremium = subData?.isPremium ?? false;
  const { t } = useLanguage();
  const { isAuthenticated } = useAuth();
  const { saveEditedPdfToSession, savePdfToSession, setPendingPaywall, setPendingFile, pendingFile, pendingEditedPdf, clearPendingEditedPdf, pendingPaywall: ctxPendingPaywall } = usePdfFile();
  // Track the saved document ID so we don't re-save on every download click
  const [savedDocId, setSavedDocId] = useState<number | null>(null);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [, navigate] = useLocation();
  const [isSaving, setIsSaving] = useState(false);

  const uploadDocMutation = trpc.documents.upload.useMutation();

  // ── Save PDF to My Documents ──────────────────────────────
  const savePdf = async () => {
    if (!isAuthenticated) {
      toast.error(t.editor_toast_login_required ?? "Sign in to save documents");
      return;
    }
    if (!pdfBytes) {
      toast.error(t.editor_toast_no_pdf ?? "No PDF loaded");
      return;
    }
    setIsSaving(true);
    toast.loading(t.editor_saving ?? "Guardando documento...", { id: "save" });
    try {
      const out = await buildAnnotatedPdf();
      if (!out) throw new Error("No se pudo generar el PDF anotado");
      // Use REST multipart upload to avoid tRPC base64 size limits
      // Note: out is Uint8Array; out.buffer may be a shared ArrayBuffer with offset.
      // Use slice to get a clean copy of just the relevant bytes.
      const safeBuffer = out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength) as ArrayBuffer;
      const blob = new Blob([safeBuffer], { type: "application/pdf" });
      const formData = new FormData();
      const saveName = displayName || file?.name || "document.pdf";
      formData.append("file", blob, saveName);
      formData.append("name", saveName);
      const resp = await fetch("/api/documents/upload", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        if (resp.status === 401) {
          throw new Error("Debes iniciar sesi\u00f3n para guardar documentos");
        }
        throw new Error(errData.error ?? `Error del servidor (HTTP ${resp.status})`);
      }
      toast.success(t.editor_save_success ?? "Documento guardado en Mis Documentos!", { id: "save" });
    } catch (err) {
      console.error("[savePdf error]", err);
      const errMsg = err instanceof Error ? err.message : "Error al guardar el documento";
      toast.error(errMsg, { id: "save" });
    } finally {
      setIsSaving(false);
    }
  };

  // ── Load PDF ─────────────────────────────────────────────────
  const loadPdf = useCallback(async (f: File) => {
    setIsLoadingPdf(true);
    setPdfLoadProgress(5);
    try {
      // Use .slice() to ensure the stored bytes have their own independent ArrayBuffer.
      // f.arrayBuffer() may return a shared/transferable buffer that can be detached later.
      const bytes = new Uint8Array(await f.arrayBuffer()).slice();
      setPdfLoadProgress(15);
      // Validate PDF header: search for %PDF in first 1024 bytes (some PDFs have BOM or whitespace before header)
      const headerSlice = bytes.slice(0, 1024);
      const headerStr = String.fromCharCode(...Array.from(headerSlice));
      if (!headerStr.includes("%PDF")) {
        toast.error(t.editor_toast_invalid_pdf ?? "The file is not a valid PDF. Please upload a PDF file.");
        setIsLoadingPdf(false);
        return;
      }
      setPdfBytes(bytes);
      setPdfLoadProgress(30);
      const doc = await pdfjsLib.getDocument({ data: bytes.slice() }).promise;
      setPdfLoadProgress(50);
      setPdfDoc(doc);
      setTotalPages(doc.numPages);
      setCurrentPage(1);
      setAnnotations([]);
      setHistory([]);
      setHistoryIndex(-1);
      setActiveTool("edit-text");
      // Generate thumbnails
      setPdfLoadProgress(60);
      const thumbs: string[] = [];
      const thumbCount = Math.min(doc.numPages, 20);
      for (let i = 1; i <= thumbCount; i++) {
        const page = await doc.getPage(i);
        const vp = page.getViewport({ scale: 0.4 });
        const c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height;
        const ctx = c.getContext("2d")!;
        await page.render({ canvas: c, viewport: vp } as any).promise;
        thumbs.push(c.toDataURL());
        setPdfLoadProgress(60 + Math.round((i / thumbCount) * 30));
      }
      setThumbnails(thumbs);
      setPdfLoadProgress(95);
      // Auto-fit scale on mobile: fit PDF width to viewer container
      const firstPage = await doc.getPage(1);
      const naturalVp = firstPage.getViewport({ scale: 1 });
      const isMobile = window.innerWidth < 768;
      if (isMobile) {
        // Available width = screen width minus 2*12px padding
        const availableWidth = window.innerWidth - 24;
        const fitScale = availableWidth / naturalVp.width;
        setScale(Math.min(fitScale, 1.5)); // cap at 1.5 to avoid oversized on tablets
      } else {
        setScale(1.2);
      }
      setPdfLoadProgress(100);
    } catch (err) {
      console.error("[loadPdf] Error:", err);
      toast.error("Error loading PDF");
    } finally {
      // Small delay to show 100% before hiding
      setTimeout(() => {
        setIsLoadingPdf(false);
        setPdfLoadProgress(0);
      }, 300);
    }
  }, []);

  // ── Render page ───────────────────────────────────────────────
  const renderPage = useCallback(async (pageNum: number) => {
    if (!pdfDoc || !mainCanvasRef.current) return;
    const page = await pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale });
    const canvas = mainCanvasRef.current;
    canvas.width = vp.width;
    canvas.height = vp.height;
    const ctx = canvas.getContext("2d")!;
    await page.render({ canvas, viewport: vp } as any).promise;
    // Sync drawing canvas size
    if (drawingCanvasRef.current) {
      drawingCanvasRef.current.width = vp.width;
      drawingCanvasRef.current.height = vp.height;
      redrawDrawingCanvas();
    }
  }, [pdfDoc, scale]); // eslint-disable-line react-hooks/exhaustive-deps


  useEffect(() => { renderPage(currentPage); }, [renderPage, currentPage]);

  // Force render when pdfDoc first becomes available OR when canvas mounts
  useEffect(() => {
    if (pdfDoc && mainCanvasRef.current) {
      renderPage(currentPage);
    }
    // Listen for canvas mount event (canvas may mount AFTER pdfDoc is set)
    const handleCanvasMounted = () => {
      if (pdfDoc && mainCanvasRef.current) {
        renderPage(currentPage);
      }
    };
    window.addEventListener('pdf-canvas-mounted', handleCanvasMounted);
    return () => window.removeEventListener('pdf-canvas-mounted', handleCanvasMounted);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfDoc, renderPage, currentPage]);

  // Auto-load initialFile if provided — converts non-PDF files first
  useEffect(() => {
    if (!initialFile) return;
    const isPdf = initialFile.name.toLowerCase().endsWith(".pdf") || initialFile.type === "application/pdf";
    if (isPdf) {
      setFile(initialFile);
      onFileNameChange?.(initialFile.name);
      loadPdf(initialFile);
      return;
    }
    // Non-PDF: convert on server first — show full-screen loading overlay
    setIsConvertingFile(true);
    setConvertFileProgress(0);
    // Simulate progress while waiting for server response
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 8 + 2; // random increments
      if (progress > 85) progress = 85; // cap at 85% until real completion
      setConvertFileProgress(Math.round(progress));
    }, 400);
    (async () => {
      try {
        const formData = new FormData();
        formData.append("file", initialFile);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000);
        const resp = await fetch("/api/documents/convert-upload", {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });
        clearTimeout(timeoutId);
        clearInterval(progressInterval);
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || "Conversion failed");
        }
        setConvertFileProgress(90);
        const pdfBlob = await resp.blob();
        const nameHeader = resp.headers.get("X-Converted-Name");
        const name = nameHeader ? decodeURIComponent(nameHeader) : initialFile.name.replace(/\.[^.]+$/, ".pdf");
        const pdfFile = new File([pdfBlob], name, { type: "application/pdf" });
        setConvertFileProgress(95);
        setFile(pdfFile);
        onFileNameChange?.(pdfFile.name);
        // CRITICAL: Update the context pendingFile with the converted PDF
        // so that savePdfToSession() saves the real PDF bytes (not the original image)
        // This prevents "not a valid PDF" error after OAuth redirect
        setPendingFile(pdfFile);
        await loadPdf(pdfFile);
        setConvertFileProgress(100);
        // Save original file info for the "converted" banner
        setConvertedFromFile({ name: initialFile.name, type: initialFile.type });
        setTimeout(() => {
          setIsConvertingFile(false);
          setShowConvertedBanner(true);
          setTimeout(() => setShowConvertedBanner(false), 12000);
        }, 500);
      } catch (err: any) {
        clearInterval(progressInterval);
        setIsConvertingFile(false);
        if (err?.name === "AbortError") {
          toast.error(t.editor_toast_convert_error ?? "Conversion timed out. Please try a smaller file.");
        } else {
          toast.error(t.editor_toast_convert_error ?? "Could not convert file.");
        }
        console.error("[InitialFile Convert]", err);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile]);

  // ── Post-login auto-continuation ──────────────────────────────────────────
  // After OAuth redirect, if user had a pending download intent:
  // 1. Auto-save the document to user panel (using pendingEditedPdf from session)
  // 2. If premium → trigger download immediately
  // 3. If not premium → open paywall
  //
  // APPROACH: On mount, check sessionStorage for "cloudpdf_pending_action". If found,
  // start a polling interval that waits for isAuthenticated to become true.
  // This avoids the React useEffect dependency race condition entirely.
  const autoResumeTriggeredRef = useRef(false);
  const isAuthenticatedRef = useRef(isAuthenticated);
  const pdfDocRef = useRef(pdfDoc);
  const pendingEditedPdfRef = useRef(pendingEditedPdf);
  const isPremiumRef = useRef(isPremium);
  const pdfBytesRef = useRef(pdfBytes);
  // Keep refs in sync
  useEffect(() => { isAuthenticatedRef.current = isAuthenticated; }, [isAuthenticated]);
  useEffect(() => { pdfDocRef.current = pdfDoc; }, [pdfDoc]);
  useEffect(() => { pendingEditedPdfRef.current = pendingEditedPdf; }, [pendingEditedPdf]);
  useEffect(() => { isPremiumRef.current = isPremium; }, [isPremium]);
  useEffect(() => { pdfBytesRef.current = pdfBytes; }, [pdfBytes]);

  useEffect(() => {
    // Only run once on mount
    const pendingAction = sessionStorage.getItem("cloudpdf_pending_action");
    const hasPendingPaywall = initialOpenPaywall || pendingAction === "download";
    if (!hasPendingPaywall || autoResumeTriggeredRef.current) return;

    console.log("[autoResume] Detected pending action, starting poll...");

    // Poll every 300ms until isAuthenticated is true
    // (auth.me query takes ~100-300ms to resolve after page load)
    let attempts = 0;
    const maxAttempts = 50; // 15 seconds max
    const interval = setInterval(async () => {
      attempts++;
      const authed = isAuthenticatedRef.current;
      const hasPdf = pdfDocRef.current || pendingEditedPdfRef.current;

      console.log(`[autoResume] Poll #${attempts}: authed=${authed}, hasPdf=${!!hasPdf}`);

      if (attempts >= maxAttempts) {
        console.log("[autoResume] Timed out waiting for auth/pdf");
        clearInterval(interval);
        sessionStorage.removeItem("cloudpdf_pending_action");
        return;
      }

      // Need auth. PDF is optional (we can open paywall without it if we have pendingEditedPdf)
      if (!authed) return;
      // Need either a loaded PDF or a pendingEditedPdf from S3
      if (!hasPdf) {
        // If we've waited 3+ seconds and still no PDF, open paywall anyway
        if (attempts < 10) return;
      }

      // All conditions met — trigger!
      clearInterval(interval);
      if (autoResumeTriggeredRef.current) return;
      autoResumeTriggeredRef.current = true;
      sessionStorage.removeItem("cloudpdf_pending_action");
      onPaywallOpened?.();

      console.log("[autoResume] Triggering auto-resume download flow");
      toast.loading("Guardando documento en tu panel...", { id: "auto-resume" });

      const currentPendingEdited = pendingEditedPdfRef.current;
      const currentPdfBytes = pdfBytesRef.current;
      const currentIsPremium = isPremiumRef.current;

      // If we have a pending edited PDF from S3 temp, claim it
      if (currentPendingEdited) {
        try {
          const resp = await fetch("/api/documents/claim-temp", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tempKey: currentPendingEdited.tempKey,
              name: currentPendingEdited.name,
              paymentStatus: currentIsPremium ? "paid" : "pending",
            }),
          });
          if (resp.ok) {
            const data = await resp.json();
            if (data.doc?.id) setSavedDocId(data.doc.id);
          }
        } catch (err) {
          console.error("[autoResume] claim-temp failed:", err);
        }
        clearPendingEditedPdf();
      } else if (currentPdfBytes) {
        try {
          const out = await buildAnnotatedPdf();
          if (out) {
            const result = await autoSaveDocument(out);
            if (result?.docId) setSavedDocId(result.docId);
          }
        } catch (err) {
          console.error("[autoResume] auto-save failed:", err);
        }
      }

      toast.dismiss("auto-resume");

      // If premium → download immediately
      if (currentIsPremium) {
        toast.loading("Preparando descarga...", { id: "dl" });
        try {
          const out = await buildAnnotatedPdf();
          if (out) {
            triggerDownload(out);
            toast.success("PDF descargado correctamente", { id: "dl" });
          }
        } catch {
          toast.error("Error al descargar", { id: "dl" });
        }
        return;
      }

      // Not premium → prepare paywall data and open it
      if (currentPdfBytes) {
        try {
          const out = await buildAnnotatedPdf();
          if (out) {
            setPdfDataForPaywall({
              base64: uint8ToBase64(out),
              name: displayName ?? file?.name ?? "document.pdf",
              size: out.byteLength,
            });
          }
        } catch {}
      }
      setShowPaywall(true);
    }, 300);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Run ONLY on mount

  // ── Load native text blocks for Edit-Text tool ──────────────
  const loadNativeTextBlocks = useCallback(async (pageNum: number) => {
    if (!pdfDoc) return;
    const page = await pdfDoc.getPage(pageNum);
    const vp = page.getViewport({ scale });
    const content = await page.getTextContent();
    const blocks: NativeTextBlock[] = [];
    for (const item of content.items as any[]) {
      if (!item.str || !item.str.trim()) continue;
      // item.transform = [a, b, c, d, e, f] where (e,f) is bottom-left in PDF points (from bottom)
      const [a, b, , , e, f] = item.transform as number[];
      const pdfFontSize = Math.sqrt(a * a + b * b); // font size in PDF points
      const pdfPageHeight = vp.height / scale; // page height in PDF points
      const pdfWidth = item.width ?? item.str.length * pdfFontSize * 0.6;
      // Canvas pixel coords (for overlay display)
      // PDF y is from bottom; canvas y is from top
      const canvasX = e * scale;
      const canvasY = (pdfPageHeight - f) * scale - pdfFontSize * scale;
      const canvasW = pdfWidth * scale;
      const canvasH = pdfFontSize * scale * 1.4;
      blocks.push({
        id: Math.random().toString(36).slice(2),
        str: item.str,
        // Canvas coords
        x: canvasX,
        y: canvasY,
        width: Math.max(canvasW, 20),
        height: Math.max(canvasH, 14),
        fontSize: pdfFontSize * scale,
        // PDF point coords (used directly at export — no scale conversion needed)
        pdfX: e,
        pdfY: f,           // baseline y from bottom of page (PDF coordinate system)
        pdfWidth: Math.max(pdfWidth, 10),
        pdfFontSize: Math.max(pdfFontSize, 6),
        pageHeight: pdfPageHeight,
        page: pageNum,
      });
    }
    // Only set blocks for this page if not already loaded (preserve existing edits)
    setAllNativeTextBlocks(prev => {
      const existing = prev.get(pageNum);
      if (existing && existing.length > 0) {
        // Merge: keep editedStr from existing blocks matched by str+position
        const merged = blocks.map(newBlock => {
          const match = existing.find(
            ex => ex.str === newBlock.str && Math.abs(ex.x - newBlock.x) < 2 && Math.abs(ex.y - newBlock.y) < 2
          );
          return match ? { ...newBlock, editedStr: match.editedStr, fontColor: match.fontColor } : newBlock;
        });
        const next = new Map(prev);
        next.set(pageNum, merged);
        return next;
      }
      const next = new Map(prev);
      next.set(pageNum, blocks);
      return next;
    });
  }, [pdfDoc, scale]);

  // Reload text blocks when page or scale changes while edit-text is active
  useEffect(() => {
    if (activeTool === "edit-text" && pdfDoc) {
      loadNativeTextBlocks(currentPage);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTool, currentPage, scale, pdfDoc]);

  // Handle file drop / select — auto-converts non-PDF files to PDF via server
  const handleFile = useCallback(async (f: File) => {
    const isPdf = f.name.toLowerCase().endsWith(".pdf") || f.type === "application/pdf";
    if (isPdf) {
      setFile(f);
      onFileNameChange?.(f.name);
      loadPdf(f);
      toast.success(t.editor_toast_pdf_loaded ?? "PDF loaded successfully");
      return;
    }
    // Non-PDF: show full-screen loading overlay with progress bar
    setIsConvertingFile(true);
    setConvertFileProgress(0);
    let progress = 0;
    const progressInterval = setInterval(() => {
      progress += Math.random() * 8 + 2;
      if (progress > 85) progress = 85;
      setConvertFileProgress(Math.round(progress));
    }, 400);
    try {
      const formData = new FormData();
      formData.append("file", f);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 90000);
      const resp = await fetch("/api/documents/convert-upload", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      clearInterval(progressInterval);
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Conversion failed");
      }
      setConvertFileProgress(90);
      const pdfBlob = await resp.blob();
      const nameHeader = resp.headers.get("X-Converted-Name");
      const name = nameHeader ? decodeURIComponent(nameHeader) : f.name.replace(/\.[^.]+$/, ".pdf");
      const pdfFile = new File([pdfBlob], name, { type: "application/pdf" });
      setConvertFileProgress(95);
      setFile(pdfFile);
      onFileNameChange?.(pdfFile.name);
      await loadPdf(pdfFile);
      setConvertFileProgress(100);
      // Save original file info for the "converted" banner
      setConvertedFromFile({ name: f.name, type: f.type });
      setTimeout(() => {
        setIsConvertingFile(false);
        setShowConvertedBanner(true);
        // Auto-hide banner after 12 seconds
        setTimeout(() => setShowConvertedBanner(false), 12000);
      }, 500);
    } catch (err: any) {
      clearInterval(progressInterval);
      setIsConvertingFile(false);
      if (err?.name === "AbortError") {
        toast.error(t.editor_toast_convert_error ?? "Conversion timed out. Please try a smaller file.");
      } else {
        toast.error(t.editor_toast_convert_error ?? "Could not convert file. Please try a PDF file.");
      }
      console.error("[ConvertUpload]", err);
    }
  }, [loadPdf, t]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // ── History (undo/redo) ───────────────────────────────────────
  const pushHistory = useCallback((anns: Annotation[]) => {
    setHistory(prev => {
      const newHist = prev.slice(0, historyIndex + 1);
      newHist.push({ annotations: anns, pages: [] });
      setHistoryIndex(newHist.length - 1);
      return newHist;
    });
  }, [historyIndex]);

  // ── Drawing canvas helpers ────────────────────────────────────
  const getDrawCtx = useCallback(() => drawingCanvasRef.current?.getContext("2d") ?? null, []);

  const redrawDrawingCanvas = useCallback(() => {
    const dc = drawingCanvasRef.current;
    if (!dc) return;
    const ctx = dc.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, dc.width, dc.height);
    const pageAnns = annotations.filter(a => a.page === currentPage);
    for (const ann of pageAnns) {
      if (ann.type === "drawing" && ann.points && ann.points.length > 1) {
        ctx.beginPath();
        ctx.strokeStyle = ann.color ?? "#FF0000";
        ctx.lineWidth = ann.strokeWidth ?? 3;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(ann.points[0].x, ann.points[0].y);
        for (let i = 1; i < ann.points.length; i++) ctx.lineTo(ann.points[i].x, ann.points[i].y);
        ctx.stroke();
      } else if (ann.type === "eraser") {
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(ann.x, ann.y, ann.width, ann.height);
      }
    }
  }, [annotations, currentPage]);

  useEffect(() => { redrawDrawingCanvas(); }, [redrawDrawingCanvas]);

  // ── Get canvas-relative position ─────────────────────────────
  const getCanvasPos = useCallback((e: React.MouseEvent): { x: number; y: number } => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  // Touch equivalent for brush/eraser/highlight on mobile
  const getCanvasPosFromTouch = useCallback((touch: React.Touch): { x: number; y: number } => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (touch.clientX - rect.left) * (canvas.width / rect.width),
      y: (touch.clientY - rect.top) * (canvas.height / rect.height),
    };
  }, []);

  const handleCanvasTouchStart = useCallback((e: React.TouchEvent) => {
    if (activeTool !== "brush" && activeTool !== "eraser" && activeTool !== "highlight") return;
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getCanvasPosFromTouch(touch);
    if (activeTool === "brush") {
      setIsCanvasDrawing(true);
      setCurrentBrushPoints([pos]);
      const ctx = getDrawCtx();
      if (ctx) {
        ctx.beginPath();
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(pos.x, pos.y);
      }
    } else {
      setIsCanvasDrawing(true);
      setCanvasDrawStart(pos);
      setDragPreview({ x: pos.x, y: pos.y, w: 0, h: 0 });
    }
  }, [activeTool, brushColor, brushSize, getCanvasPosFromTouch, getDrawCtx]);

  const handleCanvasTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isCanvasDrawingRef.current) return;
    if (activeTool !== "brush" && activeTool !== "eraser" && activeTool !== "highlight") return;
    e.preventDefault();
    const touch = e.touches[0];
    const pos = getCanvasPosFromTouch(touch);
    if (activeTool === "brush") {
      setCurrentBrushPoints(prev => [...prev, pos]);
      const ctx = getDrawCtx();
      if (ctx) { ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
    } else {
      const x = Math.min(pos.x, canvasDrawStart.x);
      const y = Math.min(pos.y, canvasDrawStart.y);
      const w = Math.abs(pos.x - canvasDrawStart.x);
      const h = Math.abs(pos.y - canvasDrawStart.y);
      setDragPreview({ x, y, w, h });
      const dc = drawingCanvasRef.current;
      const ctx = getDrawCtx();
      if (ctx && dc) {
        redrawDrawingCanvas();
        if (activeTool === "eraser") {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = "#999";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = highlightColor + "55";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = highlightColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        }
      }
    }
  }, [activeTool, getCanvasPosFromTouch, getDrawCtx, canvasDrawStart, highlightColor, redrawDrawingCanvas]);

  const handleCanvasTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!isCanvasDrawingRef.current) return;
    if (activeTool !== "brush" && activeTool !== "eraser" && activeTool !== "highlight") return;
    e.preventDefault();
    setIsCanvasDrawing(false);
    if (activeTool === "brush" && currentBrushPoints.length > 1) {
      const newAnn: Omit<Annotation, "id"> = {
        type: "drawing", points: currentBrushPoints,
        x: 0, y: 0, width: 0, height: 0,
        page: currentPage, color: brushColor, strokeWidth: brushSize,
      };
      const id = Math.random().toString(36).slice(2);
      setAnnotations(prev => { const next = [...prev, { ...newAnn, id }]; pushHistory(next); return next; });
      setCurrentBrushPoints([]);
    } else if (activeTool === "eraser" && dragPreview && dragPreview.w > 5 && dragPreview.h > 5) {
      const newAnn: Omit<Annotation, "id"> = {
        type: "eraser", x: dragPreview.x, y: dragPreview.y,
        width: dragPreview.w, height: dragPreview.h, page: currentPage,
      };
      const id = Math.random().toString(36).slice(2);
      setAnnotations(prev => { const next = [...prev, { ...newAnn, id }]; pushHistory(next); return next; });
      setDragPreview(null);
    } else if (activeTool === "highlight" && dragPreview && dragPreview.w > 5 && dragPreview.h > 5) {
      const newAnn: Omit<Annotation, "id"> = {
        type: "highlight", x: dragPreview.x, y: dragPreview.y,
        width: dragPreview.w, height: dragPreview.h,
        page: currentPage, color: highlightColor,
      };
      const id = Math.random().toString(36).slice(2);
      setAnnotations(prev => { const next = [...prev, { ...newAnn, id }]; pushHistory(next); return next; });
      setDragPreview(null);
    }
  }, [activeTool, currentBrushPoints, dragPreview, currentPage, brushColor, brushSize, highlightColor, pushHistory]);

  // ── Canvas mouse handlers (brush, eraser, highlight) ─────────
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    const pos = getCanvasPos(e);
    if (activeTool === "brush") {
      setIsCanvasDrawing(true);
      setCurrentBrushPoints([pos]);
      const ctx = getDrawCtx();
      if (ctx) {
        ctx.beginPath();
        ctx.strokeStyle = brushColor;
        ctx.lineWidth = brushSize;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(pos.x, pos.y);
      }
    } else if (activeTool === "eraser" || activeTool === "highlight") {
      setIsCanvasDrawing(true);
      setCanvasDrawStart(pos);
      setDragPreview({ x: pos.x, y: pos.y, w: 0, h: 0 });
    }
  }, [activeTool, brushColor, brushSize, getCanvasPos, getDrawCtx]);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isCanvasDrawingRef.current) return;
    const pos = getCanvasPos(e);
    if (activeTool === "brush") {
      setCurrentBrushPoints(prev => [...prev, pos]);
      const ctx = getDrawCtx();
      if (ctx) { ctx.lineTo(pos.x, pos.y); ctx.stroke(); }
    } else if (activeTool === "eraser" || activeTool === "highlight") {
      const x = Math.min(pos.x, canvasDrawStart.x);
      const y = Math.min(pos.y, canvasDrawStart.y);
      const w = Math.abs(pos.x - canvasDrawStart.x);
      const h = Math.abs(pos.y - canvasDrawStart.y);
      setDragPreview({ x, y, w, h });
      // Live preview
      const dc = drawingCanvasRef.current;
      const ctx = getDrawCtx();
      if (ctx && dc) {
        redrawDrawingCanvas();
        if (activeTool === "eraser") {
          ctx.fillStyle = "rgba(255,255,255,0.85)";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = "#999";
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        } else {
          ctx.fillStyle = highlightColor + "55";
          ctx.fillRect(x, y, w, h);
          ctx.strokeStyle = highlightColor;
          ctx.lineWidth = 1;
          ctx.setLineDash([4, 4]);
          ctx.strokeRect(x, y, w, h);
          ctx.setLineDash([]);
        }
      }
    }
  }, [activeTool, getCanvasPos, getDrawCtx, canvasDrawStart, highlightColor, redrawDrawingCanvas]);

  const handleCanvasMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isCanvasDrawingRef.current) return;
    setIsCanvasDrawing(false);
    const pos = getCanvasPos(e);
    if (activeTool === "brush" && currentBrushPoints.length > 1) {
      const newAnn: Omit<Annotation, "id"> = {
        type: "drawing", points: currentBrushPoints,
        x: 0, y: 0, width: 0, height: 0,
        page: currentPage, color: brushColor, strokeWidth: brushSize,
      };
      const id = Math.random().toString(36).slice(2);
      setAnnotations(prev => { const next = [...prev, { ...newAnn, id }]; pushHistory(next); return next; });
      setCurrentBrushPoints([]);
    } else if (activeTool === "eraser" && dragPreview && dragPreview.w > 5 && dragPreview.h > 5) {
      const newAnn: Omit<Annotation, "id"> = {
        type: "eraser", x: dragPreview.x, y: dragPreview.y,
        width: dragPreview.w, height: dragPreview.h, page: currentPage,
      };
      const id = Math.random().toString(36).slice(2);
      setAnnotations(prev => { const next = [...prev, { ...newAnn, id }]; pushHistory(next); return next; });
      setDragPreview(null);
    } else if (activeTool === "highlight" && dragPreview && dragPreview.w > 5 && dragPreview.h > 5) {
      const newAnn: Omit<Annotation, "id"> = {
        type: "highlight", x: dragPreview.x, y: dragPreview.y,
        width: dragPreview.w, height: dragPreview.h,
        page: currentPage, color: highlightColor,
      };
      const id = Math.random().toString(36).slice(2);
      setAnnotations(prev => { const next = [...prev, { ...newAnn, id }]; pushHistory(next); return next; });
      setDragPreview(null);
    }
  }, [activeTool, getCanvasPos, currentBrushPoints, dragPreview, currentPage, brushColor, brushSize, highlightColor, pushHistory]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) { setAnnotations([]); return; }
    const prev = history[historyIndex - 1];
    setAnnotations(prev.annotations);
    setHistoryIndex(i => i - 1);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const next = history[historyIndex + 1];
    setAnnotations(next.annotations);
    setHistoryIndex(i => i + 1);
  }, [history, historyIndex]);

  // ── Add annotation ────────────────────────────────────────────
  const addAnnotation = useCallback((ann: Omit<Annotation, "id">) => {
    const newAnn: Annotation = { ...ann, id: Math.random().toString(36).slice(2) };
    setAnnotations(prev => {
      const updated = [...prev, newAnn];
      pushHistory(updated);
      return updated;
    });
    setSelectedId(newAnn.id);
  }, [pushHistory]);

  const deleteSelected = useCallback(() => {
    if (!selectedId) return;
    setAnnotations(prev => {
      const updated = prev.filter(a => a.id !== selectedId);
      pushHistory(updated);
      return updated;
    });
    setSelectedId(null);
  }, [selectedId, pushHistory]);

  const deleteLastAnnotation = useCallback(() => {
    setAnnotations(prev => {
      if (prev.length === 0) return prev;
      const updated = prev.slice(0, -1);
      pushHistory(updated);
      return updated;
    });
    setSelectedId(null);
  }, [pushHistory]);

  const deleteAllPageAnnotations = useCallback(() => {
    setAnnotations(prev => {
      const updated = prev.filter(a => a.page !== currentPage);
      pushHistory(updated);
      return updated;
    });
    setSelectedId(null);
  }, [currentPage, pushHistory]);

  // ── Signature canvas ─────────────────────────────────────────────
  // Helper: get canvas coordinates accounting for CSS scaling
  const getSignCoords = (clientX: number, clientY: number) => {
    const c = signCanvasRef.current!;
    const r = c.getBoundingClientRect();
    const scaleX = c.width / r.width;
    const scaleY = c.height / r.height;
    return { x: (clientX - r.left) * scaleX, y: (clientY - r.top) * scaleY };
  };
  const startSign = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const { x, y } = getSignCoords(e.clientX, e.clientY);
    isSignDrawingRef.current = true;
    signLastPoint.current = { x, y };
    // Draw a dot at the click point so single clicks are visible
    const c = signCanvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(x, y, signStrokeWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = signColor;
    ctx.fill();
  };
  const drawSign = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isSignDrawingRef.current || !signLastPoint.current) return;
    const c = signCanvasRef.current!;
    const ctx = c.getContext("2d")!;
    const { x, y } = getSignCoords(e.clientX, e.clientY);
    ctx.beginPath();
    ctx.moveTo(signLastPoint.current.x, signLastPoint.current.y);
    ctx.lineTo(x, y);
    ctx.lineWidth = signStrokeWidth;
    ctx.strokeStyle = signColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    signLastPoint.current = { x, y };
  };
  const endSign = () => { isSignDrawingRef.current = false; signLastPoint.current = null; };
  // Touch handlers for mobile signature drawing
  const startSignTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = getSignCoords(touch.clientX, touch.clientY);
    isSignDrawingRef.current = true;
    signLastPoint.current = { x, y };
    const c = signCanvasRef.current!;
    const ctx = c.getContext("2d")!;
    ctx.beginPath();
    ctx.arc(x, y, signStrokeWidth / 2, 0, Math.PI * 2);
    ctx.fillStyle = signColor;
    ctx.fill();
  };
  const drawSignTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    if (!isSignDrawingRef.current || !signLastPoint.current) return;
    const touch = e.touches[0];
    const c = signCanvasRef.current!;
    const ctx = c.getContext("2d")!;
    const { x, y } = getSignCoords(touch.clientX, touch.clientY);
    ctx.beginPath();
    ctx.moveTo(signLastPoint.current.x, signLastPoint.current.y);
    ctx.lineTo(x, y);
    ctx.lineWidth = signStrokeWidth;
    ctx.strokeStyle = signColor;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    signLastPoint.current = { x, y };
  };
  const endSignTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    isSignDrawingRef.current = false;
    signLastPoint.current = null;
  };
  const clearSign = () => {
    const c = signCanvasRef.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
  };
  const placeSignature = () => {
    const c = signCanvasRef.current!;
    const dataUrl = c.toDataURL();
    addAnnotation({ type: "signature", dataUrl, x: 100, y: 100, width: 200, height: 80, page: currentPage });
    toast.success(t.editor_sign_added ?? "Signature added. Drag it to position.");
    // Keep sign tool active so user can add multiple signatures
  };
  // Generate a cursive-style signature from a typed name using canvas
  const placeNameSignature = () => {
    if (!signName.trim()) { toast.error(t.editor_toast_sign_name_required ?? "Type your name first"); return; }
    const c = document.createElement("canvas");
    const fontSize = 48;
    // Estimate width based on font
    c.width = Math.max(220, signName.length * 32);
    c.height = 90;
    const ctx = c.getContext("2d")!;
    ctx.clearRect(0, 0, c.width, c.height);
    ctx.font = `${fontSize}px ${signFont}`;
    ctx.fillStyle = signColor;
    ctx.textBaseline = "middle";
    // Draw a subtle underline
    ctx.beginPath();
    ctx.moveTo(4, 78);
    ctx.lineTo(c.width - 4, 78);
    ctx.strokeStyle = signColor;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillText(signName, 8, 46);
    const dataUrl = c.toDataURL();
    addAnnotation({ type: "signature", dataUrl, x: 100, y: 100, width: Math.max(220, signName.length * 32), height: 90, page: currentPage });
    toast.success(t.editor_sign_added ?? "Signature added. Drag it to position.");
  };

  // Generate electronic signature block (name + date + legal text rendered to canvas)
  const placeESign = () => {
    if (!eSignName.trim()) { toast.error(t.editor_toast_sign_name_required ?? "Type your full name"); return; }
    const now = new Date();
    const dateStr = now.toLocaleDateString("es-ES", { year: "numeric", month: "long", day: "numeric" });
    const timeStr = now.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    const c = document.createElement("canvas");
    c.width = 320;
    c.height = 110;
    const ctx = c.getContext("2d")!;
    // Background
    ctx.fillStyle = "#f0f4ff";
    ctx.roundRect(0, 0, c.width, c.height, 8);
    ctx.fill();
    // Border
    ctx.strokeStyle = "#3b5bdb";
    ctx.lineWidth = 1.5;
    ctx.roundRect(0, 0, c.width, c.height, 8);
    ctx.stroke();
    // Signature name in cursive
    ctx.font = "italic 30px 'Dancing Script', cursive";
    ctx.fillStyle = "#1a237e";
    ctx.fillText(eSignName, 12, 42);
    // Underline
    ctx.beginPath();
    ctx.moveTo(12, 50);
    ctx.lineTo(c.width - 12, 50);
    ctx.strokeStyle = "#1a237e";
    ctx.lineWidth = 1;
    ctx.stroke();
    // Date and email
    ctx.font = "11px Arial, sans-serif";
    ctx.fillStyle = "#374151";
    ctx.fillText(`Firmado electrónicamente el ${dateStr} a las ${timeStr}`, 12, 68);
    if (eSignEmail.trim()) {
      ctx.fillText(`Email: ${eSignEmail}`, 12, 84);
    }
    // Legal note
    ctx.font = "9px Arial, sans-serif";
    ctx.fillStyle = "#6b7280";
    ctx.fillText("Firma electrónica válida bajo Reglamento eIDAS (UE 910/2014)", 12, 100);
    const dataUrl = c.toDataURL();
    addAnnotation({ type: "signature", dataUrl, x: 80, y: 100, width: 320, height: 110, page: currentPage });
    toast.success(t.editor_toast_esign_added ?? "✓ Electronic signature inserted. Drag it to the desired position.");
  };

  // ── Add text ────────────────────────────────────────────
  const placeText = () => {
    if (!textInput.trim()) { toast.error(t.editor_toast_text_required ?? "Type the text first"); return; }
    addAnnotation({
      type: "text", text: textInput, x: 80, y: 80,
      width: Math.max(100, textInput.length * (textSize * 0.6)),
      height: textSize + 8, page: currentPage,
      color: textColor, fontSize: textSize, fontFamily: textFont,
    });
    setTextInput("");
    toast.success(t.editor_toast_image_added ?? "Text added. Drag it to position.");
    // Keep text tool active so user can add more text
  };

  const activateTextPlace = () => {
    if (!textInput.trim()) { toast.error(t.editor_toast_text_required ?? "Type the text first"); return; }
    setClickToPlaceText(true);
    toast.info("Haz clic en el PDF donde quieres colocar el texto");
  };

  // ── Add note ──────────────────────────────────────────────────
  const placeNote = () => {
    if (!noteText.trim()) { toast.error(t.editor_toast_note_required ?? "Write the note first"); return; }
    addAnnotation({
      type: "note", text: noteText, x: 80, y: 80,
      width: 200, height: 80, page: currentPage, color: "#FFF176",
    });
    setNoteText("");
    toast.success(t.editor_toast_note_added ?? "Note added.");
    // Keep notes tool active
  };

  // ── Add image ─────────────────────────────────────────────────
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      addAnnotation({
        type: "image", dataUrl: ev.target?.result as string,
        x: 80, y: 80, width: 200, height: 150, page: currentPage,
      });
      toast.success(t.editor_toast_image_added ?? "Image added. Drag it to position.");
    };
    reader.readAsDataURL(f);
    // Keep image tool active
  };
  // ── Add shapee ─────────────────────────────────────────────────
  const placeShape = () => {
    addAnnotation({
      type: "shape", x: 100, y: 100, width: 150, height: 80,
      page: currentPage, color: shapeColor,
      // Encode fill info in the text field: "rect", "circle", "line", "rect-filled", "circle-filled"
      text: shapeFilled ? `${shapeType}-filled` : shapeType,
    });
    toast.success(t.editor_toast_shape_added ?? "Shape added. Drag it to position.");
    // Keep shapes tool active so user can add multiple shapes
  }  // ── Dragging annotations ──────────────────────────────────────────────
  const startDrag = (e: React.MouseEvent, id: string) => {
    // Allow dragging with any tool except canvas-drawing tools
    // Only block drag on canvas-drawing tools — all other tools allow dragging annotations
    const nodrag = ["brush", "eraser", "highlight"];
    if (nodrag.includes(activeTool)) return;
    e.stopPropagation();const ann = annotations.find(a => a.id === id);
    if (!ann) return;
    setSelectedId(id);
    setIsDragging(true);
    const overlay = overlayRef.current!.getBoundingClientRect();
    setDragOffset({ x: e.clientX - overlay.left - ann.x, y: e.clientY - overlay.top - ann.y });
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !selectedId) return;
    const overlay = overlayRef.current!.getBoundingClientRect();
    const x = e.clientX - overlay.left - dragOffset.x;
    const y = e.clientY - overlay.top - dragOffset.y;
    setAnnotations(prev => prev.map(a => a.id === selectedId ? { ...a, x, y } : a));
  };

  const onMouseUp = () => {
    if (isDragging) {
      pushHistory(annotationsRef.current);
      setIsDragging(false);
    }
    // Note: resize is handled by window listeners, not here
  };

  // ── Click to place text on PDF ────────────────────────────────
  const handleOverlayClick = (e: React.MouseEvent) => {
    // Deselect annotation when clicking directly on the overlay background (not on a child annotation)
    if (e.target === e.currentTarget) {
      setSelectedId(null);
    }
    if (activeTool === "pointer" || activeTool === "move") {
      return;
    }
    if (activeTool === "text") {
      // Click on PDF to place a new text annotation and start inline editing
      const overlay = overlayRef.current!.getBoundingClientRect();
      const x = e.clientX - overlay.left;
      const y = e.clientY - overlay.top;
      const initialText = textInput.trim() || "";
      const newId = Math.random().toString(36).slice(2);
      const newAnn: Annotation = {
        id: newId,
        type: "text", text: initialText,
        x, y,
        width: Math.max(150, initialText.length * (textSize * 0.6)),
        height: textSize + 16, page: currentPage,
        color: textColor, fontSize: textSize, fontFamily: textFont,
      };
      setAnnotations(prev => { const next = [...prev, newAnn]; pushHistory(next); return next; });
      setSelectedId(newId);
      setEditingTextId(newId);
      setTextInput("");
      setClickToPlaceText(false);
    }
  };

  // ── Compress ──────────────────────────────────────────────────────
  // Renders each page via pdfjs to canvas, re-encodes as JPEG at the chosen quality,
  // and builds a new PDF from those JPEG pages. This guarantees real compression.
  const compressPdf = async () => {
    if (!pdfBytes || !pdfDoc) return;
    setIsCompressing(true);
    setCompressResult(null);
    toast.loading(t.editor_toast_compressing ?? "Compressing PDF...", { id: "compress" });
    try {
      const originalSize = (pdfBytes as Uint8Array).byteLength;
      const quality = compressQuality / 100; // 0.2 to 1.0

      // Determine render scale: lower quality → lower resolution → smaller file
      // quality 1.0 → scale 1.5, quality 0.5 → scale 1.0, quality 0.2 → scale 0.7
      const renderScale = quality < 0.4 ? 0.7 : quality < 0.6 ? 1.0 : quality < 0.8 ? 1.2 : 1.5;

      // Create new PDF document from JPEG renderings of each page
      const newDoc = await PDFDocument.create();
      const numPages = pdfDoc.numPages;

      for (let i = 1; i <= numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const viewport = page.getViewport({ scale: renderScale });

        // Render page to offscreen canvas
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx2d = canvas.getContext("2d");
        if (!ctx2d) continue;

        await page.render({ canvasContext: ctx2d, viewport } as any).promise;

        // Convert canvas to JPEG blob at the specified quality
        const jpegBlob = await new Promise<Blob | null>(resolve =>
          canvas.toBlob(resolve, "image/jpeg", quality)
        );
        if (!jpegBlob) continue;

        const jpegBytes = new Uint8Array(await jpegBlob.arrayBuffer());
        const jpegImage = await newDoc.embedJpg(jpegBytes);

        // Get original page dimensions (in PDF points) to preserve layout
        const origViewport = page.getViewport({ scale: 1.0 });
        const newPage = newDoc.addPage([origViewport.width, origViewport.height]);
        newPage.drawImage(jpegImage, {
          x: 0,
          y: 0,
          width: origViewport.width,
          height: origViewport.height,
        });
      }

      const compressed = await newDoc.save({ useObjectStreams: true });
      const blob = new Blob([compressed.buffer as ArrayBuffer], { type: "application/pdf" });
      const downloadName = `compressed_${file?.name ?? "document.pdf"}`;
      const compressedSize = compressed.byteLength;
      setCompressResult({ originalSize, compressedSize, blob, name: downloadName });
      toast.success(t.editor_toast_compressed ?? "PDF compressed", { id: "compress" });
    } catch (err) {
      console.error("Compress error:", err);
      toast.error(t.editor_toast_compress_error ?? "Error compressing", { id: "compress" });
    } finally {
      setIsCompressing(false);
    }
  };

  // ── Download compressed PDF (goes through paywall) ──
  const downloadCompressedPdf = async () => {
    if (!compressResult) return;
    await guardedDownload(compressResult.blob, compressResult.name, "compress");
  };

  // ── Protect with password ─────────────────────────────────────
  const protectPdf = async () => {
    if (!pdfBytes || !password) { toast.error(t.editor_toast_password_required ?? "Enter a password"); return; }
    if (password !== confirmPassword) { toast.error(t.editor_protect_passwords_mismatch ?? "Passwords do not match"); return; }
    setIsProtecting(true);
    setProtectProgress(5);
    const progressInterval = setInterval(() => {
      setProtectProgress(prev => prev < 40 ? prev + 2 : prev < 85 ? prev + 0.8 : prev);
    }, 80);
    try {
      // 1. Get final PDF bytes (with all annotations/edits applied)
      const finalBytes = await buildAnnotatedPdf();
      if (!finalBytes) {
        clearInterval(progressInterval);
        setIsProtecting(false); setProtectProgress(0);
        toast.error(t.editor_toast_protect_error ?? "Error protecting");
        return;
      }
      setProtectProgress(45);
      // 2. Encrypt client-side using pdf-encrypt-lite (RC4 128-bit)
      const ownerPw = password + "_owner";
      const encryptedBytes = await encryptPDF(finalBytes, password, ownerPw);
      setProtectProgress(90);
      // 3. Store the protected PDF result (paywall only on download)
      const filename = file?.name ?? "document.pdf";
      const protectedBlob = new Blob([encryptedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const downloadName = filename.replace(/\.pdf$/i, "") + "_protected.pdf";
      clearInterval(progressInterval);
      setProtectProgress(100);
      setProtectResult({ blob: protectedBlob, name: downloadName });
      toast.success(t.editor_toast_protected ?? "PDF protected!", { id: "protect" });
      setTimeout(() => { setIsProtecting(false); setProtectProgress(0); }, 1500);
    } catch (err) {
      clearInterval(progressInterval);
      setIsProtecting(false); setProtectProgress(0);
      toast.error(t.editor_toast_protect_error ?? "Error protecting PDF");
    } finally {
      clearInterval(progressInterval);
    }
  };
  // ── Download protected PDF (goes through paywall) ──
  const downloadProtectedPdf = async () => {
    if (!protectResult) return;
    await guardedDownload(protectResult.blob, protectResult.name, "protect");
  };

  // ── Export PDF to Word/Excel/PPT ──────────────────────────────
  const exportPdf = async (format: "docx" | "xlsx" | "pptx") => {
    if (!pdfBytes) { toast.error("No PDF loaded"); return; }
    setIsExporting(true);
    setExportProgress(5);
    const progressInterval = setInterval(() => {
      setExportProgress(prev => prev < 30 ? prev + 3 : prev < 80 ? prev + 0.8 : prev);
    }, 100);
    try {
      const finalBytes = await buildAnnotatedPdf();
      if (!finalBytes) throw new Error("Failed to build PDF");
      setExportProgress(35);
      const formData = new FormData();
      const blob = new Blob([finalBytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const filename = file?.name ?? "document.pdf";
      formData.append("file", blob, filename);
      formData.append("format", format);
      formData.append("filename", filename);
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      let resp: Response;
      try {
        resp = await fetch("/api/documents/export", {
          method: "POST",
          body: formData,
          credentials: "include",
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || "Server error");
      }
      setExportProgress(90);
      const exportedBlob = await resp.blob();
      const downloadName = filename.replace(/\.pdf$/i, "") + "." + format;
      setExportProgress(100);
      setTimeout(() => { setIsExporting(false); setExportProgress(0); }, 1500);
      await guardedDownload(exportedBlob, downloadName, "export");
    } catch (err) {
      clearInterval(progressInterval);
      setIsExporting(false); setExportProgress(0);
      const msg = err instanceof Error && err.name === "AbortError"
        ? "Export timed out (the file may be too large)"
        : `Error exporting: ${err instanceof Error ? err.message : "Unknown error"}`;
      toast.error(msg);
    } finally {
      clearInterval(progressInterval);
    }
  };

  // ── Convert PDF to image ──────────────────────────────────────
  const convertToImage = async (format: "jpg" | "png") => {
    if (!pdfDoc) return;
    toast.loading(t.editor_toast_converting ?? `Converting to ${format.toUpperCase()}...`, { id: "convert" });
    try {
      const page = await pdfDoc.getPage(currentPage);
      const vp = page.getViewport({ scale: 2 });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      await page.render({ canvas: c, viewport: vp } as any).promise;
      const mimeType = format === "jpg" ? "image/jpeg" : "image/png";
      c.toBlob(async (blob) => {
        if (!blob) return;
        const downloadName = `page${currentPage}.${format}`;
        await guardedDownload(blob, downloadName, "convert");
      }, mimeType, 0.92);
    } catch {
      toast.error(t.editor_toast_convert_error ?? "Error converting", { id: "convert" });
    }
  };

  // ── Convert all pages to images (ZIP) ────────────────────────
  const convertAllToImages = async (format: "jpg" | "png") => {
    if (!pdfDoc) return;
    toast.loading(t.editor_toast_converting ?? "Converting all pages...", { id: "convertAll" });
    try {
      for (let i = 1; i <= totalPages; i++) {
        const page = await pdfDoc.getPage(i);
        const vp = page.getViewport({ scale: 2 });
        const c = document.createElement("canvas");
        c.width = vp.width; c.height = vp.height;
        await page.render({ canvas: c, viewport: vp } as any).promise;
        await new Promise<void>((res) => {
          c.toBlob(async (blob) => {
            if (!blob) { res(); return; }
            const downloadName = `page${i}.${format}`;
            await guardedDownload(blob, downloadName, "convertAll");
            setTimeout(res, 300);
          }, format === "jpg" ? "image/jpeg" : "image/png", 0.92);
        });
        // If paywall was shown (not premium), stop after first page
        if (!isPremium) break;
      }
      if (isPremium) toast.success(t.editor_toast_converted ?? `${totalPages} pages exported`, { id: "convertAll" });
    } catch {
      toast.error(t.editor_toast_convert_error ?? "Error converting", { id: "convertAll" });
    }
  };

  // ── Convert image to PDF ──────────────────────────────────────
  const convertImageToPdf = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    toast.loading(t.editor_toast_converting ?? "Converting image to PDF...", { id: "img2pdf" });
    try {
      const doc = await PDFDocument.create();
      const bytes = new Uint8Array(await f.arrayBuffer());
      let img;
      if (f.type === "image/png") img = await doc.embedPng(bytes);
      else img = await doc.embedJpg(bytes);
      const page = doc.addPage([img.width, img.height]);
      page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
      const pdfOut = await doc.save();
      const blob = new Blob([pdfOut.buffer as ArrayBuffer], { type: "application/pdf" });
      const downloadName = f.name.replace(/\.[^.]+$/, "") + ".pdf";
      await guardedDownload(blob, downloadName, "img2pdf");
    } catch {
      toast.error(t.editor_toast_convert_error ?? "Error converting image", { id: "img2pdf" });
    }
  };

  // ── Merge PDFs ────────────────────────────────────────────────
  const mergePdfs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length || !pdfBytes) return;
    toast.loading("Fusionando PDFs...", { id: "merge" });
    try {
      const merged = await PDFDocument.create();
      // Add current PDF pages
      const currentDoc = await PDFDocument.load(pdfBytes);
      const currentPages = await merged.copyPages(currentDoc, currentDoc.getPageIndices());
      currentPages.forEach(p => merged.addPage(p));
      // Add new PDFs
      for (const f of files) {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const doc = await PDFDocument.load(bytes);
        const pages = await merged.copyPages(doc, doc.getPageIndices());
        pages.forEach(p => merged.addPage(p));
      }
      const out = await merged.save();
      const blob = new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
      await guardedDownload(blob, "merged.pdf", "merge");
    } catch {
      toast.error("Error al fusionar", { id: "merge" });
    }
  };

  // ── Split PDF ─────────────────────────────────────────────────
  const splitPdf = async (splitAt: number) => {
    if (!pdfBytes) return;
    toast.loading("Dividiendo PDF...", { id: "split" });
    try {
      const original = await PDFDocument.load(pdfBytes);
      const part1 = await PDFDocument.create();
      const part2 = await PDFDocument.create();
      const pages1 = await part1.copyPages(original, Array.from({ length: splitAt }, (_, i) => i));
      pages1.forEach(p => part1.addPage(p));
      const pages2 = await part2.copyPages(original, Array.from({ length: totalPages - splitAt }, (_, i) => i + splitAt));
      pages2.forEach(p => part2.addPage(p));
      for (const [i, doc] of [[1, part1], [2, part2]] as [number, PDFDocument][]) {
        const out = await doc.save();
        const blob = new Blob([out.buffer as ArrayBuffer], { type: "application/pdf" });
        const downloadName = `part${i}_${file?.name ?? "document.pdf"}`;
        await guardedDownload(blob, downloadName, "split");
        // If paywall was shown (not premium), stop after first part
        if (!isPremium) break;
      }
    } catch {
      toast.error("Error al dividir", { id: "split" });
    }
  };

  // ── Rotate page ─────────────────────────────────────────────
  const rotatePage = async () => {
    if (!pdfBytes) return;
    toast.loading(t.editor_toast_rotating ?? "Rotating page...", { id: "rotate" });
    try {
      const safeBytes = pdfBytes.slice();
      const doc = await PDFDocument.load(safeBytes);
      const page = doc.getPage(currentPage - 1);
      page.setRotation(degrees((page.getRotation().angle + 90) % 360));
      const out = await doc.save();
      const newBytes = new Uint8Array(out).slice();
      setPdfBytes(newBytes);
      // Use a fresh .slice() copy so pdf.js doesn't reuse cached document
      const newDoc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise;
      setPdfDoc(newDoc);
      // Update thumbnail for the rotated page
      const rotatedPage = await newDoc.getPage(currentPage);
      const vp = rotatedPage.getViewport({ scale: 0.4 });
      const c = document.createElement("canvas");
      c.width = vp.width; c.height = vp.height;
      const ctx = c.getContext("2d")!;
      await rotatedPage.render({ canvas: c, viewport: vp } as any).promise;
      setThumbnails(prev => {
        const updated = [...prev];
        updated[currentPage - 1] = c.toDataURL();
        return updated;
      });
      toast.success(t.editor_toast_rotated ?? "Page rotated", { id: "rotate" });
    } catch {
      toast.error(t.editor_toast_rotate_error ?? "Error rotating", { id: "rotate" });
    }
  };

    // ── Delete page ─────────────────────────────────────────────
  const deletePage = async () => {
    if (!pdfBytes || totalPages <= 1) { toast.error(t.editor_toast_only_page ?? "Cannot delete the only page"); return; }
    toast.loading(t.editor_toast_deleting_page ?? "Deleting page...", { id: "delpage" });
    try {
      const safeBytes = pdfBytes.slice();
      const doc = await PDFDocument.load(safeBytes);
      doc.removePage(currentPage - 1);
      const out = await doc.save();
      const newBytes = new Uint8Array(out).slice();
      setPdfBytes(newBytes);
      const newDoc = await pdfjsLib.getDocument({ data: newBytes.slice() }).promise;
      setPdfDoc(newDoc);
      const newPageCount = doc.getPageCount(); // already removed, so this is the new count
      setTotalPages(newPageCount);
      const newCurrentPage = currentPage > newPageCount ? newPageCount : currentPage;
      setCurrentPage(newCurrentPage);
      // Rebuild thumbnails without the deleted page
      setThumbnails(prev => prev.filter((_, i) => i !== currentPage - 1));
      // Also remove annotations for the deleted page and shift others
      setAnnotations(prev => prev
        .filter(a => a.page !== currentPage)
        .map(a => a.page > currentPage ? { ...a, page: a.page - 1 } : a)
      );
      toast.success(t.editor_toast_page_deleted ?? "Page deleted", { id: "delpage" });
    } catch {
      toast.error(t.editor_toast_page_delete_error ?? "Error deleting page", { id: "delpage" });
    }
  };

  // ── Build annotated PDF as Uint8Array (shared by download and paywall) ──
  const buildAnnotatedPdf = async (): Promise<Uint8Array | null> => {
    if (!pdfBytes) return null;
    // Use .slice() to create a fully independent copy of the bytes.
    // new Uint8Array(pdfBytes) shares the underlying buffer which can be detached.
    // .slice() always returns a new Uint8Array with its own fresh ArrayBuffer.
    const safeBytes = pdfBytes.slice();
    // Validate PDF header: search for %PDF in first 1024 bytes
    const headerSlice = safeBytes.slice(0, 1024);
    const headerStr = String.fromCharCode(...Array.from(headerSlice));
    if (!headerStr.includes("%PDF")) {
      toast.error("Error: los bytes del PDF son inválidos. Por favor, recarga el archivo.");
      return null;
    }
    const doc = await PDFDocument.load(safeBytes, { ignoreEncryption: true });
    const font = await doc.embedFont(StandardFonts.Helvetica);
    for (const ann of annotations) {
      const page = doc.getPage(ann.page - 1);
      const { height } = page.getSize();
      const pdfY = height - ann.y - ann.height;
      if (ann.type === "text" && ann.text) {
        page.drawText(ann.text, { x: ann.x, y: pdfY + ann.height / 2, size: ann.fontSize ?? 14, font, color: rgb(0, 0, 0) });
      } else if (ann.type === "signature" && ann.dataUrl) {
        const imgBytes = await fetch(ann.dataUrl).then(r => r.arrayBuffer());
        const img = await doc.embedPng(new Uint8Array(imgBytes));
        page.drawImage(img, { x: ann.x, y: pdfY, width: ann.width, height: ann.height });
      } else if (ann.type === "image" && ann.dataUrl) {
        const imgBytes = await fetch(ann.dataUrl).then(r => r.arrayBuffer());
        let img;
        try { img = await doc.embedPng(new Uint8Array(imgBytes)); }
        catch { img = await doc.embedJpg(new Uint8Array(imgBytes)); }
        page.drawImage(img, { x: ann.x, y: pdfY, width: ann.width, height: ann.height });
      } else if (ann.type === "highlight") {
        page.drawRectangle({ x: ann.x, y: pdfY, width: ann.width, height: ann.height, color: rgb(1, 1, 0), opacity: 0.4 });
      } else if (ann.type === "note" && ann.text) {
        page.drawRectangle({ x: ann.x, y: pdfY, width: ann.width, height: ann.height, color: rgb(1, 1, 0.6), opacity: 0.8 });
        page.drawText(ann.text, { x: ann.x + 6, y: pdfY + ann.height - 16, size: 10, font, color: rgb(0, 0, 0), maxWidth: ann.width - 12 });
      } else if (ann.type === "shape") {
        const c = ann.color ?? "#2563EB";
        const r2 = parseInt(c.slice(1, 3), 16) / 255;
        const g2 = parseInt(c.slice(3, 5), 16) / 255;
        const b2 = parseInt(c.slice(5, 7), 16) / 255;
        if (ann.text === "rect") {
          page.drawRectangle({ x: ann.x, y: pdfY, width: ann.width, height: ann.height, borderColor: rgb(r2, g2, b2), borderWidth: 2, color: rgb(r2, g2, b2), opacity: 0.15 });
        } else if (ann.text === "circle") {
          page.drawEllipse({ x: ann.x + ann.width / 2, y: pdfY + ann.height / 2, xScale: ann.width / 2, yScale: ann.height / 2, borderColor: rgb(r2, g2, b2), borderWidth: 2, color: rgb(r2, g2, b2), opacity: 0.15 });
        } else {
          page.drawLine({ start: { x: ann.x, y: pdfY }, end: { x: ann.x + ann.width, y: pdfY + ann.height }, thickness: 2, color: rgb(r2, g2, b2) });
        }
      } else if (ann.type === "eraser") {
        page.drawRectangle({ x: ann.x, y: pdfY, width: ann.width, height: ann.height, color: rgb(1, 1, 1), opacity: 1 });
      } else if (ann.type === "drawing" && ann.points && ann.points.length > 1) {
        const c = ann.color ?? "#FF0000";
        const r2 = parseInt(c.slice(1, 3), 16) / 255;
        const g2 = parseInt(c.slice(3, 5), 16) / 255;
        const b2 = parseInt(c.slice(5, 7), 16) / 255;
        const { height: ph } = page.getSize();
        for (let i = 1; i < ann.points.length; i++) {
          const p1 = ann.points[i - 1];
          const p2 = ann.points[i];
          page.drawLine({ start: { x: p1.x, y: ph - p1.y }, end: { x: p2.x, y: ph - p2.y }, thickness: ann.strokeWidth ?? 3, color: rgb(r2, g2, b2) });
        }
      }
    }
    // Apply native text edits: cover original text with white rect, draw new text
    // Collect edited blocks from ALL pages
    const editedBlocks: NativeTextBlock[] = [];
    allNativeTextBlocks.forEach(pageBlocks => {
      pageBlocks.filter(b => b.editedStr !== undefined).forEach(b => editedBlocks.push(b));
    });
    for (const block of editedBlocks) {
      const page = doc.getPage(block.page - 1);
      const { width: pageW } = page.getSize();
      // Use stored PDF point coordinates directly (no scale conversion needed)
      const pdfX = block.pdfX;
      const pdfY = block.pdfY;      // baseline y from bottom of page
      const fontSizePts = block.pdfFontSize;
      // Cover original text with a wide white rectangle that extends to the right edge of the page
      // This ensures the original text is fully hidden regardless of its actual width
      const coverWidth = pageW - pdfX + 10; // extend to right edge of page
      page.drawRectangle({
        x: pdfX - 4,
        y: pdfY - fontSizePts * 0.35,  // extra space below baseline for descenders
        width: coverWidth,
        height: fontSizePts * 1.6,      // extra height to cover ascenders and line spacing
        color: rgb(1, 1, 1),
        opacity: 1,
      });
      // Draw replacement text at the original baseline position
      const hexColor = block.fontColor ?? "#000000";
      const tr = parseInt(hexColor.slice(1, 3), 16) / 255;
      const tg = parseInt(hexColor.slice(3, 5), 16) / 255;
      const tb = parseInt(hexColor.slice(5, 7), 16) / 255;
      page.drawText(block.editedStr!, {
        x: pdfX,
        y: pdfY,
        size: fontSizePts,
        font,
        color: rgb(tr, tg, tb),
        maxWidth: coverWidth - 8,
      });
    }
    return doc.save();
  };

  // ── Search text in PDF ──────────────────────────────────────────────────────
  const searchInPdf = async () => {
    if (!pdfDoc || !searchQuery.trim()) {
      toast.error("Escribe algo para buscar");
      return;
    }
    setIsSearching(true);
    setSearchResults([]);
    const query = searchQuery.toLowerCase();
    const results: { page: number; text: string }[] = [];
    try {
      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items
          .map((item: any) => item.str || "")
          .join(" ");
        if (pageText.toLowerCase().includes(query)) {
          // Extract a snippet around the match
          const idx = pageText.toLowerCase().indexOf(query);
          const start = Math.max(0, idx - 40);
          const end = Math.min(pageText.length, idx + query.length + 40);
          const snippet = (start > 0 ? "..." : "") + pageText.slice(start, end) + (end < pageText.length ? "..." : "");
          results.push({ page: i, text: snippet });
        }
      }
      setSearchResults(results);
      if (results.length === 0) {
        toast.info(`"${searchQuery}" ${t.editor_toast_not_found}`);
      } else {
        toast.success(`${results.length} ${t.editor_toast_search_results}`);
      }
    } catch {
      toast.error("Error al buscar en el PDF");
    } finally {
      setIsSearching(false);
    }
  };
  // ── Helper: auto-save document to user panel ──────────────────────────────
  const autoSaveDocument = async (pdfOut: Uint8Array): Promise<{ docId: number; isPremium: boolean } | null> => {
    try {
      const safeBuffer = pdfOut.buffer.slice(pdfOut.byteOffset, pdfOut.byteOffset + pdfOut.byteLength) as ArrayBuffer;
      const blob = new Blob([safeBuffer], { type: "application/pdf" });
      const formData = new FormData();
      const autoSaveName = displayName || file?.name || "document.pdf";
      formData.append("file", blob, autoSaveName);
      formData.append("name", autoSaveName);
      const resp = await fetch("/api/documents/auto-save", {
        method: "POST",
        credentials: "include",
        body: formData,
      });
      if (!resp.ok) return null;
      const data = await resp.json();
      return { docId: data.doc?.id, isPremium: data.isPremium };
    } catch (err) {
      console.error("[autoSaveDocument]", err);
      return null;
    }
  };

  // ── Helper: trigger browser download ──────────────────────────────
  const triggerDownload = (pdfOut: Uint8Array, downloadName?: string) => {
    const blob = new Blob([pdfOut.buffer.slice(pdfOut.byteOffset, pdfOut.byteOffset + pdfOut.byteLength) as ArrayBuffer], { type: "application/pdf" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = downloadName ?? displayName ?? file?.name ?? "document.pdf";
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Helper: trigger browser download for any blob ──────────────────────────────
  const triggerBlobDownload = (blob: Blob, downloadName: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url;
    a.download = downloadName;
    a.click(); URL.revokeObjectURL(url);
  };

  // ── Ref to store pending tool download (blob + filename) for post-payment ──
  const pendingToolDownloadRef = useRef<{ blob: Blob; name: string } | null>(null);

  // ── Guarded download: checks auth + premium, opens paywall if needed ──
  const guardedDownload = async (blob: Blob, downloadName: string, toastId: string) => {
    // If premium → download immediately
    if (isPremium) {
      triggerBlobDownload(blob, downloadName);
      toast.success("Descarga completada", { id: toastId });
      return;
    }

    // Store the pending download for after payment
    pendingToolDownloadRef.current = { blob, name: downloadName };

    // Build paywall data from current PDF
    const pdfOut = await buildAnnotatedPdf();
    if (pdfOut) {
      const base64 = uint8ToBase64(pdfOut);
      setPdfDataForPaywall({ base64, name: displayName ?? file?.name ?? "document.pdf", size: pdfOut.byteLength });
    }

    if (!isAuthenticated) {
      sessionStorage.setItem("cloudpdf_pending_action", "download");
      if (file) { try { await savePdfToSession(file); } catch {} }
    }

    toast.dismiss(toastId);
    setShowPaywall(true);
  };

  // ── Download with annotations (SMART BUTTON) ─────────────────────────────────
  const downloadPdf = async () => {
    if (!pdfBytes) return;
    toast.loading("Preparando documento...", { id: "dl" });

    // Step 1: Build the annotated PDF (non-blocking — don't prevent paywall if it fails)
    let pdfOut: Uint8Array | null = null;
    try {
      pdfOut = await buildAnnotatedPdf();
    } catch (err) {
      console.error("[downloadPdf] buildAnnotatedPdf failed:", err);
    }

    const docName = displayName ?? file?.name ?? "document.pdf";

    // Step 2: If NOT authenticated → show paywall modal (auth-choice step)
    // Even if PDF build failed, we can still open paywall (PDF will be rebuilt later via buildPdfForUpload)
    if (!isAuthenticated) {
      if (pdfOut) {
        const base64 = uint8ToBase64(pdfOut);
        setPdfDataForPaywall({ base64, name: docName, size: pdfOut.byteLength });
      }
      sessionStorage.setItem("cloudpdf_pending_action", "download");
      if (file) {
        try { await savePdfToSession(file); } catch {}
      }
      toast.dismiss("dl");
      setShowPaywall(true);
      return;
    }

    // If build failed and user IS authenticated, show error and stop
    if (!pdfOut) {
      toast.error("Error al generar el PDF", { id: "dl" });
      return;
    }

    // Step 3: User IS authenticated
    setIsAutoSaving(true);
    try {
      // Auto-save document to user panel
      const result = await autoSaveDocument(pdfOut);
      if (result?.docId) {
        setSavedDocId(result.docId);
      }

      // Step 4: If premium → download immediately
      if (isPremium || result?.isPremium) {
        triggerDownload(pdfOut);
        toast.success("PDF descargado correctamente", { id: "dl" });
        setIsAutoSaving(false);
        return;
      }

      // Step 5: Not premium → show paywall with PDF data
      const base64 = uint8ToBase64(pdfOut);
      setPdfDataForPaywall({ base64, name: docName, size: pdfOut.byteLength });
      toast.dismiss("dl");
      setShowPaywall(true);
    } catch (err) {
      console.error("[downloadPdf]", err);
      toast.error("Error al preparar la descarga", { id: "dl" });
    } finally {
      setIsAutoSaving(false);
    }
  };

  // ── Apply initialTool when PDF is loaded ──────────────────────
  useEffect(() => {
    if (!initialTool || !pdfDoc) return;
    const toolMap: Record<string, ToolName> = {
      "text": "text", "sign": "sign", "notes": "notes",
      "image": "image", "protect": "protect", "compress": "compress",
      "highlight": "highlight", "eraser": "eraser", "brush": "brush",
      "shapes": "shapes", "find": "find", "move": "move",
      // Conversion tools
      "convert-jpg": "convert-jpg", "convert-png": "convert-png",
      "convert-word": "convert-word", "convert-excel": "convert-excel",
      "convert-ppt": "convert-ppt", "convert-html": "convert-html",
      "word-to-pdf": "word-to-pdf", "excel-to-pdf": "excel-to-pdf",
      "ppt-to-pdf": "ppt-to-pdf", "jpg-to-pdf": "jpg-to-pdf",
      "png-to-pdf": "png-to-pdf", "merge": "merge",
    };
    const mapped = toolMap[initialTool];
    if (mapped) setActiveTool(mapped);
  }, [initialTool, pdfDoc]);

  // ── Keyboard shortcuts ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === "z") { e.preventDefault(); undo(); }
      if (e.ctrlKey && e.key === "y") { e.preventDefault(); redo(); }
      if (e.key === "Delete" || e.key === "Backspace") {
        if (selectedId && document.activeElement?.tagName !== "INPUT" && document.activeElement?.tagName !== "TEXTAREA") {
          deleteSelected();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [undo, redo, deleteSelected, selectedId]);

  // ── Upload zone (no PDF loaded) ───────────────────────────────
  // File-free tools: show a special layout without PDF viewer
  const FILE_FREE_TOOLS_SET = new Set(["jpg-to-pdf", "png-to-pdf", "word-to-pdf", "excel-to-pdf", "ppt-to-pdf"]);
  const isFileFreeMode = initialTool && FILE_FREE_TOOLS_SET.has(initialTool) && !file;

  // Full-screen PDF loading overlay (for native PDFs)
  if (isLoadingPdf) {
    return (
      <div className="w-full rounded-2xl flex flex-col items-center justify-center py-20 px-8 text-center" style={{ backgroundColor: "oklch(0.98 0.005 250)", border: "2px solid oklch(0.90 0.03 260)" }}>
        {/* Animated PDF icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.10)" }}>
            <FileText className="w-10 h-10 animate-pulse" style={{ color: "oklch(0.55 0.22 260)" }} />
          </div>
          {/* Spinning ring around icon */}
          <div className="absolute inset-0 w-20 h-20 rounded-2xl animate-spin" style={{ border: "3px solid transparent", borderTopColor: "oklch(0.55 0.22 260)", animationDuration: "1.5s" }} />
        </div>
        {/* Title */}
        <p className="text-xl font-bold mb-2" style={{ color: "oklch(0.18 0.04 250)" }}>
          {t.editor_loading_pdf}
        </p>
        <p className="text-sm mb-6" style={{ color: "oklch(0.50 0.02 250)" }}>
          {initialFile?.name ?? ""}
        </p>
        {/* Progress bar */}
        <div className="w-full max-w-xs mb-3">
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "oklch(0.92 0.02 260)" }}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${pdfLoadProgress}%`,
                backgroundColor: pdfLoadProgress === 100 ? "oklch(0.55 0.18 145)" : "oklch(0.55 0.22 260)",
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs font-medium" style={{ color: "oklch(0.45 0.02 250)" }}>
              {pdfLoadProgress < 20 ? t.editor_loading_pdf_reading : pdfLoadProgress < 55 ? t.editor_loading_pdf_parsing : pdfLoadProgress < 95 ? t.editor_loading_pdf_thumbnails : t.editor_loading_pdf_ready}
            </span>
            <span className="text-xs font-semibold" style={{ color: "oklch(0.55 0.22 260)" }}>{pdfLoadProgress}%</span>
          </div>
        </div>
      </div>
    );
  }

  // Full-screen conversion loading overlay
  if (isConvertingFile) {
    return (
      <div className="w-full rounded-2xl flex flex-col items-center justify-center py-20 px-8 text-center" style={{ backgroundColor: "oklch(0.98 0.005 250)", border: "2px solid oklch(0.90 0.03 260)" }}>
        {/* Animated file icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.10)" }}>
            <FileText className="w-10 h-10 animate-pulse" style={{ color: "oklch(0.55 0.22 260)" }} />
          </div>
          {/* Spinning ring around icon */}
          <div className="absolute inset-0 w-20 h-20 rounded-2xl animate-spin" style={{ border: "3px solid transparent", borderTopColor: "oklch(0.55 0.22 260)", animationDuration: "1.5s" }} />
        </div>
        {/* Title */}
        <p className="text-xl font-bold mb-2" style={{ color: "oklch(0.18 0.04 250)" }}>
          {t.editor_toast_converting}
        </p>
        <p className="text-sm mb-6" style={{ color: "oklch(0.50 0.02 250)" }}>
          {initialFile?.name ?? ""}
        </p>
        {/* Progress bar */}
        <div className="w-full max-w-xs mb-3">
          <div className="h-3 rounded-full overflow-hidden" style={{ backgroundColor: "oklch(0.92 0.02 260)" }}>
            <div
              className="h-full rounded-full transition-all duration-300 ease-out"
              style={{
                width: `${convertFileProgress}%`,
                backgroundColor: convertFileProgress === 100 ? "oklch(0.55 0.18 145)" : "oklch(0.55 0.22 260)",
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs font-medium" style={{ color: "oklch(0.45 0.02 250)" }}>
              {convertFileProgress < 30 ? t.editor_converting_uploading : convertFileProgress < 85 ? t.editor_converting_processing : convertFileProgress < 100 ? t.editor_converting_finishing : t.editor_toast_converted}
            </span>
            <span className="text-xs font-semibold" style={{ color: "oklch(0.55 0.22 260)" }}>{convertFileProgress}%</span>
          </div>
        </div>
      </div>
    );
  }

  if (!file || !pdfDoc) {
    // Note: file-free mode is handled below after renderToolPanel is defined
    if (!isFileFreeMode) return (
      <div
        className="w-full rounded-2xl border-2 border-dashed flex flex-col items-center justify-center py-16 px-8 text-center cursor-pointer transition-all"
        style={{ borderColor: "oklch(0.75 0.10 260)", backgroundColor: "oklch(0.98 0.005 250)" }}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.10)" }}>
          <FileText className="w-8 h-8" style={{ color: "oklch(0.55 0.22 260)" }} />
        </div>
        <p className="text-lg font-semibold mb-1" style={{ color: "oklch(0.55 0.22 260)" }}>{t.hero_drag_here}</p>
        <p className="text-sm mb-4" style={{ color: "oklch(0.55 0.03 250)" }}>{t.editor_or}</p>
        <button
          className="px-6 py-2.5 rounded-lg text-white font-semibold text-sm"
          style={{ backgroundColor: "oklch(0.18 0.04 250)" }}
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        >
          <Upload className="w-4 h-4 inline mr-2" />{t.hero_upload_btn}
        </button>
        <p className="text-xs mt-3" style={{ color: "oklch(0.60 0.02 250)" }}>{t.hero_max_size}</p>
        <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tiff,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.html,.txt" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
      </div>
    );
  }

  // ── Tool panel content ────────────────────────────────────────
  const renderToolPanel = () => {
    // Shared action bar shown at the top of every tool panel (except pointer/default)
    const showActionBar = activeTool !== "pointer" && activeTool !== "compress" && activeTool !== "protect" && activeTool !== "find";
    const pageAnnCount = annotations.filter(a => a.page === currentPage).length;
    const ActionBar = showActionBar ? (
      <div className="flex flex-wrap gap-1.5 p-3 border-b" style={{ borderColor: "oklch(0.90 0.01 250)", backgroundColor: "oklch(0.97 0.005 250)" }}>
        <button
          onClick={undo}
          disabled={historyIndex <= 0}
          title={t.editor_undo_tooltip}
          className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border transition-all disabled:opacity-40"
          style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.35 0.02 250)", backgroundColor: "#fff" }}
        >
          <Undo2 className="w-3 h-3 shrink-0" />
          <span className="truncate">{t.editor_undo}</span>
        </button>
        <button
          onClick={deleteLastAnnotation}
          disabled={pageAnnCount === 0}
          title={t.editor_delete_last}
          className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border transition-all disabled:opacity-40"
          style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.35 0.02 250)", backgroundColor: "#fff" }}
        >
          <Trash2 className="w-3 h-3 shrink-0" />
          <span className="truncate">{t.editor_delete_last}</span>
        </button>
        <button
          onClick={deleteAllPageAnnotations}
          disabled={pageAnnCount === 0}
          title={t.editor_delete_all}
          className="flex-1 min-w-0 flex items-center justify-center gap-1 py-1.5 rounded text-xs font-medium border transition-all disabled:opacity-40"
          style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.55 0.20 15)", backgroundColor: "#fff" }}
        >
          <Trash2 className="w-3 h-3 shrink-0" />
          <span className="truncate">{t.editor_delete_all}</span>
        </button>
      </div>
    ) : null;

    switch (activeTool) {
      case "sign":
        return (
          <div className="flex flex-col">
            {ActionBar}
            <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_sign}</h3>
            {/* Tabs: Draw / Write / Image */}
            <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: "oklch(0.93 0.01 250)" }}>
              {(["draw", "write", "image"] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setSignTab(tab)}
                  className="flex-1 py-1.5 rounded text-xs font-medium transition-all"
                  style={{
                    backgroundColor: signTab === tab ? "#fff" : "transparent",
                    color: signTab === tab ? "oklch(0.15 0.03 250)" : "oklch(0.50 0.02 250)",
                    boxShadow: signTab === tab ? "0 1px 3px rgba(0,0,0,0.1)" : "none"
                  }}
                >{tab === "draw" ? t.editor_sign_draw_tab : tab === "write" ? t.editor_sign_write_tab : t.editor_sign_image_tab}</button>
              ))}
            </div>

            {/* ── Draw Tab ── */}
            {signTab === "draw" && (
              <>
                {/* Color + stroke width controls */}
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <label className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_color_label ?? "Color"}</label>
                    <input type="color" value={signColor} onChange={e => setSignColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" />
                  </div>
                  <div className="flex items-center gap-1.5 flex-1">
                    <label className="text-xs whitespace-nowrap" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_width_label ?? "Grosor"}: {signStrokeWidth}px</label>
                    <input type="range" min={1} max={8} step={0.5} value={signStrokeWidth} onChange={e => setSignStrokeWidth(Number(e.target.value))} className="flex-1" />
                  </div>
                </div>
                <SignatureCanvas
                  color={signColor}
                  strokeWidth={signStrokeWidth}
                  onPlaceSignature={(dataUrl) => {
                    addAnnotation({ type: "signature", dataUrl, x: 100, y: 100, width: 200, height: 80, page: currentPage });
                    toast.success(t.editor_sign_added ?? "Firma añadida. Arrástrala para posicionarla.");
                  }}
                  clearLabel={t.editor_cancel_btn ?? "Limpiar"}
                  placeLabel={t.editor_sign_insert_btn ?? "Insertar firma"}
                />
              </>
            )}

            {/* ── Write Tab ── */}
            {signTab === "write" && (
              <>
                <input
                  type="text"
                  value={signName}
                  onChange={e => setSignName(e.target.value)}
                  placeholder={t.editor_sign_name_placeholder}
                  className="w-full border rounded px-3 py-2 text-sm"
                  style={{ borderColor: "oklch(0.80 0.05 260)", fontFamily: signFont, fontSize: 20, color: signColor }}
                />
                {/* Font selector */}
                <div className="grid grid-cols-1 gap-1.5">
                  {[
                    { label: "Dancing Script", value: "'Dancing Script', cursive" },
                    { label: "Alex Brush", value: "'Alex Brush', cursive" },
                    { label: "Great Vibes", value: "'Great Vibes', cursive" },
                    { label: "Pacifico", value: "'Pacifico', cursive" },
                    { label: "Sacramento", value: "'Sacramento', cursive" },
                  ].map(f => (
                    <button
                      key={f.value}
                      onClick={() => setSignFont(f.value)}
                      className="px-3 py-2 rounded border text-left transition-all"
                      style={{
                        borderColor: signFont === f.value ? "oklch(0.55 0.22 260)" : "oklch(0.88 0.02 250)",
                        backgroundColor: signFont === f.value ? "oklch(0.55 0.22 260 / 0.08)" : "#fff",
                        fontFamily: f.value,
                        fontSize: 20,
                        color: signColor,
                      }}
                    >{signName || f.label}</button>
                  ))}
                </div>
                {/* Color picker */}
                <div className="flex items-center gap-2">
                  <label className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_color_label ?? "Color"}</label>
                  <input type="color" value={signColor} onChange={e => setSignColor(e.target.value)} className="w-7 h-7 rounded cursor-pointer border-0" />
                </div>
                <button
                  onClick={placeNameSignature}
                  className="py-2 rounded text-white text-sm font-semibold"
                  style={{ backgroundColor: "oklch(0.55 0.22 260)" }}
                >{t.editor_sign_insert_btn}</button>
              </>
            )}

            {/* ── Image Tab ── */}
            {signTab === "image" && (
              <>
                <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_sign_image_hint}</p>
                <label
                  className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed cursor-pointer transition-all"
                  style={{ borderColor: "oklch(0.80 0.05 260)", backgroundColor: "oklch(0.97 0.005 250)" }}
                >
                  <Upload className="w-8 h-8" style={{ color: "oklch(0.55 0.22 260)" }} />
                  <span className="text-sm font-medium" style={{ color: "oklch(0.35 0.02 250)" }}>{t.editor_sign_image_upload ?? "Haz clic para subir imagen"}</span>
                  <span className="text-xs" style={{ color: "oklch(0.55 0.02 250)" }}>{t.editor_sign_image_formats ?? "PNG, JPG, GIF"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={e => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const dataUrl = ev.target?.result as string;
                        const img = new Image();
                        img.onload = () => {
                          const aspect = img.width / img.height;
                          const w = Math.min(240, img.width);
                          const h = w / aspect;
                          addAnnotation({ type: "signature", dataUrl, x: 100, y: 100, width: w, height: h, page: currentPage });
                          toast.success(t.editor_sign_image_added ?? "Imagen de firma añadida. Arrástrala para posicionarla.");
                        };
                        img.src = dataUrl;
                      };
                      reader.readAsDataURL(file);
                    }}
                  />
                </label>
              </>
            )}
            </div>
          </div>
        );
      case "text": {
        // Find the selected text annotation (if any)
        const selectedTextAnn = selectedId ? annotations.find(a => a.id === selectedId && a.type === "text") : null;
        const isEditingExisting = !!selectedTextAnn;

        // Sync panel changes to the selected annotation in real-time
        const updateSelectedTextProp = (prop: Partial<Annotation>) => {
          if (!selectedTextAnn) return;
          setAnnotations(prev => prev.map(a => a.id === selectedTextAnn.id ? { ...a, ...prop } : a));
        };

        return (
          <div className="flex flex-col">
            {ActionBar}
            <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>
              {isEditingExisting ? t.editor_panel_edit_text : t.editor_panel_add_text}
            </h3>

            {/* Instruction when no text is selected */}
            {!isEditingExisting && (
              <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.06)", color: "oklch(0.35 0.02 250)" }}>
                <strong>{t.editor_panel_how_to_use}</strong> {t.editor_panel_text_hint}
              </div>
            )}

            {/* Text content — editable for selected annotation */}
            {isEditingExisting && (
              <div>
                <label className="text-xs block mb-1" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_content}</label>
                <textarea
                  value={selectedTextAnn.text ?? ""}
                  onChange={e => {
                    const val = e.target.value;
                    updateSelectedTextProp({ text: val, width: Math.max(150, val.length * ((selectedTextAnn.fontSize ?? 14) * 0.6)), height: Math.max((selectedTextAnn.fontSize ?? 14) + 16, val.split("\n").length * ((selectedTextAnn.fontSize ?? 14) * 1.3) + 16) });
                  }}
                  onBlur={() => pushHistory(annotationsRef.current)}
                  placeholder={t.editor_text_placeholder}
                  rows={3}
                  className="w-full rounded border p-2 text-sm resize-none"
                  style={{ borderColor: "oklch(0.80 0.05 260)", fontFamily: selectedTextAnn.fontFamily ?? textFont, color: selectedTextAnn.color ?? textColor }}
                />
              </div>
            )}

            {/* Font selector */}
            <div>
              <label className="text-xs block mb-1" style={{ color: "oklch(0.50 0.02 250)" }}>Fuente</label>
              <select
                value={isEditingExisting ? (selectedTextAnn.fontFamily ?? textFont) : textFont}
                onChange={e => {
                  const val = e.target.value;
                  setTextFont(val);
                  if (isEditingExisting) updateSelectedTextProp({ fontFamily: val });
                }}
                className="w-full border rounded px-2 py-1.5 text-xs"
                style={{ borderColor: "oklch(0.80 0.05 260)", fontFamily: isEditingExisting ? (selectedTextAnn.fontFamily ?? textFont) : textFont }}
              >
                {FONT_OPTIONS.map(f => (
                  <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="flex gap-2 items-center">
              <label className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>Color</label>
              <input
                type="color"
                value={isEditingExisting ? (selectedTextAnn.color ?? textColor) : textColor}
                onChange={e => {
                  const val = e.target.value;
                  setTextColor(val);
                  if (isEditingExisting) updateSelectedTextProp({ color: val });
                }}
                className="w-8 h-8 rounded cursor-pointer border-0"
              />
              <label className="text-xs ml-2" style={{ color: "oklch(0.50 0.02 250)" }}>Tamaño</label>
              <input
                type="number"
                value={isEditingExisting ? (selectedTextAnn.fontSize ?? textSize) : textSize}
                onChange={e => {
                  const val = Number(e.target.value);
                  setTextSize(val);
                  if (isEditingExisting) updateSelectedTextProp({ fontSize: val, height: Math.max(val + 16, (selectedTextAnn.text ?? "").split("\n").length * (val * 1.3) + 16) });
                }}
                min={8} max={120}
                className="w-14 border rounded px-1 py-0.5 text-xs"
                style={{ borderColor: "oklch(0.80 0.05 260)" }}
              />
            </div>

            {/* Actions */}
            {isEditingExisting ? (
              <div className="flex gap-2">
                <button
                  onClick={() => { setEditingTextId(selectedTextAnn.id); }}
                  className="flex-1 py-2 rounded text-white text-xs font-semibold"
                  style={{ backgroundColor: "oklch(0.55 0.22 260)" }}
                >
                  Editar en el PDF
                </button>
                <button
                  onClick={() => { setSelectedId(null); setEditingTextId(null); }}
                  className="flex-1 py-2 rounded text-xs border font-medium"
                  style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.40 0.02 250)" }}
                >
                  Deseleccionar
                </button>
              </div>
            ) : (
              <div className="p-2 rounded text-center text-xs" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.08)", color: "oklch(0.40 0.15 260)" }}>
                Haz clic en el PDF para colocar texto
              </div>
            )}
            </div>
          </div>
        );
      }
      case "highlight":
        return (
          <div className="flex flex-col">
            {ActionBar}
            <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_highlighter}</h3>
            <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_highlight_hint}</p>
            <div className="flex gap-2 flex-wrap">
              {["#FFFF00", "#00FF00", "#FF69B4", "#87CEEB", "#FFA500"].map(c => (
                <button key={c} onClick={() => setHighlightColor(c)} className="w-8 h-8 rounded-full border-2 transition-all" style={{ backgroundColor: c, borderColor: highlightColor === c ? "oklch(0.18 0.04 250)" : "transparent" }} />
              ))}
            </div>
            <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: highlightColor + "33", color: "oklch(0.30 0.02 250)" }}>
              <strong>{t.editor_panel_how_to_use}</strong> {t.editor_panel_highlight_hint}
            </div>
            </div>
          </div>
        );
      case "notes":
        return (
          <div className="flex flex-col">
            {ActionBar}
            <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_add_note}</h3>
            <textarea
              value={noteText} onChange={e => setNoteText(e.target.value)}
              placeholder={t.editor_note_placeholder}
              rows={4}
              className="w-full rounded border p-2 text-sm resize-none"
              style={{ borderColor: "oklch(0.80 0.05 260)" }}
            />
            <button onClick={placeNote} className="py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: "oklch(0.55 0.22 260)" }}>{t.editor_panel_insert_note}</button>
            </div>
          </div>
        );
      case "image":
        return (
          <div className="flex flex-col">
            {ActionBar}
            <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_insert_image}</h3>
            <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_upload_image_hint}</p>
            <label className="flex flex-col items-center gap-2 py-4 border-2 border-dashed rounded-lg cursor-pointer" style={{ borderColor: "oklch(0.75 0.10 260)" }}>
              <ImageIcon className="w-8 h-8" style={{ color: "oklch(0.55 0.22 260)" }} />
              <span className="text-xs font-medium" style={{ color: "oklch(0.55 0.22 260)" }}>{t.editor_panel_select_image_label}</span>
              <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
            </label>
            <div className="border-t pt-3 mt-1" style={{ borderColor: "oklch(0.90 0.01 250)" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "oklch(0.35 0.02 250)" }}>{t.editor_panel_convert_image_to_pdf}</p>
              <label className="flex items-center gap-2 py-2 px-3 rounded border cursor-pointer text-xs" style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.40 0.02 250)" }}>
                <Upload className="w-3 h-3" />{t.editor_panel_select_image_label} → PDF
                <input type="file" accept="image/*" className="hidden" onChange={convertImageToPdf} />
              </label>
            </div>
            </div>
          </div>
        );
      case "shapes":
        return (
          <div className="flex flex-col">
            {ActionBar}
            <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_shapes}</h3>
            <div className="flex gap-2">
              {(["rect", "circle", "line"] as const).map(s => (
                <button key={s} onClick={() => setShapeType(s)} className="flex-1 py-1.5 rounded text-xs border" style={{ borderColor: shapeType === s ? "oklch(0.55 0.22 260)" : "oklch(0.80 0.05 260)", backgroundColor: shapeType === s ? "oklch(0.55 0.22 260 / 0.10)" : "transparent", color: "oklch(0.35 0.02 250)" }}>
                  {s === "rect" ? t.editor_shape_rect : s === "circle" ? t.editor_shape_circle : t.editor_shape_line}
                </button>
              ))}
            </div>
            {/* Fill toggle */}
            {shapeType !== "line" && (
              <div className="flex gap-1 p-1 rounded-lg" style={{ backgroundColor: "oklch(0.93 0.01 250)" }}>
                <button
                  onClick={() => setShapeFilled(false)}
                  className="flex-1 py-1.5 rounded text-xs font-medium transition-all"
                  style={{ backgroundColor: !shapeFilled ? "#fff" : "transparent", color: !shapeFilled ? "oklch(0.15 0.03 250)" : "oklch(0.50 0.02 250)", boxShadow: !shapeFilled ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}
                >{t.editor_shape_outline}</button>
                <button
                  onClick={() => setShapeFilled(true)}
                  className="flex-1 py-1.5 rounded text-xs font-medium transition-all"
                  style={{ backgroundColor: shapeFilled ? "#fff" : "transparent", color: shapeFilled ? "oklch(0.15 0.03 250)" : "oklch(0.50 0.02 250)", boxShadow: shapeFilled ? "0 1px 3px rgba(0,0,0,0.1)" : "none" }}
                >{t.editor_shape_fill}</button>
              </div>
            )}
            <div className="flex gap-2 items-center">
              <label className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>Color</label>
              <input type="color" value={shapeColor} onChange={e => setShapeColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
              {/* Preview */}
              <div style={{ width: 40, height: 28, border: `2px solid ${shapeColor}`, borderRadius: shapeType === "circle" ? "50%" : 3, backgroundColor: shapeFilled ? shapeColor : "transparent", flexShrink: 0 }} />
            </div>
            <button onClick={placeShape} className="py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: "oklch(0.55 0.22 260)" }}>{t.editor_panel_insert_shape}</button>
            </div>
          </div>
        );
      case "protect":
        return (
          <div className="p-4 flex flex-col gap-3">
            {protectResult ? (
              /* ── Protect Result View ── */
              <>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "oklch(0.85 0.15 145)" }}>
                    <svg className="w-5 h-5" style={{ color: "oklch(0.40 0.20 145)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_protect_result_title}</h3>
                </div>
                <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_protect_result_desc}</p>
                <div className="flex gap-2">
                  <button onClick={() => { setProtectResult(null); setPassword(""); setConfirmPassword(""); }} className="flex-1 py-2 rounded text-sm font-medium border" style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.40 0.02 250)" }}>
                    {t.editor_protect_return}
                  </button>
                  <button onClick={downloadProtectedPdf} className="flex-1 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: "oklch(0.25 0.03 250)" }}>
                    <Download className="w-4 h-4 inline mr-1" />{t.editor_protect_download}
                  </button>
                </div>
              </>
            ) : (
              /* ── Protect Controls ── */
              <>
                <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_protect_title}</h3>
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: "oklch(0.85 0.03 260)" }}>
                  <div className="px-3 py-2" style={{ backgroundColor: "oklch(0.96 0.01 260)" }}>
                    <p className="text-xs font-medium" style={{ color: "oklch(0.35 0.03 250)" }}>{t.editor_protect_desc}</p>
                  </div>
                  <div className="p-3 flex flex-col gap-2">
                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password} onChange={e => setPassword(e.target.value)}
                        placeholder={t.editor_protect_placeholder}
                        className="w-full border rounded px-3 py-2 text-sm pr-10"
                        style={{ borderColor: "oklch(0.80 0.05 260)" }}
                      />
                      <button onClick={() => setShowPassword(v => !v)} className="absolute right-2 top-2.5">
                        {showPassword ? <EyeOff className="w-4 h-4" style={{ color: "oklch(0.55 0.02 250)" }} /> : <Eye className="w-4 h-4" style={{ color: "oklch(0.55 0.02 250)" }} />}
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
                        placeholder={t.editor_protect_confirm_placeholder}
                        className="w-full border rounded px-3 py-2 text-sm pr-10"
                        style={{ borderColor: confirmPassword && password !== confirmPassword ? "oklch(0.55 0.22 25)" : "oklch(0.80 0.05 260)" }}
                      />
                      <button onClick={() => setShowConfirmPassword(v => !v)} className="absolute right-2 top-2.5">
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" style={{ color: "oklch(0.55 0.02 250)" }} /> : <Eye className="w-4 h-4" style={{ color: "oklch(0.55 0.02 250)" }} />}
                      </button>
                    </div>
                    {confirmPassword && password !== confirmPassword && (
                      <p className="text-xs" style={{ color: "oklch(0.50 0.22 25)" }}>{t.editor_protect_passwords_mismatch}</p>
                    )}
                  </div>
                </div>
                <div className="border rounded-lg overflow-hidden" style={{ borderColor: "oklch(0.85 0.03 260)" }}>
                  <div className="px-3 py-2" style={{ backgroundColor: "oklch(0.96 0.01 260)" }}>
                    <p className="text-xs font-medium" style={{ color: "oklch(0.35 0.03 250)" }}>{t.editor_protect_algo_label}</p>
                  </div>
                  <div className="p-3 flex flex-col gap-1.5">
                    <div className="flex items-center gap-2">
                      <Lock className="w-3.5 h-3.5" style={{ color: "oklch(0.45 0.05 250)" }} />
                      <span className="text-xs" style={{ color: "oklch(0.35 0.02 250)" }}>128-bit RC4</span>
                    </div>
                  </div>
                </div>
                {/* Progress bar */}
                {isProtecting && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs" style={{ color: "oklch(0.45 0.02 250)" }}>
                      <span>{protectProgress < 100 ? (t.editor_toast_protecting ?? "Protecting PDF...") : (t.editor_toast_protected ?? "Protected!")}</span>
                      <span>{Math.round(protectProgress)}%</span>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 6, backgroundColor: "oklch(0.90 0.02 260)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{ width: `${protectProgress}%`, backgroundColor: protectProgress === 100 ? "oklch(0.55 0.18 145)" : "oklch(0.55 0.22 260)" }}
                      />
                    </div>
                  </div>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => { setPassword(""); setConfirmPassword(""); }}
                    disabled={isProtecting}
                    className="flex-1 py-2 rounded text-sm border font-medium disabled:opacity-40"
                    style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.40 0.02 250)" }}
                  >
                    {t.editor_cancel_btn}
                  </button>
                  <button
                    onClick={protectPdf}
                    disabled={!password || password !== confirmPassword || isProtecting}
                    className="flex-1 py-2 rounded text-white text-sm font-semibold disabled:opacity-50"
                    style={{ backgroundColor: "oklch(0.25 0.03 250)" }}
                  >
                    {isProtecting ? `${Math.round(protectProgress)}%` : t.editor_protect_btn}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      case "compress":
        return (
          <div className="p-4 flex flex-col gap-3">
            {compressResult ? (
              /* ── Compress Result View ── */
              <>
                <div className="flex items-center gap-2 mb-1">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: "oklch(0.85 0.15 145)" }}>
                    <svg className="w-5 h-5" style={{ color: "oklch(0.40 0.20 145)" }} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                  </div>
                  <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_compress_result_title}</h3>
                </div>
                <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_compress_result_desc}</p>
                <div className="rounded-lg p-3 flex flex-col gap-2" style={{ backgroundColor: "oklch(0.97 0.005 250)" }}>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_compress_original}</span>
                    <span className="font-medium" style={{ color: "oklch(0.30 0.02 250)" }}>{(compressResult.originalSize / 1024 / 1024).toFixed(1)} MB</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_compress_compressed}</span>
                    <span className="font-medium" style={{ color: "oklch(0.30 0.02 250)" }}>{compressResult.compressedSize < 1024 * 1024 ? (compressResult.compressedSize / 1024).toFixed(1) + " KB" : (compressResult.compressedSize / 1024 / 1024).toFixed(1) + " MB"}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between text-xs" style={{ borderColor: "oklch(0.90 0.01 250)" }}>
                    <span style={{ color: "oklch(0.40 0.15 145)" }}>{t.editor_compress_saved}</span>
                    <span className="font-semibold" style={{ color: "oklch(0.40 0.20 145)" }}>{Math.max(0, Math.round((1 - compressResult.compressedSize / compressResult.originalSize) * 100))}%</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setCompressResult(null)} className="flex-1 py-2 rounded text-sm font-medium border" style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.40 0.02 250)" }}>
                    {t.editor_compress_return}
                  </button>
                  <button onClick={downloadCompressedPdf} className="flex-1 py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: "oklch(0.35 0.05 250)" }}>
                    <Download className="w-4 h-4 inline mr-1" />{t.editor_compress_download}
                  </button>
                </div>
              </>
            ) : (
              /* ── Compress Controls ── */
              <>
                <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_compress_pdf}</h3>
                <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_compress_desc}</p>
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between text-xs" style={{ color: "oklch(0.45 0.02 250)" }}>
                    <span>{t.editor_compress_quality}</span><span>{compressQuality}%</span>
                  </div>
                  <input type="range" min={20} max={100} value={compressQuality} onChange={e => setCompressQuality(Number(e.target.value))} className="w-full" />
                </div>
                <button onClick={compressPdf} disabled={isCompressing} className="py-2 rounded text-white text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: "oklch(0.55 0.22 260)" }}>
                  {isCompressing ? (
                    <><svg className="w-4 h-4 inline mr-1 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg>{t.editor_toast_compressing}</>
                  ) : (
                    <><Minimize2 className="w-4 h-4 inline mr-1" />{t.editor_compress_btn_only}</>
                  )}
                </button>
              </>  
            )}
            <div className="border-t pt-3" style={{ borderColor: "oklch(0.90 0.01 250)" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "oklch(0.35 0.02 250)" }}>{t.editor_panel_convert_to_image}</p>
              <div className="flex gap-2">
                <button onClick={() => convertToImage("jpg")} className="flex-1 py-1.5 rounded text-xs border" style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.40 0.02 250)" }}>JPG</button>
                <button onClick={() => convertToImage("png")} className="flex-1 py-1.5 rounded text-xs border" style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.40 0.02 250)" }}>PNG</button>
                <button onClick={() => convertAllToImages("jpg")} className="flex-1 py-1.5 rounded text-xs border" style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.40 0.02 250)" }}>{t.editor_panel_export_all} JPG</button>
              </div>
            </div>
            <div className="border-t pt-3" style={{ borderColor: "oklch(0.90 0.01 250)" }}>
              <p className="text-xs font-medium mb-2" style={{ color: "oklch(0.35 0.02 250)" }}>{t.editor_panel_merge_with_pdf}</p>
              <label className="flex items-center gap-2 py-2 px-3 rounded border cursor-pointer text-xs" style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.40 0.02 250)" }}>
                <Layers className="w-3 h-3" />{t.editor_panel_select_pdfs}
                <input type="file" accept=".pdf" multiple className="hidden" onChange={mergePdfs} />
              </label>
            </div>
            {totalPages > 1 && (
              <div className="border-t pt-3" style={{ borderColor: "oklch(0.90 0.01 250)" }}>
                <p className="text-xs font-medium mb-2" style={{ color: "oklch(0.35 0.02 250)" }}>{t.editor_panel_split_at_page}</p>
                <div className="flex gap-2 items-center">
                  <input type="number" min={1} max={totalPages - 1} defaultValue={Math.floor(totalPages / 2)} id="splitAt" className="w-16 border rounded px-2 py-1 text-xs" style={{ borderColor: "oklch(0.80 0.05 260)" }} />
                  <button onClick={() => {
                    const v = Number((document.getElementById("splitAt") as HTMLInputElement).value);
                    splitPdf(v);
                  }} className="flex-1 py-1.5 rounded text-xs text-white" style={{ backgroundColor: "oklch(0.55 0.22 260)" }}>
                    <Scissors className="w-3 h-3 inline mr-1" />{t.editor_panel_split_btn}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      case "find":
        return (
          <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_find_text}</h3>
            <input
              type="text" value={searchQuery}
              onChange={e => { setSearchQuery(e.target.value); setSearchResults([]); }}
              onKeyDown={e => e.key === "Enter" && searchInPdf()}
              placeholder={t.editor_search_placeholder}
              className="w-full border rounded px-3 py-2 text-sm"
              style={{ borderColor: "oklch(0.80 0.05 260)" }}
            />
            <button
              onClick={searchInPdf}
              disabled={isSearching || !searchQuery.trim()}
              className="py-2 rounded text-white text-sm font-semibold disabled:opacity-50"
              style={{ backgroundColor: "oklch(0.55 0.22 260)" }}
            >
              <Search className="w-4 h-4 inline mr-1" />
              {isSearching ? t.editor_searching : t.editor_search_btn}
            </button>
            {searchResults.length > 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-xs font-medium" style={{ color: "oklch(0.40 0.02 250)" }}>
                  {searchResults.length} {t.editor_toast_search_results}
                </p>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {searchResults.map((r, i) => (
                    <button
                      key={i}
                      onClick={() => setCurrentPage(r.page)}
                      className="text-left p-2 rounded text-xs hover:bg-blue-50 transition-colors"
                      style={{ backgroundColor: "oklch(0.97 0.005 250)", color: "oklch(0.35 0.02 250)" }}
                    >
                      <span className="font-semibold" style={{ color: "oklch(0.55 0.22 260)" }}>{t.editor_panel_page_short} {r.page}</span>
                      {" "}—{" "}
                      <span>{r.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      case "eraser":
        return (
          <div className="flex flex-col">
            {ActionBar}
            <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_eraser}</h3>
            <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_eraser_hint}</p>
            <div>
              <label className="text-xs block mb-1" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_eraser_size}</label>
              <input type="range" min={10} max={100} value={eraserSize} onChange={e => setEraserSize(Number(e.target.value))} className="w-full" />
              <span className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{eraserSize}px</span>
            </div>
            <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: "oklch(0.95 0.01 250)", color: "oklch(0.30 0.02 250)" }}>
              <strong>{t.editor_panel_how_to_use}</strong> {t.editor_panel_eraser_hint}
            </div>
            </div>
          </div>
        );
      case "brush":
        return (
          <div className="flex flex-col">
            {ActionBar}
            <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_brush}</h3>
            <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_brush_hint}</p>
            <div className="flex gap-2 items-center">
              <label className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>Color</label>
              <input type="color" value={brushColor} onChange={e => setBrushColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
            </div>
            <div>
              <label className="text-xs block mb-1" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_brush_thickness}: {brushSize}px</label>
              <input type="range" min={1} max={20} value={brushSize} onChange={e => setBrushSize(Number(e.target.value))} className="w-full" />
            </div>
            <div className="p-2 rounded border" style={{ borderColor: "oklch(0.88 0.02 250)", backgroundColor: "#fff" }}>
              <div style={{ width: 40, height: brushSize, backgroundColor: brushColor, borderRadius: brushSize / 2 }} />
            </div>
            <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: "oklch(0.95 0.01 250)", color: "oklch(0.30 0.02 250)" }}>
              <strong>{t.editor_panel_how_to_use}</strong> {t.editor_panel_brush_hint}
            </div>
            </div>
          </div>
        );
      case "edit-text":
        return (
          <div className="flex flex-col">
            <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_edit_native_text}</h3>
            <div className="p-3 rounded-lg text-xs" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.08)", color: "oklch(0.30 0.02 250)" }}>
              {t.editor_edittext_hint}
            </div>
            {/* Color picker for replacement text */}
            <div className="flex gap-2 items-center">
              <label className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_text_color}</label>
              <input type="color" value={editTextColor} onChange={e => setEditTextColor(e.target.value)} className="w-8 h-8 rounded cursor-pointer border-0" />
            </div>
            {/* Block count */}
            {nativeTextBlocks.length > 0 ? (
              <div className="text-xs p-2 rounded" style={{ backgroundColor: "oklch(0.96 0.005 250)", color: "oklch(0.40 0.02 250)" }}>
                {nativeTextBlocks.length} {t.editor_text_blocks_detected}
                {nativeTextBlocks.filter(b => b.editedStr !== undefined).length > 0 && (
                  <span className="ml-1 font-semibold" style={{ color: "oklch(0.45 0.20 150)" }}>
                    ({nativeTextBlocks.filter(b => b.editedStr !== undefined).length} {t.editor_edited_label})
                  </span>
                )}
              </div>
            ) : (
              <div className="text-xs p-2 rounded" style={{ backgroundColor: "oklch(0.96 0.005 250)", color: "oklch(0.55 0.02 250)" }}>
                {t.editor_loading_text_blocks}
              </div>
            )}
            {/* Instruction when a block is selected */}
            {editingBlockId && (
              <div className="p-2 rounded text-xs" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.1)", color: "oklch(0.30 0.02 250)" }}>
                {t.editor_panel_edit_inline_hint}
              </div>
            )}
            </div>
          </div>
        );
      case "move": {
        const movePageAnns = annotations.filter(a => a.page === currentPage && a.type !== "drawing" && a.type !== "eraser");
        const selectedAnn = selectedId ? movePageAnns.find(a => a.id === selectedId) : null;
        const annTypeLabel = (type: string) => {
          switch (type) {
            case "text": return t.editor_add_text || "Text";
            case "signature": return t.editor_sign || "Signature";
            case "image": return t.editor_image || "Image";
            case "note": return t.editor_notes || "Note";
            case "shape": return t.editor_shapes || "Shape";
            case "highlight": return t.editor_highlight || "Highlight";
            default: return type;
          }
        };
        return (
          <div className="flex flex-col gap-0">
            {ActionBar}
            <div className="p-4 flex flex-col gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "oklch(0.45 0.02 250)" }}>{t.editor_panel_move_elements}</p>
              <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.06)", color: "oklch(0.35 0.02 250)" }}>
                <p className="font-medium mb-1" style={{ color: "oklch(0.25 0.03 250)" }}>{t.editor_panel_move_how_to}</p>
                <p>{t.editor_move_hint}</p>
              </div>
              <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: "oklch(0.96 0.005 250)", color: "oklch(0.45 0.02 250)" }}>
                <p>💡 {t.editor_move_tip}</p>
              </div>

              {/* Selected annotation info */}
              {selectedAnn && (
                <div className="rounded-lg p-3 text-xs border" style={{ borderColor: "oklch(0.55 0.22 260 / 0.4)", backgroundColor: "oklch(0.55 0.22 260 / 0.04)" }}>
                  <p className="font-semibold mb-1" style={{ color: "oklch(0.35 0.15 260)" }}>
                    ✔ {annTypeLabel(selectedAnn.type)}
                  </p>
                  <p style={{ color: "oklch(0.45 0.02 250)" }}>
                    X: {Math.round(selectedAnn.x)}px &middot; Y: {Math.round(selectedAnn.y)}px
                  </p>
                  {selectedAnn.text && selectedAnn.type === "text" && (
                    <p className="mt-1 truncate" style={{ color: "oklch(0.45 0.02 250)" }}>
                      “{selectedAnn.text.slice(0, 40)}{selectedAnn.text.length > 40 ? "…" : ""}”
                    </p>
                  )}
                </div>
              )}

              {/* Annotation list for current page */}
              <div className="mt-1">
                <p className="text-xs font-medium mb-2" style={{ color: "oklch(0.35 0.02 250)" }}>
                  {movePageAnns.length > 0
                    ? `${movePageAnns.length} ${movePageAnns.length === 1 ? "elemento" : "elementos"} (pág. ${currentPage})`
                    : "Sin elementos en esta página"}
                </p>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {movePageAnns.map((ann, idx) => (
                    <button
                      key={ann.id}
                      onClick={() => setSelectedId(ann.id)}
                      className="flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-colors"
                      style={{
                        backgroundColor: selectedId === ann.id ? "oklch(0.55 0.22 260 / 0.12)" : "transparent",
                        color: selectedId === ann.id ? "oklch(0.35 0.15 260)" : "oklch(0.45 0.02 250)",
                        border: selectedId === ann.id ? "1px solid oklch(0.55 0.22 260 / 0.3)" : "1px solid transparent",
                      }}
                    >
                      <span className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-bold" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.1)", color: "oklch(0.55 0.22 260)" }}>{idx + 1}</span>
                      <span className="font-medium">{annTypeLabel(ann.type)}</span>
                      {ann.type === "text" && ann.text && (
                        <span className="truncate opacity-60" style={{ maxWidth: 80 }}>— {ann.text.slice(0, 20)}</span>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      }
      case "convert-jpg":
      case "convert-png": {
        const fmt = activeTool === "convert-jpg" ? "JPG" : "PNG";
        return (
          <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_pdf_to} {fmt}</h3>
            <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_convert_pages} {fmt}:</p>
            <button onClick={() => convertToImage(fmt.toLowerCase() as "jpg" | "png")} className="py-2 rounded text-white text-sm font-semibold" style={{ backgroundColor: "oklch(0.55 0.22 260)" }}>
              <FileText className="w-4 h-4 inline mr-1" />{t.editor_panel_export_page} {currentPage} ({fmt})
            </button>
            <button onClick={() => convertAllToImages(fmt.toLowerCase() as "jpg" | "png")} className="py-2 rounded text-sm font-medium border" style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.35 0.02 250)" }}>
              {t.editor_panel_export_all} ({totalPages})
            </button>
            <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: "oklch(0.95 0.01 250)", color: "oklch(0.45 0.02 250)" }}>
              💡 {t.editor_panel_each_page_file}
            </div>
          </div>
        );
      }
      case "merge":
        return (
          <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_merge_with_pdf}</h3>
            <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_select_merge}</p>
            <label className="flex items-center gap-2 py-2.5 px-4 rounded text-white text-sm font-semibold cursor-pointer" style={{ backgroundColor: "oklch(0.55 0.22 260)" }}>
              <Layers className="w-4 h-4" />{t.editor_panel_select_merge}
              <input type="file" accept=".pdf" multiple className="hidden" onChange={mergePdfs} />
            </label>
            <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: "oklch(0.95 0.01 250)", color: "oklch(0.45 0.02 250)" }}>
              💡 {t.editor_panel_each_page_file}
            </div>
          </div>
        );
      case "jpg-to-pdf":
      case "png-to-pdf":
      case "word-to-pdf":
      case "excel-to-pdf":
      case "ppt-to-pdf": {
        const isImg = activeTool === "jpg-to-pdf" || activeTool === "png-to-pdf";
        const srcFmt = activeTool === "jpg-to-pdf" ? "JPG" : activeTool === "png-to-pdf" ? "PNG" : activeTool === "word-to-pdf" ? "Word" : activeTool === "excel-to-pdf" ? "Excel" : "PowerPoint";
        const accept = isImg ? "image/jpeg,image/png" : ".doc,.docx,.xls,.xlsx,.ppt,.pptx";
        return (
          <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{srcFmt} {t.editor_panel_convert_to_pdf}</h3>
            {isImg ? (
              <>
                <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_insert_image} ({srcFmt}):</p>
                <label className="flex items-center gap-2 py-2.5 px-4 rounded text-white text-sm font-semibold cursor-pointer" style={{ backgroundColor: "oklch(0.55 0.22 260)" }}>
                  <Upload className="w-4 h-4" />{t.editor_panel_insert_image} {srcFmt}
                  <input type="file" accept={accept} className="hidden" onChange={convertImageToPdf} />
                </label>
              </>
            ) : (
              <>
                <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>{t.editor_panel_convert_files_to_pdf}</p>
                <div className="rounded-xl p-4 border text-center" style={{ borderColor: "oklch(0.85 0.05 260 / 0.4)", backgroundColor: "oklch(0.55 0.22 260 / 0.04)" }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: "oklch(0.25 0.03 250)" }}>{t.editor_panel_coming_soon}</p>
                  <p className="text-xs" style={{ color: "oklch(0.55 0.02 250)" }}>{t.editor_panel_conversion_coming}</p>
                </div>
              </>
            )}
          </div>
        );
      }
      case "convert-word":
      case "convert-excel":
      case "convert-ppt":
      case "convert-html": {
        const isHtml = activeTool === "convert-html";
        const exportFmt = activeTool === "convert-word" ? "docx" : activeTool === "convert-excel" ? "xlsx" : activeTool === "convert-ppt" ? "pptx" : "html";
        const targetFmt = activeTool === "convert-word" ? "Word (.docx)" : activeTool === "convert-excel" ? "Excel (.xlsx)" : activeTool === "convert-ppt" ? "PowerPoint (.pptx)" : "HTML";
        return (
          <div className="p-4 flex flex-col gap-3">
            <h3 className="font-semibold text-sm" style={{ color: "oklch(0.15 0.03 250)" }}>{t.editor_panel_pdf_to} {targetFmt}</h3>
            {isHtml ? (
              <div className="rounded-xl p-4 border text-center" style={{ borderColor: "oklch(0.85 0.05 260 / 0.4)", backgroundColor: "oklch(0.55 0.22 260 / 0.04)" }}>
                <p className="text-sm font-semibold mb-1" style={{ color: "oklch(0.25 0.03 250)" }}>{t.editor_panel_coming_soon}</p>
                <p className="text-xs" style={{ color: "oklch(0.55 0.02 250)" }}>{t.editor_panel_conversion_coming}</p>
              </div>
            ) : (
              <>
                <p className="text-xs" style={{ color: "oklch(0.50 0.02 250)" }}>
                  {activeTool === "convert-word" ? t.editor_panel_convert_desc_word : activeTool === "convert-excel" ? t.editor_panel_convert_desc_excel : t.editor_panel_convert_desc_ppt}
                </p>
                {/* Progress bar */}
                {isExporting && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex justify-between text-xs" style={{ color: "oklch(0.45 0.02 250)" }}>
                      <span>{exportProgress < 100 ? `Exportando a ${targetFmt}...` : "¡Exportado!"}</span>
                      <span>{Math.round(exportProgress)}%</span>
                    </div>
                    <div className="w-full rounded-full overflow-hidden" style={{ height: 6, backgroundColor: "oklch(0.90 0.02 260)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-200"
                        style={{ width: `${exportProgress}%`, backgroundColor: exportProgress === 100 ? "oklch(0.55 0.18 145)" : "oklch(0.55 0.22 260)" }}
                      />
                    </div>
                  </div>
                )}
                <button
                  onClick={() => exportPdf(exportFmt as "docx" | "xlsx" | "pptx")}
                  disabled={!pdfBytes || isExporting}
                  className="py-2.5 px-4 rounded text-white text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
                  style={{ backgroundColor: "oklch(0.55 0.22 260)" }}
                >
                  <Download className="w-4 h-4" />
                  {isExporting ? `${t.editor_panel_exporting} ${Math.round(exportProgress)}%` : `${t.editor_panel_convert_to_btn} ${targetFmt}`}
                </button>
                <p className="text-xs" style={{ color: "oklch(0.60 0.02 250)" }}>
                  {t.editor_panel_conversion_wait}
                </p>
              </>
            )}
          </div>
        );
      }
      default:
        return (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-6 text-center">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ backgroundColor: "oklch(0.55 0.22 260 / 0.08)" }}>
              <MousePointer className="w-6 h-6" style={{ color: "oklch(0.55 0.22 260)" }} />
            </div>
            <p className="text-sm font-medium" style={{ color: "oklch(0.45 0.02 250)" }}>{t.editor_select_tool}</p>
            <p className="text-xs" style={{ color: "oklch(0.65 0.02 250)" }}>{t.editor_toolbar_hint}</p>
          </div>
        );
    }
  };  // ── File-free mode (e.g. JPG/PNG/Word to PDF) ────────────────────────
  if (isFileFreeMode) {
    return (
      <div
        className={fullscreen ? "flex flex-col overflow-hidden" : "flex flex-col rounded-xl overflow-hidden shadow-xl border"}
        style={fullscreen
          ? { height: "100%", backgroundColor: "oklch(0.97 0.005 250)" }
          : { height: "85vh", borderColor: "oklch(0.88 0.02 250)", backgroundColor: "oklch(0.97 0.005 250)" }
        }
      >
        <div className="flex items-center gap-3 px-4 py-2.5 border-b" style={{ backgroundColor: "oklch(1 0 0)", borderColor: "oklch(0.90 0.01 250)" }}>
          <span className="text-sm font-semibold" style={{ color: "oklch(0.15 0.03 250)" }}>Herramienta de conversión</span>
        </div>
        <div className="flex flex-1 items-center justify-center p-8">
          <div className="max-w-sm w-full">
            {renderToolPanel()}
          </div>
        </div>
      </div>
    );
  }

  // ── Main editor layout ────────────────────────────────────────────
  const pageAnnotations = annotations.filter(a => a.page === currentPage);

  return (   <div
      className={fullscreen ? "flex flex-col overflow-hidden" : "flex flex-col rounded-xl overflow-hidden shadow-xl border"}
      style={fullscreen
        ? { height: "100%", backgroundColor: "oklch(0.97 0.005 250)" }
        : { height: "85vh", borderColor: "oklch(0.88 0.02 250)", backgroundColor: "oklch(0.97 0.005 250)" }
      }
    >
      {/* ── Banner: archivo convertido a PDF automáticamente ── */}
      {showConvertedBanner && convertedFromFile && (
        <div
          className="flex items-center gap-3 px-4 py-2.5 border-b"
          style={{
            backgroundColor: "oklch(0.95 0.08 145 / 0.35)",
            borderColor: "oklch(0.75 0.12 145 / 0.4)",
          }}
        >
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <CheckCircle className="w-5 h-5 flex-shrink-0" style={{ color: "oklch(0.45 0.18 145)" }} />
            <div className="min-w-0">
              <p className="text-sm font-semibold truncate" style={{ color: "oklch(0.25 0.05 145)" }}>
                {convertedFromFile.type.startsWith("image/")
                  ? (t.editor_image_converted_title ?? "Tu imagen ya es un PDF")
                  : (t.editor_file_converted_title ?? "Tu archivo ya es un PDF")}
              </p>
              <p className="text-xs truncate" style={{ color: "oklch(0.40 0.04 145)" }}>
                {convertedFromFile.type.startsWith("image/")
                  ? (t.editor_image_converted_desc ?? `"${convertedFromFile.name}" se ha convertido a PDF automáticamente. Ya puedes editarlo y descargarlo directamente.`)
                  : (t.editor_file_converted_desc ?? `"${convertedFromFile.name}" se ha convertido a PDF automáticamente. Ya puedes editarlo y descargarlo.`)}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowConvertedBanner(false)}
            className="p-1 rounded-full hover:bg-white/50 transition-colors flex-shrink-0"
            title="Cerrar"
          >
            <X className="w-4 h-4" style={{ color: "oklch(0.40 0.04 145)" }} />
          </button>
        </div>
      )}

      {/* ── TOP TOOLBAR — desktop only ── */}
      <div className="hidden md:flex items-center gap-1 px-3 py-1.5 border-b min-w-0" style={{ backgroundColor: "oklch(1 0 0)", borderColor: "oklch(0.90 0.01 250)" }}>
        {/* Undo / Redo */}
        <button title={t.editor_undo + " (Ctrl+Z)"} onClick={undo} disabled={historyIndex <= 0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors shrink-0">
          <Undo2 className="w-4 h-4" style={{ color: "oklch(0.35 0.02 250)" }} />
        </button>
        <button title={t.editor_redo + " (Ctrl+Y)"} onClick={redo} disabled={historyIndex >= history.length - 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30 transition-colors shrink-0">
          <Redo2 className="w-4 h-4" style={{ color: "oklch(0.35 0.02 250)" }} />
        </button>
        <div className="w-px h-5 mx-1 shrink-0" style={{ backgroundColor: "oklch(0.88 0.02 250)" }} />
        {/* Tool buttons — centered */}
        <div className="flex items-center gap-0.5 flex-1 justify-center overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {[
            { id: "sign" as ToolName, icon: PenTool, label: t.editor_sign },
            { id: "text" as ToolName, icon: Type, label: t.editor_add_text },
            { id: "edit-text" as ToolName, icon: Type, label: t.editor_edit_text },
            { id: "highlight" as ToolName, icon: Highlighter, label: t.editor_highlight },
            { id: "eraser" as ToolName, icon: Eraser, label: t.editor_eraser },
            { id: "brush" as ToolName, icon: Brush, label: t.editor_brush },
            { id: "image" as ToolName, icon: ImageIcon, label: t.editor_image },
            { id: "pointer" as ToolName, icon: MousePointer, label: t.editor_pointer },
            { id: "shapes" as ToolName, icon: Shapes, label: t.editor_shapes },
            { id: "find" as ToolName, icon: Search, label: t.editor_find },
            { id: "protect" as ToolName, icon: Shield, label: t.editor_protect },
            { id: "compress" as ToolName, icon: Minimize2, label: t.editor_compress },
            { id: "move" as ToolName, icon: Move, label: t.editor_move },
            { id: "notes" as ToolName, icon: StickyNote, label: t.editor_notes },
          ].map(({ id, icon, label }) => (
            <ToolBtn key={id} icon={icon} label={label} active={activeTool === id} onClick={() => { setActiveTool(id); setSelectedId(null); setShowMobilePanel(true); }} />
          ))}
        </div>
        {/* Page actions */}
        <button title={t.editor_rotate} onClick={rotatePage} className="p-1.5 rounded hover:bg-gray-100 transition-colors shrink-0">
          <RotateCw className="w-4 h-4" style={{ color: "oklch(0.45 0.02 250)" }} />
        </button>
        <button title={t.editor_delete_page} onClick={deletePage} className="p-1.5 rounded hover:bg-gray-100 transition-colors shrink-0">
          <Trash2 className="w-4 h-4" style={{ color: "oklch(0.55 0.15 15)" }} />
        </button>
        {selectedId && (
          <button title="Delete selection" onClick={deleteSelected} className="p-1.5 rounded transition-colors shrink-0" style={{ backgroundColor: "oklch(0.95 0.05 15)" }}>
            <X className="w-4 h-4" style={{ color: "oklch(0.55 0.15 15)" }} />
          </button>
        )}
        <div className="w-px h-5 mx-1 shrink-0" style={{ backgroundColor: "oklch(0.88 0.02 250)" }} />
        {/* Save */}
        <button
          onClick={savePdf}
          disabled={isSaving || !pdfBytes}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold transition-all shrink-0 border"
          style={{ borderColor: "oklch(0.75 0.10 260)", color: "oklch(0.30 0.04 250)", backgroundColor: "white" }}
          onMouseEnter={e => { e.currentTarget.style.backgroundColor = "oklch(0.96 0.01 250)"; }}
          onMouseLeave={e => { e.currentTarget.style.backgroundColor = "white"; }}
        >
          <Save className="w-4 h-4" />{isSaving ? t.editor_saving : t.editor_save_btn}
        </button>
        {/* Download */}
        <button
          onClick={downloadPdf}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-white text-sm font-semibold transition-all shrink-0"
          style={{ backgroundColor: "oklch(0.18 0.04 250)" }}
          onMouseEnter={e => e.currentTarget.style.backgroundColor = "oklch(0.55 0.22 260)"}
          onMouseLeave={e => e.currentTarget.style.backgroundColor = "oklch(0.18 0.04 250)"}
        >
          <Download className="w-4 h-4" />{t.editor_download}
        </button>
      </div>
            {/* ── BODY: thumbnails + viewer + tool panel ── */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* LEFT: Page thumbnails — hidden on mobile */}
        <div className="hidden md:flex w-[150px] border-r overflow-y-auto flex-col gap-3 py-3 px-2" style={{ backgroundColor: "oklch(0.96 0.005 250)", borderColor: "oklch(0.90 0.01 250)" }}>
          {/* Page count */}
          <div className="flex items-center justify-between px-1">
            <span className="text-xs font-semibold" style={{ color: "oklch(0.40 0.02 250)" }}>{totalPages}</span>
          </div>
          {thumbnails.map((thumb, i) => (
            <button
              key={i}
              onClick={() => setCurrentPage(i + 1)}
              className="flex flex-col items-center gap-1.5 transition-all"
              style={{ outline: "none" }}
            >
              <div
                className="w-full rounded overflow-hidden"
                style={{
                  border: currentPage === i + 1 ? "2px solid oklch(0.55 0.22 260)" : "2px solid oklch(0.85 0.02 250)",
                  boxShadow: currentPage === i + 1 ? "0 0 0 1px oklch(0.55 0.22 260 / 0.3)" : "0 1px 3px oklch(0 0 0 / 0.12)",
                }}
              >
                <img src={thumb} alt={`Página ${i + 1}`} className="w-full block" />
              </div>
              <span className="text-xs" style={{ color: currentPage === i + 1 ? "oklch(0.55 0.22 260)" : "oklch(0.55 0.02 250)", fontSize: 11 }}>
                Page {i + 1}
              </span>
            </button>
          ))}
        </div>

        {/* CENTER: PDF viewer */}
        <div className="flex-1 overflow-auto flex flex-col" style={{ backgroundColor: "oklch(0.93 0.005 250)" }}>
          {/* Zoom + page nav bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b" style={{ backgroundColor: "oklch(0.97 0.005 250)", borderColor: "oklch(0.90 0.01 250)" }}>
            <div className="flex items-center gap-2">
              <button onClick={() => setScale(s => Math.max(0.5, s - 0.2))} className="p-1 rounded hover:bg-gray-200 transition-colors">
                <ZoomOut className="w-4 h-4" style={{ color: "oklch(0.45 0.02 250)" }} />
              </button>
              <span className="text-xs font-medium w-12 text-center" style={{ color: "oklch(0.45 0.02 250)" }}>{Math.round(scale * 100)}%</span>
              <button onClick={() => setScale(s => Math.min(3, s + 0.2))} className="p-1 rounded hover:bg-gray-200 transition-colors">
                <ZoomIn className="w-4 h-4" style={{ color: "oklch(0.45 0.02 250)" }} />
              </button>
              <select
                value={scale}
                onChange={e => setScale(Number(e.target.value))}
                className="text-xs border rounded px-1 py-0.5 ml-1"
                style={{ borderColor: "oklch(0.80 0.05 260)", color: "oklch(0.45 0.02 250)" }}
              >
                <option value={0.75}>75%</option>
                <option value={1.0}>100%</option>
                <option value={1.2}>Auto Size</option>
                <option value={1.5}>150%</option>
                <option value={2.0}>200%</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors">
                <ChevronLeft className="w-4 h-4" style={{ color: "oklch(0.45 0.02 250)" }} />
              </button>
              <span className="text-xs" style={{ color: "oklch(0.45 0.02 250)" }}>{currentPage} of {totalPages}</span>
              <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 rounded hover:bg-gray-200 disabled:opacity-30 transition-colors">
                <ChevronRight className="w-4 h-4" style={{ color: "oklch(0.45 0.02 250)" }} />
              </button>
            </div>
          </div>

          {/* PDF canvas + annotation overlay */}
          <div className="flex-1 overflow-auto flex items-start justify-center p-3 md:p-6 pb-[140px] md:pb-6">
            <div
              className="relative shadow-xl"
              ref={viewerRef}
              style={{ display: "inline-block" }}
            >
              <canvas ref={mainCanvasCallbackRef} className="block" />
              {/* Drawing canvas for brush/eraser/highlight */}
              <canvas
                ref={drawingCanvasRef}
                className="absolute inset-0 block"
                style={{
                  cursor: activeTool === "brush" ? "crosshair"
                    : activeTool === "eraser" ? "cell"
                    : activeTool === "highlight" ? "text"
                    : "default",
                  pointerEvents: (activeTool === "brush" || activeTool === "eraser" || activeTool === "highlight") ? "auto" : "none",
                  touchAction: "none",
                  zIndex: 10,
                }}
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={handleCanvasMouseUp}
                onTouchStart={handleCanvasTouchStart}
                onTouchMove={handleCanvasTouchMove}
                onTouchEnd={handleCanvasTouchEnd}
                onTouchCancel={handleCanvasTouchEnd}
              />
              {/* Annotation overlay */}
              <div
                ref={overlayRef}
                className="absolute inset-0"
                style={{
                  cursor: activeTool === "pointer" ? "default"
                    : activeTool === "text" ? "text"
                    : activeTool === "move" ? (isDragging ? "grabbing" : "grab")
                    : "default",
                  zIndex: 20,
                  pointerEvents: (activeTool === "brush" || activeTool === "eraser" || activeTool === "highlight") ? "none" : "auto",
                }}
                onMouseMove={onMouseMove}
                onMouseUp={onMouseUp}
                onClick={handleOverlayClick}
                onTouchMove={(e) => {
                  if (!isDragging || !selectedId) return;
                  e.preventDefault();
                  const touch = e.touches[0];
                  const overlay = overlayRef.current!.getBoundingClientRect();
                  const x = touch.clientX - overlay.left - dragOffset.x;
                  const y = touch.clientY - overlay.top - dragOffset.y;
                  setAnnotations(prev => prev.map(a => a.id === selectedId ? { ...a, x, y } : a));
                }}
                onTouchEnd={() => {
                  if (isDragging) {
                    pushHistory(annotationsRef.current);
                    setIsDragging(false);
                  }
                }}
              >
                {pageAnnotations.filter(ann => ann.type !== "drawing" && ann.type !== "eraser").map(ann => (
                  <div
                    key={ann.id}
                    style={{
                      position: "absolute",
                      left: ann.x, top: ann.y,
                      width: ann.type === "text" && editingTextId === ann.id ? Math.max(ann.width, 200) : ann.width,
                      height: ann.type === "text" && editingTextId === ann.id ? "auto" : ann.height,
                      minHeight: ann.height,
                      cursor: activeTool === "move" ? (isDragging && selectedId === ann.id ? "grabbing" : "grab") : "move",
                      outline: selectedId === ann.id ? "2px solid oklch(0.55 0.22 260)" : "none",
                      outlineOffset: 2,
                      userSelect: "none",
                      touchAction: "none",
                      zIndex: editingTextId === ann.id ? 30 : (selectedId === ann.id && activeTool === "move" ? 28 : undefined),
                      transition: activeTool === "move" && !isDragging ? "box-shadow 0.15s ease" : "none",
                    }}
                    onMouseEnter={(e) => {
                      if (activeTool === "move" && !isDragging) {
                        (e.currentTarget as HTMLElement).style.boxShadow = "0 0 0 3px oklch(0.55 0.22 260 / 0.3)";
                      }
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.boxShadow = "none";
                    }}
                    onMouseDown={(e) => startDrag(e, ann.id)}
                    onTouchStart={(e) => {
                      // Select annotation on touch
                      e.stopPropagation();
                      setSelectedId(ann.id);
                      // Start drag
                      // Only block drag on canvas-drawing tools
                      const nodrag = ["brush", "eraser", "highlight"];
                      if (nodrag.includes(activeTool)) return;
                      const touch = e.touches[0];
                      const overlay = overlayRef.current!.getBoundingClientRect();
                      setIsDragging(true);
                      setDragOffset({ x: touch.clientX - overlay.left - ann.x, y: touch.clientY - overlay.top - ann.y });
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(ann.id);
                      // When clicking a text annotation, switch to text tool and load its properties
                      // But NOT when the move tool is active — keep move tool active for repositioning
                      if (ann.type === "text" && activeTool !== "move") {
                        setActiveTool("text");
                        setTextColor(ann.color ?? "#000000");
                        setTextSize(ann.fontSize ?? 14);
                        setTextFont(ann.fontFamily ?? "Arial, sans-serif");
                        setTextInput(ann.text ?? "");
                      }
                    }}
                  >
                    {/* Delete button — top-right corner when selected */}
                    {selectedId === ann.id && (
                      <button
                        title={t.editor_delete_annotation}
                        onClick={(e) => { e.stopPropagation(); setAnnotations(prev => prev.filter(a => a.id !== ann.id)); setSelectedId(null); pushHistory(annotationsRef.current.filter(a => a.id !== ann.id)); }}
                        style={{
                          position: "absolute", top: -10, right: -10,
                          width: 20, height: 20,
                          backgroundColor: "#ef4444",
                          border: "2px solid white",
                          borderRadius: "50%",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                          zIndex: 40,
                          padding: 0,
                          lineHeight: 1,
                          fontSize: 12,
                          color: "white",
                          fontWeight: "bold",
                        }}
                        onMouseDown={(e) => e.stopPropagation()}
                        onTouchStart={(e) => e.stopPropagation()}
                      >
                        ×
                      </button>
                    )}
                    {ann.type === "signature" && ann.dataUrl && (
                      <img src={ann.dataUrl} alt="firma" style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "move" }} draggable={false} />
                    )}
                    {ann.type === "image" && ann.dataUrl && (
                      <img src={ann.dataUrl} alt="img" style={{ width: "100%", height: "100%", objectFit: "contain", cursor: "move" }} draggable={false} />
                    )}
                    {ann.type === "text" && (
                      editingTextId === ann.id ? (
                        <textarea
                          autoFocus
                          value={ann.text ?? ""}
                          onChange={(e) => {
                            const val = e.target.value;
                            setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, text: val, width: Math.max(150, val.length * ((ann.fontSize ?? 14) * 0.6)), height: Math.max((ann.fontSize ?? 14) + 16, val.split("\n").length * ((ann.fontSize ?? 14) * 1.3) + 16) } : a));
                          }}
                          onBlur={() => {
                            // Remove empty text annotations on blur
                            const current = annotations.find(a => a.id === ann.id);
                            if (current && !current.text?.trim()) {
                              setAnnotations(prev => prev.filter(a => a.id !== ann.id));
                              setSelectedId(null);
                            } else {
                              pushHistory(annotationsRef.current);
                            }
                            setEditingTextId(null);
                          }}
                          onKeyDown={(e) => {
                            e.stopPropagation();
                            if (e.key === "Escape") {
                              setEditingTextId(null);
                              const current = annotations.find(a => a.id === ann.id);
                              if (current && !current.text?.trim()) {
                                setAnnotations(prev => prev.filter(a => a.id !== ann.id));
                                setSelectedId(null);
                              }
                            }
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            fontSize: ann.fontSize ?? 14,
                            color: ann.color ?? "#000",
                            fontFamily: ann.fontFamily ?? "Arial, sans-serif",
                            whiteSpace: "pre-wrap",
                            display: "block",
                            lineHeight: 1.3,
                            width: "100%",
                            minHeight: Math.max((ann.fontSize ?? 14) + 16, 30),
                            border: "none",
                            outline: "none",
                            background: "rgba(255,255,255,0.85)",
                            resize: "both",
                            padding: 4,
                            margin: 0,
                            boxSizing: "border-box",
                            overflow: "auto",
                          }}
                          placeholder={t.editor_panel_type_here}
                        />
                      ) : (
                        <span
                          style={{ fontSize: ann.fontSize ?? 14, color: ann.color ?? "#000", fontFamily: ann.fontFamily ?? "Arial, sans-serif", whiteSpace: "pre-wrap", display: "block", lineHeight: 1.2, cursor: "move", minHeight: "1em" }}
                          onDoubleClick={(e) => {
                            e.stopPropagation();
                            setEditingTextId(ann.id);
                            setActiveTool("text");
                            setTextColor(ann.color ?? "#000000");
                            setTextSize(ann.fontSize ?? 14);
                            setTextFont(ann.fontFamily ?? "Arial, sans-serif");
                            setTextInput(ann.text ?? "");
                          }}
                        >
                          {ann.text || t.editor_panel_type_here}
                        </span>
                      )
                    )}
                    {ann.type === "highlight" && (
                      <div style={{ width: "100%", height: "100%", backgroundColor: ann.color ?? "#FFFF00", opacity: 0.4, borderRadius: 2, cursor: "move" }} />
                    )}
                    {ann.type === "note" && (
                      <div style={{ width: "100%", height: "100%", backgroundColor: "#FFF176", border: "1px solid #F9A825", borderRadius: 4, padding: 4, fontSize: 11, overflow: "hidden", cursor: "move" }}>
                        {ann.text}
                      </div>
                    )}
                    {ann.type === "shape" && (
                      <div style={{
                        width: "100%", height: "100%",
                        border: `2px solid ${ann.color ?? "#2563EB"}`,
                        backgroundColor: (ann.text === "rect-filled" || ann.text === "circle-filled")
                          ? `${ann.color ?? "#2563EB"}` 
                          : (ann.text === "line" ? "transparent" : `${ann.color ?? "#2563EB"}22`),
                        borderRadius: (ann.text === "circle" || ann.text === "circle-filled") ? "50%" : 0,
                        // Line: thin horizontal bar
                        ...(ann.text === "line" ? { height: 2, marginTop: "50%" } : {}),
                      }} />
                    )}
                    {/* Resize handle */}
                    {selectedId === ann.id && (
                      <div
                        title={t.editor_resize_handle}
                        style={{ position: "absolute", right: -8, bottom: -8, width: 20, height: 20, backgroundColor: "oklch(0.55 0.22 260)", borderRadius: 4, cursor: "se-resize", zIndex: 30, border: "2.5px solid white", touchAction: "none" }}
                        onMouseDown={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setIsResizing(true);
                          const startX = e.clientX, startY = e.clientY;
                          const startW = ann.width, startH = ann.height;
                          const onMove = (ev: MouseEvent) => {
                            const dw = ev.clientX - startX, dh = ev.clientY - startY;
                            setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, width: Math.max(30, startW + dw), height: Math.max(20, startH + dh) } : a));
                          };
                          const onUp = () => {
                            setIsResizing(false);
                            pushHistory(annotationsRef.current);
                            window.removeEventListener("mousemove", onMove);
                            window.removeEventListener("mouseup", onUp);
                          };
                          window.addEventListener("mousemove", onMove);
                          window.addEventListener("mouseup", onUp);
                        }}
                        onTouchStart={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setIsResizing(true);
                          const startTouch = e.touches[0];
                          const startX = startTouch.clientX, startY = startTouch.clientY;
                          const startW = ann.width, startH = ann.height;
                          const onMove = (ev: TouchEvent) => {
                            ev.preventDefault();
                            const t = ev.touches[0];
                            const dw = t.clientX - startX, dh = t.clientY - startY;
                            setAnnotations(prev => prev.map(a => a.id === ann.id ? { ...a, width: Math.max(30, startW + dw), height: Math.max(20, startH + dh) } : a));
                          };
                          const onUp = () => {
                            setIsResizing(false);
                            pushHistory(annotationsRef.current);
                            window.removeEventListener("touchmove", onMove);
                            window.removeEventListener("touchend", onUp);
                          };
                          window.addEventListener("touchmove", onMove, { passive: false });
                          window.addEventListener("touchend", onUp);
                        }}
                      />
                    )}
                  </div>
                ))}
              </div>
              {/* Native text blocks overlay — only visible when edit-text tool is active */}
              {activeTool === "edit-text" && nativeTextBlocks.map(block => (
                <div
                  key={block.id}
                  style={{
                    position: "absolute",
                    left: block.x,
                    top: block.y,
                    width: block.width,
                    height: block.height,
                    cursor: "text",
                    border: editingBlockId === block.id
                      ? "2px solid oklch(0.55 0.22 260)"
                      : block.editedStr !== undefined
                        ? "2px dashed oklch(0.45 0.20 150)"
                        : "1.5px dashed oklch(0.55 0.22 260 / 0.6)",
                    backgroundColor: editingBlockId === block.id
                      ? "rgba(255,255,255,0.95)"
                      : block.editedStr !== undefined
                        ? "rgba(255,255,255,0.95)"
                        : "transparent",
                    borderRadius: 2,
                    zIndex: editingBlockId === block.id ? 30 : 25,
                    boxSizing: "border-box",
                    overflow: editingBlockId === block.id ? "visible" : "hidden",
                    display: "flex",
                    alignItems: "center",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (editingBlockId !== block.id) {
                      setEditingBlockId(block.id);
                      setEditingBlockText(block.editedStr ?? block.str);
                      setShowMobilePanel(true);
                    }
                  }}
                  title={block.editedStr !== undefined ? `Editado: "${block.editedStr}"` : `Clic para editar: "${block.str}"`}
                >
                  {/* Inline editor: floating popup above the block */}
                  {editingBlockId === block.id ? (
                    <div
                      style={{
                        position: "absolute",
                        left: 0,
                        top: block.height + 4,
                        minWidth: Math.max(block.width, 200),
                        background: "white",
                        border: "2px solid oklch(0.55 0.22 260)",
                        borderRadius: 6,
                        padding: 8,
                        zIndex: 100,
                        boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
                        display: "flex",
                        flexDirection: "column",
                        gap: 6,
                      }}
                      onMouseDown={e => e.stopPropagation()}
                      onClick={e => e.stopPropagation()}
                    >
                      <input
                        autoFocus
                        value={editingBlockText}
                        onChange={e => setEditingBlockText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter") {
                            setAllNativeTextBlocks(prev => {
                              const pageBlocks = prev.get(block.page) ?? [];
                              const updated = pageBlocks.map((b: NativeTextBlock) =>
                                b.id === block.id
                                  ? { ...b, editedStr: editingBlockText, fontColor: editTextColor }
                                  : b
                              );
                              const next = new Map(prev);
                              next.set(block.page, updated);
                              return next;
                            });
                            setEditingBlockId(null);
                            toast.success("Texto actualizado");
                          } else if (e.key === "Escape") {
                            setEditingBlockId(null);
                          }
                          e.stopPropagation();
                        }}
                        onClick={e => e.stopPropagation()}
                        style={{
                          width: "100%",
                          fontSize: 13,
                          color: editTextColor,
                          background: "#f8f9ff",
                          border: "1px solid oklch(0.80 0.05 260)",
                          borderRadius: 4,
                          outline: "none",
                          padding: "4px 6px",
                          fontFamily: "Helvetica, Arial, sans-serif",
                          boxSizing: "border-box",
                        }}
                      />
                      <div style={{ display: "flex", gap: 4 }}>
                        <button
                          onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            setAllNativeTextBlocks(prev => {
                              const pageBlocks = prev.get(block.page) ?? [];
                              const updated = pageBlocks.map((b: NativeTextBlock) =>
                                b.id === block.id
                                  ? { ...b, editedStr: editingBlockText, fontColor: editTextColor }
                                  : b
                              );
                              const next = new Map(prev);
                              next.set(block.page, updated);
                              return next;
                            });
                            setEditingBlockId(null);
                            toast.success("Texto actualizado");
                          }}
                          style={{
                            flex: 1, padding: "3px 0", borderRadius: 4,
                            background: "oklch(0.55 0.22 260)", color: "white",
                            border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600,
                          }}
                        >
                          {t.editor_save_btn}
                        </button>
                        <button
                          onMouseDown={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            setEditingBlockId(null);
                          }}
                          style={{
                            flex: 1, padding: "3px 0", borderRadius: 4,
                            background: "transparent", color: "oklch(0.40 0.02 250)",
                            border: "1px solid oklch(0.80 0.05 260)", cursor: "pointer", fontSize: 12,
                          }}
                        >
                          {t.editor_cancel_btn}
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Show edited text preview or original text */
                    <span style={{
                      fontSize: Math.min(block.fontSize, 12),
                      color: block.editedStr !== undefined ? (block.fontColor ?? editTextColor) : "transparent",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      padding: "0 2px",
                      fontWeight: 500,
                      width: "100%",
                    }}>
                      {block.editedStr ?? block.str}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT: Tool panel — bottom sheet on mobile, sidebar on desktop */}
        {/* Mobile overlay backdrop */}
        {showMobilePanel && (
          <div
            className="fixed inset-0 bg-black/40 z-30 md:hidden"
            onClick={() => setShowMobilePanel(false)}
          />
        )}
        {/* Desktop sidebar */}
        <div
          className="hidden md:flex border-l overflow-y-auto flex-col md:w-[260px]"
          style={{ backgroundColor: "oklch(1 0 0)", borderColor: "oklch(0.90 0.01 250)" }}
        >
          {renderToolPanel()}
        </div>
        {/* Mobile bottom sheet */}
        <div
          className={[
            "fixed left-0 right-0 bottom-[130px] z-40 md:hidden transition-transform duration-300 rounded-t-2xl overflow-hidden",
            showMobilePanel ? "translate-y-0" : "translate-y-full",
          ].join(" ")}
          style={{ backgroundColor: "oklch(1 0 0)", boxShadow: "0 -4px 24px oklch(0.18 0.04 250 / 0.18)", maxHeight: "60vh", overflowY: "auto" }}
        >
          {/* Sheet handle + close */}
          <div className="flex items-center justify-between px-4 py-3 border-b sticky top-0 bg-white z-10" style={{ borderColor: "oklch(0.90 0.01 250)" }}>
            <div className="w-10 h-1 rounded-full mx-auto" style={{ backgroundColor: "oklch(0.80 0.02 250)" }} />
            <button
              onClick={() => setShowMobilePanel(false)}
              className="absolute right-3 top-2.5 p-1.5 rounded-full hover:bg-gray-100 transition-colors"
            >
              <X className="w-4 h-4" style={{ color: "oklch(0.45 0.02 250)" }} />
            </button>
          </div>
          {renderToolPanel()}
        </div>
      </div>

      {/* ── MOBILE BOTTOM BAR ── fixed at bottom, always visible */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex flex-col border-t" style={{ backgroundColor: "oklch(1 0 0)", borderColor: "oklch(0.90 0.01 250)", boxShadow: "0 -2px 12px oklch(0.18 0.04 250 / 0.12)" }}>
        {/* Tools row — horizontal scroll with fade indicator */}
        <div className="relative">
        <div className="flex items-center overflow-x-auto gap-0 px-1 py-1" style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
          {[
            { id: "notes" as ToolName, icon: StickyNote, label: t.editor_notes },
            { id: "move" as ToolName, icon: Move, label: t.editor_move },
            { id: "sign" as ToolName, icon: PenTool, label: t.editor_sign },
            { id: "text" as ToolName, icon: Type, label: t.editor_add_text },
            { id: "edit-text" as ToolName, icon: Type, label: t.editor_edit_text },
            { id: "highlight" as ToolName, icon: Highlighter, label: t.editor_highlight },
            { id: "brush" as ToolName, icon: Brush, label: t.editor_brush },
            { id: "eraser" as ToolName, icon: Eraser, label: t.editor_eraser },
            { id: "image" as ToolName, icon: ImageIcon, label: t.editor_image },
            { id: "shapes" as ToolName, icon: Shapes, label: t.editor_shapes },
            { id: "find" as ToolName, icon: Search, label: t.editor_find },
            { id: "protect" as ToolName, icon: Shield, label: t.editor_protect },
            { id: "compress" as ToolName, icon: Minimize2, label: t.editor_compress },
          ].map(({ id, icon: Icon, label }) => (
            <button
              key={id}
              onClick={() => { setActiveTool(id); setSelectedId(null); setShowMobilePanel(true); }}
              className="flex flex-col items-center gap-0.5 px-3 py-2 rounded-lg shrink-0 transition-all"
              style={{
                color: activeTool === id ? "oklch(0.55 0.22 260)" : "oklch(0.35 0.02 250)",
                backgroundColor: activeTool === id ? "oklch(0.55 0.22 260 / 0.10)" : "transparent",
                minWidth: 56,
              }}
            >
              <Icon className="w-5 h-5" />
              <span style={{ fontSize: 10, whiteSpace: "nowrap" }}>{label}</span>
            </button>
          ))}
        </div>
        {/* Fade gradient on right to indicate more tools */}
        <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none" style={{ background: "linear-gradient(to right, transparent, white)" }} />
        </div>
        {/* Download row */}
        <div className="flex items-center gap-2 px-3 pb-3 pt-1">
          {/* Save button */}
          <button
            onClick={savePdf}
            disabled={isSaving || !pdfBytes}
            className="flex items-center justify-center gap-1.5 w-14 h-12 rounded-xl border shrink-0 transition-all text-xs font-semibold"
            style={{ borderColor: "oklch(0.75 0.10 260)", color: "oklch(0.30 0.04 250)", backgroundColor: "white" }}
          >
            <Save className="w-4 h-4" />
            {isSaving ? "..." : t.editor_save_btn}
          </button>
          {/* Download button */}
          <button
            onClick={downloadPdf}
            className="flex-1 flex items-center justify-center gap-2 h-12 rounded-xl text-white font-bold text-base transition-all"
            style={{ backgroundColor: "oklch(0.18 0.04 250)" }}
            onTouchStart={e => e.currentTarget.style.backgroundColor = "oklch(0.55 0.22 260)"}
            onTouchEnd={e => e.currentTarget.style.backgroundColor = "oklch(0.18 0.04 250)"}
          >
            <Download className="w-5 h-5" />
            {t.editor_download}
          </button>
        </div>
      </div>

      {/* Paywall modal */}
      <PaywallModal
        isOpen={showPaywall}
        onClose={() => setShowPaywall(false)}
        pdfData={pdfDataForPaywall}
        thumbnailUrl={thumbnails[0]}
        buildPdfForUpload={async () => {
          if (!pdfBytes) return null;
          try {
            const out = await buildAnnotatedPdf();
            if (!out) return null;
            return {
              base64: uint8ToBase64(out),
              name: displayName ?? file?.name ?? "document.pdf",
              size: out.byteLength,
            };
          } catch {
            return null;
          }
        }}
        onPaymentSuccess={async (transactionId?: string) => {
          // After successful payment: auto-download the PDF, then navigate to success page
          setShowPaywall(false);
          toast.loading("Preparando descarga...", { id: "post-pay-dl" });
          const langMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
          const lang = langMatch ? langMatch[1] : "es";
          const txnParam = transactionId ? `?txn=${encodeURIComponent(transactionId)}` : "";
          try {
            // Check if there's a pending tool download (compress, protect, convert, etc.)
            if (pendingToolDownloadRef.current) {
              const { blob, name } = pendingToolDownloadRef.current;
              triggerBlobDownload(blob, name);
              pendingToolDownloadRef.current = null;
              toast.success("¡Pago completado! Archivo descargado correctamente.", { id: "post-pay-dl" });
              // Navigate to success page for conversion tracking
              navigate(`/${lang}/payment/success${txnParam}`);
              return;
            }
            // Otherwise, download the annotated PDF
            const out = await buildAnnotatedPdf();
            if (out) {
              triggerDownload(out);
              toast.success("¡Pago completado! PDF descargado correctamente.", { id: "post-pay-dl" });
            } else {
              toast.success("¡Pago completado! Tu documento está en tu panel.", { id: "post-pay-dl" });
            }
          } catch {
            toast.success("¡Pago completado! Tu documento está en tu panel.", { id: "post-pay-dl" });
          }
          // Always navigate to success page for Google Ads / Analytics conversion tracking
          navigate(`/${lang}/payment/success${txnParam}`);
        }}
      />
    </div>
  );
}
