/* =============================================================
   CloudPDF — Dashboard de usuario
   Pestañas: Mi Cuenta | Mis Documentos | Equipo | Facturación
   ============================================================= */
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  User, FileText, Users, CreditCard, Settings,
  LogOut, Trash2, Plus, X, Download, FolderOpen,
  Crown, Check, AlertCircle, ChevronRight, Mail,
  Shield, Globe, Clock, Edit3, Loader2,
} from "lucide-react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import PaywallModal from "@/components/PaywallModal";
import { useLocation } from "wouter";
import { usePdfFile } from "@/contexts/PdfFileContext";

type Tab = "account" | "documents" | "team" | "billing";

export default function Dashboard() {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [, navigate] = useLocation();
  // Read tab from URL query param (e.g. ?tab=documents after payment)
  const getInitialTab = (): Tab => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get("tab");
    if (tab === "documents" || tab === "team" || tab === "billing" || tab === "account") return tab;
    return "account";
  };
   const [activeTab, setActiveTab] = useState<Tab>(getInitialTab);
  const utils = trpc.useUtils();

  // Show success toast if redirected from Stripe Checkout
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("payment") === "success") {
      utils.subscription.status.invalidate();
      toast.success("¡Pago completado! Tu suscripción está activa. Ya puedes descargar tus documentos.");

      // Google Ads conversion tracking — use session_id from URL as transaction_id
      const sessionId = params.get("session_id") || `pmt_${Date.now()}`;
      if (typeof window.gtag === "function") {
        window.gtag("event", "conversion", {
          send_to: "AW-18038662610",
          value: 0,
          currency: "EUR",
          transaction_id: sessionId,
        });
      }

      // Clean URL without reload
      const cleanUrl = window.location.pathname + "?tab=documents";
      window.history.replaceState({}, "", cleanUrl);
    }
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    // Redirect to home page (with login modal) for authentication
    const langMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
    const currentLang = langMatch ? langMatch[1] : "es";
    window.location.href = `/${currentLang}?login=true`;
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <Navbar />
      <div className="flex-1 container max-w-6xl py-10">
        <div className="flex flex-col md:flex-row gap-6">
          {/* Sidebar */}
          <aside className="w-full md:w-56 flex-shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {/* User info */}
              <div className="p-5 border-b border-slate-100">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-lg mb-3">
                  {user?.name?.charAt(0)?.toUpperCase() ?? user?.email?.charAt(0)?.toUpperCase() ?? "U"}
                </div>
                <p className="font-semibold text-slate-800 truncate">{user?.name ?? "Usuario"}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
              </div>
              {/* Nav */}
              <nav className="p-2">
                {([
                  { id: "account", label: "Mi Cuenta", icon: User },
                  { id: "documents", label: "Documentos", icon: FileText },
                  { id: "team", label: "Equipo", icon: Users },
                  { id: "billing", label: "Facturación", icon: CreditCard },
                ] as const).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === item.id
                        ? "bg-blue-50 text-blue-700"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <item.icon size={16} />
                    {item.label}
                  </button>
                ))}
                <Separator className="my-2" />
                <button
                  onClick={() => { logout(); navigate("/"); }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                >
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <main className="flex-1 min-w-0">
            {activeTab === "account" && <AccountTab user={user} />}
            {activeTab === "documents" && <DocumentsTab />}
            {activeTab === "team" && <TeamTab />}
            {activeTab === "billing" && <BillingTab />}
          </main>
        </div>
      </div>
      <Footer />
    </div>
  );
}

// ─── Account Tab ──────────────────────────────────────────────
function AccountTab({ user }: { user: any }) {
  const utils = trpc.useUtils();
  const [form, setForm] = useState({
    name: user?.name ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    language: user?.language ?? "es",
    timezone: user?.timezone ?? "Europe/Madrid",
    country: user?.country ?? "",
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const updateMutation = trpc.user.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Perfil actualizado correctamente");
      utils.auth.me.invalidate();
    },
    onError: () => toast.error("Error al actualizar el perfil"),
  });

  const deleteMutation = trpc.user.deleteAccount.useMutation({
    onSuccess: () => {
      toast.success("Cuenta eliminada");
      window.location.href = "/";
    },
    onError: () => toast.error("Error al eliminar la cuenta"),
  });

  const handleSave = () => {
    updateMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <h2 className="text-lg font-semibold text-slate-800 mb-5">Información personal</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label className="text-sm text-slate-600 mb-1.5 block">Nombre completo</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Tu nombre"
            />
          </div>
          <div>
            <Label className="text-sm text-slate-600 mb-1.5 block">Correo electrónico</Label>
            <Input
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="tu@email.com"
              type="email"
            />
          </div>
          <div>
            <Label className="text-sm text-slate-600 mb-1.5 block">Teléfono</Label>
            <Input
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
              placeholder="+34 600 000 000"
            />
          </div>
          <div>
            <Label className="text-sm text-slate-600 mb-1.5 block">País</Label>
            <Input
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
              placeholder="España"
            />
          </div>
          <div>
            <Label className="text-sm text-slate-600 mb-1.5 block">Idioma</Label>
            <select
              value={form.language}
              onChange={(e) => setForm({ ...form, language: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
              <option value="fr">Français</option>
              <option value="de">Deutsch</option>
              <option value="pt">Português</option>
            </select>
          </div>
          <div>
            <Label className="text-sm text-slate-600 mb-1.5 block">Zona horaria</Label>
            <select
              value={form.timezone}
              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="Europe/Madrid">Europa/Madrid (UTC+1)</option>
              <option value="Europe/London">Europa/Londres (UTC+0)</option>
              <option value="America/New_York">América/Nueva York (UTC-5)</option>
              <option value="America/Los_Angeles">América/Los Ángeles (UTC-8)</option>
              <option value="Asia/Tokyo">Asia/Tokio (UTC+9)</option>
            </select>
          </div>
        </div>
        <div className="mt-5 flex justify-end">
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6"
          >
            {updateMutation.isPending ? "Guardando..." : "Guardar cambios"}
          </Button>
        </div>
      </div>

      {/* Danger zone */}
      <div className="bg-white rounded-2xl shadow-sm border border-red-100 p-6">
        <h2 className="text-lg font-semibold text-red-700 mb-2">Zona de peligro</h2>
        <p className="text-sm text-slate-500 mb-4">
          Una vez elimines tu cuenta, no hay vuelta atrás. Por favor, asegúrate antes de continuar.
        </p>
        {!showDeleteConfirm ? (
          <Button
            variant="outline"
            onClick={() => setShowDeleteConfirm(true)}
            className="border-red-300 text-red-600 hover:bg-red-50"
          >
            <Trash2 size={16} className="mr-2" />
            Eliminar cuenta
          </Button>
        ) : (
          <div className="flex gap-3 items-center">
            <p className="text-sm text-red-600 font-medium">¿Estás seguro? Esta acción es irreversible.</p>
            <Button
              variant="destructive"
              onClick={() => deleteMutation.mutate()}
              disabled={deleteMutation.isPending}
              size="sm"
            >
              Sí, eliminar
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowDeleteConfirm(false)}>
              Cancelar
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Documents Tab ────────────────────────────────────────────────────────
function DocumentsTab() {
  const { data: docs, isLoading } = trpc.documents.list.useQuery();
  const { data: folders } = trpc.folders.list.useQuery();
  const { data: subData } = trpc.subscription.status.useQuery();
  const isPremium = subData?.isPremium ?? false;
  const utils = trpc.useUtils();
  const [newFolderName, setNewFolderName] = useState("");
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [, navigate] = useLocation();
  const { setPendingFile, setPendingTool } = usePdfFile();

  // ── Download document as blob to avoid cross-origin download attribute being ignored ──
  const handleDownloadDocument = async (doc: any) => {
    if (!doc.fileUrl) { toast.error("No se puede descargar este documento"); return; }
    try {
      toast.loading("Preparando descarga...", { id: "download-doc" });
      // Use server-side proxy to avoid CORS issues with R2 storage
      const proxyUrl = `/api/documents/proxy?url=${encodeURIComponent(doc.fileUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Error al descargar el documento");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name || "document.pdf";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Documento descargado", { id: "download-doc" });
    } catch (err) {
      toast.error("Error al descargar el documento", { id: "download-doc" });
    }
  };

  const handleEditDocument = async (doc: any) => {
    if (!doc.fileUrl) { toast.error("No se puede abrir este documento"); return; }
    try {
      toast.loading("Cargando documento...", { id: "load-doc" });
      // Use server-side proxy to avoid CORS issues with R2 storage
      const proxyUrl = `/api/documents/proxy?url=${encodeURIComponent(doc.fileUrl)}`;
      const response = await fetch(proxyUrl);
      if (!response.ok) throw new Error("Error al descargar el documento");
      const blob = await response.blob();
      const file = new File([blob], doc.name, { type: "application/pdf" });
      setPendingFile(file);
      setPendingTool(null);
      toast.dismiss("load-doc");
      const langMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
      const lang = langMatch ? langMatch[1] : "es";
      navigate(`/${lang}/editor`);
    } catch (err) {
      toast.dismiss("load-doc");
      toast.error("Error al cargar el documento");
    }
  };

  const deleteMutation = trpc.documents.delete.useMutation({
    onSuccess: () => { utils.documents.list.invalidate(); toast.success("Documento eliminado"); },
  });

  const createFolderMutation = trpc.folders.create.useMutation({
    onSuccess: () => { utils.folders.list.invalidate(); setNewFolderName(""); setShowNewFolder(false); toast.success("Carpeta creada"); },
  });

  const deleteFolderMutation = trpc.folders.delete.useMutation({
    onSuccess: () => { utils.folders.list.invalidate(); toast.success("Carpeta eliminada"); },
  });

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Folders */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Carpetas</h2>
          <Button size="sm" variant="outline" onClick={() => setShowNewFolder(true)}>
            <Plus size={14} className="mr-1.5" />Nueva carpeta
          </Button>
        </div>
        {showNewFolder && (
          <div className="flex gap-2 mb-3">
            <Input
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Nombre de la carpeta..."
              onKeyDown={(e) => e.key === "Enter" && createFolderMutation.mutate({ name: newFolderName })}
              autoFocus
            />
            <Button size="sm" onClick={() => createFolderMutation.mutate({ name: newFolderName })} disabled={!newFolderName.trim()}>
              <Check size={14} />
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowNewFolder(false)}>
              <X size={14} />
            </Button>
          </div>
        )}
        {folders && folders.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {folders.map((folder: any) => (
              <div key={folder.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 group">
                <div className="flex items-center gap-2">
                  <FolderOpen size={16} className="text-amber-500" />
                  <span className="text-sm text-slate-700 truncate">{folder.name}</span>
                </div>
                <button
                  onClick={() => deleteFolderMutation.mutate({ id: folder.id })}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                >
                  <X size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-400 text-center py-3">Sin carpetas aún</p>
        )}
      </div>

      {/* Documents */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Mis documentos</h2>
          {isPremium ? (
            <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
              <Crown size={12} className="text-emerald-600" />
              Descarga activa
            </span>
          ) : (
            <button
              onClick={() => setShowPaywall(true)}
              className="flex items-center gap-1.5 text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full hover:bg-amber-100 transition-colors"
            >
              <Crown size={12} className="text-amber-600" />
              Suscríbete para descargar
            </button>
          )}
        </div>
        {docs && docs.length > 0 ? (
          <div className="space-y-2">
            {docs.map((doc: any) => (
              <div key={doc.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 group">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0">
                    <FileText size={16} className="text-red-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-800 truncate">{doc.name}</p>
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs text-slate-400">
                        {doc.fileSize ? `${(doc.fileSize / 1024 / 1024).toFixed(1)} MB · ` : ""}
                        {new Date(doc.createdAt).toLocaleDateString("es-ES")}
                      </p>
                      {!isPremium && doc.paymentStatus === "pending" && (
                        <span className="text-[10px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">Pago pendiente</span>
                      )}
                      {doc.paymentStatus === "paid" && (
                        <span className="text-[10px] font-medium text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">Pagado</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {/* Edit button — always visible for all users */}
                  {doc.fileUrl && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-8 px-2 gap-1 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                      title="Editar en el editor"
                      onClick={() => handleEditDocument(doc)}
                    >
                      <Edit3 size={13} />
                      <span className="text-xs">Editar</span>
                    </Button>
                  )}
                  {doc.fileUrl && (
                    isPremium ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0"
                        title="Descargar"
                        onClick={() => handleDownloadDocument(doc)}
                      >
                        <Download size={14} />
                      </Button>
                    ) : doc.paymentStatus === "pending" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 px-2 gap-1 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                        title="Pagar para descargar"
                        onClick={() => setShowPaywall(true)}
                      >
                        <CreditCard size={13} />
                        <span className="text-xs font-medium">Pagar</span>
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-amber-500"
                        title="Requiere suscripción activa"
                        onClick={() => setShowPaywall(true)}
                      >
                        <Crown size={14} />
                      </Button>
                    )
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 w-8 p-0 hover:text-red-500"
                    onClick={() => deleteMutation.mutate({ id: doc.id })}
                  >
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-10">
            <FileText size={40} className="text-slate-200 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">Sin documentos aún</p>
            <p className="text-sm text-slate-400 mt-1">Los PDFs que edites y descargues aparecerán aquí</p>
          </div>
        )}
      </div>

      {/* Paywall: shown when user tries to download without subscription */}
      <PaywallModal isOpen={showPaywall} onClose={() => setShowPaywall(false)} action="descargar" />
    </div>
  );
}

// ─── Team Tab ────────────────────────────────────────────────────────
function TeamTab() {
  const { data: team, isLoading } = trpc.team.list.useQuery();
  const utils = trpc.useUtils();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"editor" | "viewer" | "admin">("editor");
  const [showForm, setShowForm] = useState(false);

  const inviteMutation = trpc.team.invite.useMutation({
    onSuccess: () => {
      utils.team.list.invalidate();
      setEmail("");
      setShowForm(false);
      toast.success("Invitación enviada correctamente");
    },
    onError: () => toast.error("Error al enviar la invitación"),
  });

  const removeMutation = trpc.team.remove.useMutation({
    onSuccess: () => { utils.team.list.invalidate(); toast.success("Miembro eliminado"); },
  });

  const roleColors: Record<string, string> = {
    editor: "bg-blue-50 text-blue-700",
    viewer: "bg-slate-100 text-slate-600",
    admin: "bg-purple-50 text-purple-700",
  };

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-slate-800">Equipo</h2>
          <p className="text-sm text-slate-500 mt-0.5">Invita a colaboradores para trabajar juntos en tus documentos</p>
        </div>
        <Button
          size="sm"
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 hover:bg-blue-700 text-white"
        >
          <Plus size={14} className="mr-1.5" />
          Invitar
        </Button>
      </div>

      {showForm && (
        <div className="mb-5 p-4 bg-slate-50 rounded-xl border border-slate-100">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="md:col-span-2">
              <Label className="text-xs text-slate-500 mb-1 block">Correo electrónico</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="colaborador@empresa.com"
                onKeyDown={(e) => e.key === "Enter" && inviteMutation.mutate({ email, role })}
              />
            </div>
            <div>
              <Label className="text-xs text-slate-500 mb-1 block">Rol</Label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white"
              >
                <option value="viewer">Visor</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <Button
              size="sm"
              onClick={() => inviteMutation.mutate({ email, role })}
              disabled={!email.trim() || inviteMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Mail size={14} className="mr-1.5" />
              Enviar invitación
            </Button>
            <Button size="sm" variant="outline" onClick={() => setShowForm(false)}>
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3">
          {[1, 2].map((i) => <div key={i} className="h-14 bg-slate-100 rounded-xl animate-pulse" />)}
        </div>
      ) : team && team.length > 0 ? (
        <div className="space-y-2">
          {team.map((member: any) => (
            <div key={member.id} className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:bg-slate-50 group">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-gradient-to-br from-slate-400 to-slate-600 flex items-center justify-center text-white text-sm font-medium">
                  {member.inviteeEmail.charAt(0).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-medium text-slate-800">{member.inviteeEmail}</p>
                  <p className="text-xs text-slate-400">
                    Invitado el {new Date(member.createdAt).toLocaleDateString("es-ES")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${roleColors[member.role] ?? "bg-slate-100 text-slate-600"}`}>
                  {member.role === "editor" ? "Editor" : member.role === "viewer" ? "Visor" : "Admin"}
                </span>
                <button
                  onClick={() => removeMutation.mutate({ id: member.id })}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-10">
          <Users size={40} className="text-slate-200 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">Sin miembros en el equipo</p>
          <p className="text-sm text-slate-400 mt-1">Invita a colaboradores para trabajar juntos</p>
        </div>
      )}
    </div>
  );
}

// ─── Paddle Inline Checkout (Dashboard) ──────────────────────
function DashboardPaddleInline({
  paddleConfig,
  user,
  onComplete,
}: {
  paddleConfig?: { clientToken: string; priceId: string } | null;
  user?: { id: number; email: string | null; name?: string | null } | null;
  onComplete: (data: any) => void;
}) {
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);
  const opened = useRef(false);

  const handleComplete = useCallback((eventData: any) => {
    onComplete(eventData);
  }, [onComplete]);

  useEffect(() => {
    if (!paddleConfig?.clientToken || !paddleConfig?.priceId) return;
    const P = (window as any).Paddle;
    if (!P) return;
    try {
      if (!initialized.current) {
        P.Initialize({
          token: paddleConfig.clientToken,
          checkout: {
            settings: {
              displayMode: "inline",
              frameTarget: "dashboard-paddle-checkout",
              frameInitialHeight: "450",
              frameStyle: "width: 100%; min-width: 312px; background-color: transparent; border: none;",
            },
          },
          eventCallback: (event: any) => {
            if (event.name === "checkout.loaded") setReady(true);
            if (event.name === "checkout.completed") handleComplete(event.data);
          },
        });
        initialized.current = true;
      } else {
        P.Update({
          eventCallback: (event: any) => {
            if (event.name === "checkout.loaded") setReady(true);
            if (event.name === "checkout.completed") handleComplete(event.data);
          },
        });
      }
      if (!opened.current) {
        const langMatch = window.location.pathname.match(/^\/([a-z]{2})(\/|$)/);
        const currentLang = langMatch ? langMatch[1] : "es";
        const langToCountry: Record<string, string> = { es: "ES", en: "US", fr: "FR", de: "DE", pt: "PT", it: "IT", nl: "NL", pl: "PL", ru: "RU", zh: "CN" };
        P.Checkout.open({
          items: [{ priceId: paddleConfig.priceId, quantity: 1 }],
          customer: { email: user?.email || undefined, address: { countryCode: langToCountry[currentLang] || "ES" } },
          customData: {
            user_id: user?.id?.toString() || "",
            user_email: user?.email || "",
            user_name: user?.name || "",
          },
          settings: { locale: currentLang || "es", allowLogout: false, showAddDiscounts: true },
        });
        opened.current = true;
      }
    } catch (err) {
      console.error("[Paddle] Dashboard inline error:", err);
    }
  }, [paddleConfig, user, handleComplete]);

  useEffect(() => {
    return () => {
      if (opened.current && (window as any).Paddle) {
        try { (window as any).Paddle.Checkout.close(); } catch {}
      }
    };
  }, []);

  return (
    <div>
      {!ready && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
          <span className="ml-2 text-sm text-slate-500">Cargando formulario de pago...</span>
        </div>
      )}
      <div
        className="dashboard-paddle-checkout"
        style={{ minHeight: ready ? "auto" : 0, opacity: ready ? 1 : 0, transition: "opacity 0.3s ease" }}
      />
    </div>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────
function BillingTab() {
  const { user } = useAuth();
  const { data: subData, isLoading } = trpc.subscription.status.useQuery();
  const utils = trpc.useUtils();
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showInlineCheckout, setShowInlineCheckout] = useState(false);

  const paddleConfigQ = trpc.subscription.paddleConfig.useQuery();
  const confirmPaddleCheckout = trpc.subscription.confirmPaddleCheckout.useMutation({
    onSuccess: () => {
      utils.subscription.status.invalidate();
      setShowInlineCheckout(false);
      toast.success("¡Suscripción activada correctamente!");
    },
    onError: () => toast.error("Error al confirmar el pago"),
  });

  const openInlineCheckout = () => {
    setShowInlineCheckout(true);
    setTimeout(() => {
      document.getElementById("billing-checkout-section")?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const cancelMutation = trpc.subscription.cancel.useMutation({
    onSuccess: () => {
      utils.subscription.status.invalidate();
      setShowCancelModal(false);
      toast.success("Suscripción cancelada. Seguirás teniendo acceso hasta el final del período.");
    },
    onError: () => {
      toast.error("Error al cancelar la suscripción. Inténtalo de nuevo.");
    },
  });

  const isPremium = subData?.isPremium ?? false;
  const sub = subData?.subscription;

  const expiryDateStr = sub?.currentPeriodEnd
    ? new Date(sub.currentPeriodEnd).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : null;

  if (isLoading) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
        <div className="space-y-4">
          <div className="h-24 bg-slate-100 rounded-xl animate-pulse" />
          <div className="h-40 bg-slate-100 rounded-xl animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Current plan card */}
      <div className={`rounded-2xl shadow-sm border p-6 ${
        isPremium
          ? sub?.cancelAtPeriodEnd
            ? "bg-gradient-to-br from-amber-500 to-orange-600 text-white border-amber-400"
            : "bg-gradient-to-br from-blue-600 to-indigo-700 text-white border-blue-500"
          : "bg-white border-slate-100"
      }`}>
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              {isPremium && <Crown size={18} className="text-yellow-300 flex-shrink-0" />}
              <h2 className={`text-lg font-bold truncate ${isPremium ? "text-white" : "text-slate-800"}`}>
                {isPremium
                  ? sub?.cancelAtPeriodEnd
                    ? "Suscripción cancelada"
                    : `Plan ${sub?.plan === "trial" ? "Prueba (7 días)" : "Premium Mensual"}`
                  : "Plan Básico"}
              </h2>
            </div>

            {/* Status description */}
            {isPremium && sub?.cancelAtPeriodEnd ? (
              <div className="mt-1 space-y-1">
                <p className="text-amber-100 text-sm flex items-center gap-1.5">
                  <AlertCircle size={14} className="flex-shrink-0" />
                  Tu acceso expira el{" "}
                  <strong className="text-white">{expiryDateStr ?? "final del período"}</strong>
                </p>
                <p className="text-amber-200 text-xs">
                  Puedes seguir usando todas las funciones hasta esa fecha.
                </p>
              </div>
            ) : isPremium ? (
              <p className="text-blue-100 text-sm">
                {expiryDateStr
                  ? `Próxima renovación: ${expiryDateStr}`
                  : "Acceso activo"}
              </p>
            ) : (
              <p className="text-slate-500 text-sm">Funciones básicas de edición PDF</p>
            )}
          </div>

          {/* Price badge */}
          <div className="text-right flex-shrink-0">
            {isPremium ? (
              <div>
                <p className="text-3xl font-bold text-white">
                  {sub?.plan === "trial" ? "0€" : "49,90€"}
                </p>
                <p className={`text-xs ${sub?.cancelAtPeriodEnd ? "text-amber-200" : "text-blue-200"}`}>
                  {sub?.plan === "trial" ? "prueba 7 días" : "/ mes"}
                </p>
              </div>
            ) : (
              <p className="text-3xl font-bold text-slate-800">Básico</p>
            )}
          </div>
        </div>
      </div>

      {/* Manage subscription — cancel button (only if active and NOT already canceling) */}
      {isPremium && !sub?.cancelAtPeriodEnd && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-semibold text-slate-800 mb-1">Gestionar suscripción</h3>
          <p className="text-sm text-slate-500 mb-4">
            Si cancelas, seguirás teniendo acceso completo hasta el{" "}
            <strong>{expiryDateStr ?? "final del período de facturación"}</strong>.
            No se realizarán más cargos.
          </p>
          <Button
            variant="outline"
            onClick={() => setShowCancelModal(true)}
            className="border-red-200 text-red-600 hover:bg-red-50 hover:border-red-400 transition-colors"
          >
            Cancelar suscripción
          </Button>
        </div>
      )}

      {/* Already canceled — info banner */}
      {isPremium && sub?.cancelAtPeriodEnd && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-3">
          <AlertCircle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
          <div>
            <p className="text-sm font-semibold text-amber-800">
              Suscripción programada para cancelarse
            </p>
            <p className="text-sm text-amber-700 mt-0.5">
              Tu acceso estará activo hasta el{" "}
              <strong>{expiryDateStr ?? "final del período"}</strong>.
              Después de esa fecha no se realizará ningún cargo adicional.
            </p>
          </div>
        </div>
      )}

      {/* Features comparison (only for basic users) */}
      {!isPremium && (
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6">
          <h3 className="font-semibold text-slate-800 mb-4">Funciones disponibles con Premium</h3>
          <div className="space-y-2.5">
            {[
              "Descarga ilimitada de PDFs editados",
              "Firma digital avanzada",
              "Protección con contraseña",
              "Compresión de PDFs",
              "Conversión PDF a Word, Excel, JPG",
              "Almacenamiento de documentos en la nube",
              "Soporte prioritario",
              "Sin marca de agua",
            ].map((feature) => (
              <div key={feature} className="flex items-center gap-2.5">
                <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Check size={12} className="text-blue-600" />
                </div>
                <span className="text-sm text-slate-700">{feature}</span>
              </div>
            ))}
          </div>

          <div className="mt-6">
            <Button
              className="w-full bg-blue-600 hover:bg-blue-700 text-white"
              onClick={openInlineCheckout}
              disabled={showInlineCheckout}
            >
              <CreditCard size={16} className="mr-2" />
              {showInlineCheckout ? "Formulario de pago abierto abajo" : "Suscribirse ahora"}
            </Button>
          </div>
        </div>
      )}

      {/* Inline Paddle Checkout */}
      {showInlineCheckout && !isPremium && (
        <div id="billing-checkout-section" className="bg-white rounded-2xl shadow-sm border border-blue-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between" style={{ backgroundColor: "oklch(0.98 0.005 250)" }}>
            <div className="flex items-center gap-2">
              <CreditCard size={18} className="text-blue-600" />
              <h3 className="font-bold text-slate-800">Completa tu suscripción</h3>
            </div>
            <button onClick={() => setShowInlineCheckout(false)} className="text-sm text-slate-500 hover:text-slate-700 hover:underline">Cancelar</button>
          </div>
          <DashboardPaddleInline
            paddleConfig={paddleConfigQ.data}
            user={user}
            onComplete={(data: any) => {
              const txnId = data.transaction_id || data.subscription_id || "";
              // Google Ads conversion tracking
              if (typeof window.gtag === "function") {
                window.gtag("event", "conversion", {
                  send_to: "AW-18038662610",
          value: 0,
          currency: "EUR",
          transaction_id: txnId,
        });
        window.gtag("event", "purchase", {
          transaction_id: txnId,
          value: 0,
          currency: "EUR",
          items: [{ item_id: "cloudpdf_trial", item_name: "CloudPDF Trial Subscription", price: 0, quantity: 1 }],
                });
                console.log("[Dashboard] Conversion tracking fired", { txnId });
              }
              confirmPaddleCheckout.mutate({
                transactionId: data.transaction_id || "",
                subscriptionId: data.subscription_id || "",
                customerId: data.customer_id || "",
              });
            }}
          />
        </div>
      )}

      {/* ── Cancel Confirmation Modal ── */}
      {showCancelModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(3px)" }}
          onClick={(e) => e.target === e.currentTarget && setShowCancelModal(false)}
        >
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            {/* Header */}
            <div className="flex items-start gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <AlertCircle size={20} className="text-red-500" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">¿Cancelar suscripción?</h3>
                <p className="text-sm text-slate-500 mt-0.5">Esta acción no se puede deshacer.</p>
              </div>
              <button
                onClick={() => setShowCancelModal(false)}
                className="ml-auto w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 transition-colors flex-shrink-0"
              >
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            {/* Info box */}
            <div className="bg-slate-50 rounded-xl p-4 mb-5 space-y-2">
              <div className="flex items-center gap-2">
                <Check size={15} className="text-green-500 flex-shrink-0" />
                <p className="text-sm text-slate-700">
                  Seguirás teniendo acceso hasta el{" "}
                  <strong>{expiryDateStr ?? "final del período"}</strong>.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Check size={15} className="text-green-500 flex-shrink-0" />
                <p className="text-sm text-slate-700">No se realizarán más cargos automáticos.</p>
              </div>
              <div className="flex items-center gap-2">
                <Check size={15} className="text-green-500 flex-shrink-0" />
                <p className="text-sm text-slate-700">Tus documentos guardados permanecerán accesibles.</p>
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => setShowCancelModal(false)}
                disabled={cancelMutation.isPending}
              >
                Mantener suscripción
              </Button>
              <Button
                className="flex-1 bg-red-600 hover:bg-red-700 text-white"
                onClick={() => cancelMutation.mutate()}
                disabled={cancelMutation.isPending}
              >
                {cancelMutation.isPending ? (
                  <span className="flex items-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Cancelando...
                  </span>
                ) : (
                  "Sí, cancelar"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
