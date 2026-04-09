/* =============================================================
   CloudPDF Admin Panel — Dashboard completo
   MRR, ARR, estadísticas de facturación, usuarios, pagos, legal
   ============================================================= */
import { useState } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { brandName, isFastDoc } from "@/lib/brand";
import { toast } from "sonner";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, DollarSign, TrendingUp, TrendingDown, MessageSquare, FileText,
  Search, Trash2, ShieldCheck, ShieldOff, Mail, ChevronDown, ChevronUp,
  CreditCard, Settings, BookOpen, BarChart2, UserX, RefreshCw, Eye, EyeOff,
  ArrowLeft, Crown, Rss, Star,
} from "lucide-react";
import BlogAdmin from "./BlogAdmin";
import TrustpilotAdmin from "./TrustpilotAdmin";

type AdminTab = "overview" | "billing" | "users" | "canceled" | "messages" | "legal" | "settings" | "blog" | "trustpilot";

export default function Admin() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated, loading } = useAuth();
  const [tab, setTab] = useState<AdminTab>("overview");
  const [userSearch, setUserSearch] = useState("");
  const [expandedMsg, setExpandedMsg] = useState<number | null>(null);
  const [editingLegal, setEditingLegal] = useState<string | null>(null);
  const [legalTitle, setLegalTitle] = useState("");
  const [legalContent, setLegalContent] = useState("");


  // Queries
  const statsQ = trpc.admin.stats.useQuery(undefined, { enabled: !!user && user.role === "admin" });
  const billingQ = trpc.admin.billingStats.useQuery(undefined, { enabled: !!user && user.role === "admin" && tab === "billing" });
  const usersQ = trpc.admin.users.useQuery({ search: userSearch }, { enabled: !!user && user.role === "admin" && tab === "users" });
  const canceledQ = trpc.admin.canceledSubscriptions.useQuery(undefined, { enabled: !!user && user.role === "admin" && tab === "canceled" });
  const messagesQ = trpc.admin.contactMessages.useQuery(undefined, { enabled: !!user && user.role === "admin" && tab === "messages" });
  const legalQ = trpc.admin.legalPages.useQuery(undefined, { enabled: !!user && user.role === "admin" && tab === "legal" });
  const settingsQ = trpc.admin.settings.useQuery(undefined, { enabled: !!user && user.role === "admin" && tab === "settings" });

  const utils = trpc.useUtils();

  const deleteUserMut = trpc.admin.deleteUser.useMutation({
    onSuccess: () => { toast.success("Usuario eliminado"); utils.admin.users.invalidate(); },
    onError: () => toast.error("Error al eliminar usuario"),
  });

  const promoteUserMut = trpc.admin.promoteUser.useMutation({
    onSuccess: () => { toast.success("Rol actualizado"); utils.admin.users.invalidate(); },
    onError: () => toast.error("Error al actualizar rol"),
  });

  const markReadMut = trpc.admin.markMessageRead.useMutation({
    onSuccess: () => utils.admin.contactMessages.invalidate(),
  });

  const saveLegalMut = trpc.admin.saveLegalPage.useMutation({
    onSuccess: () => {
      toast.success("Página legal guardada");
      setEditingLegal(null);
      utils.admin.legalPages.invalidate();
    },
    onError: () => toast.error("Error al guardar"),
  });

  const saveSettingMut = trpc.admin.saveSetting.useMutation({
    onSuccess: () => { toast.success("Ajuste guardado"); utils.admin.settings.invalidate(); },
  });

  // Auth guard
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0f1117" }}>
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated || user?.role !== "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ backgroundColor: "#0f1117" }}>
        <p className="text-white text-lg">Acceso restringido a administradores</p>
        <button
          onClick={() => navigate("/")}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white"
          style={{ backgroundColor: "oklch(0.55 0.22 260)" }}
        >
          Volver al inicio
        </button>
      </div>
    );
  }

  const stats = statsQ.data;
  const billing = billingQ.data;

  const tabs: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Resumen", icon: <BarChart2 size={16} /> },
    { id: "billing", label: "Facturación & MRR", icon: <DollarSign size={16} /> },
    { id: "users", label: "Usuarios", icon: <Users size={16} /> },
    { id: "canceled", label: "Bajas", icon: <UserX size={16} /> },
    { id: "messages", label: "Mensajes", icon: <MessageSquare size={16} /> },
    { id: "legal", label: "Páginas legales", icon: <BookOpen size={16} /> },
    { id: "settings", label: "Ajustes", icon: <Settings size={16} /> },
    ...(!isFastDoc ? [{ id: "blog" as AdminTab, label: "Blog", icon: <Rss size={16} /> }] : []),
    ...(!isFastDoc ? [{ id: "trustpilot" as AdminTab, label: "Trustpilot", icon: <Star size={16} /> }] : []),
  ];

  const formatEur = (n: number) =>
    `€${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="min-h-screen" style={{ backgroundColor: "#0f1117", color: "#e2e8f0" }}>
      {/* Header */}
      <div
        className="border-b px-6 py-4 flex items-center justify-between"
        style={{ borderColor: "#1e2433", backgroundColor: "#0a0d14" }}
      >
        <div className="flex items-center gap-3">
          <button onClick={() => navigate("/")} className="text-gray-400 hover:text-white transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div>
            <h1 className="text-xl font-bold text-white">Panel de Administración</h1>
            <p className="text-xs text-gray-400">{brandName} — {user.email}</p>
          </div>
        </div>
        <button
          onClick={() => { utils.admin.stats.invalidate(); utils.admin.billingStats.invalidate(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-gray-400 hover:text-white transition-colors"
          style={{ backgroundColor: "#1e2433" }}
        >
          <RefreshCw size={13} />
          Actualizar
        </button>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className="w-52 min-h-[calc(100vh-64px)] border-r flex-shrink-0"
          style={{ borderColor: "#1e2433", backgroundColor: "#0a0d14" }}
        >
          <nav className="p-3 flex flex-col gap-1">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium text-left transition-colors w-full"
                style={{
                  backgroundColor: tab === t.id ? "oklch(0.28 0.08 260)" : "transparent",
                  color: tab === t.id ? "white" : "#94a3b8",
                }}
                onMouseEnter={(e) => { if (tab !== t.id) e.currentTarget.style.backgroundColor = "#1e2433"; }}
                onMouseLeave={(e) => { if (tab !== t.id) e.currentTarget.style.backgroundColor = "transparent"; }}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </nav>
        </aside>

        {/* Main content */}
        <main className="flex-1 p-6 overflow-auto">

          {/* ── OVERVIEW ── */}
          {tab === "overview" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-white">Resumen general</h2>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { label: "Total usuarios", value: stats?.totalUsers ?? "—", icon: <Users size={20} />, color: "#3b82f6" },
                  { label: "Suscripciones activas", value: stats?.activeSubscriptions ?? "—", icon: <CreditCard size={20} />, color: "#10b981" },
                  { label: "Documentos", value: stats?.totalDocuments ?? "—", icon: <FileText size={20} />, color: "#8b5cf6" },
                  { label: "Mensajes sin leer", value: stats?.unreadMessages ?? "—", icon: <MessageSquare size={20} />, color: "#f59e0b" },
                ].map((card) => (
                  <div
                    key={card.label}
                    className="rounded-xl p-4 border"
                    style={{ backgroundColor: "#131720", borderColor: "#1e2433" }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs text-gray-400">{card.label}</p>
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center"
                        style={{ backgroundColor: card.color + "20", color: card.color }}
                      >
                        {card.icon}
                      </div>
                    </div>
                    <p className="text-2xl font-bold text-white">{card.value}</p>
                  </div>
                ))}
              </div>

              <div
                className="rounded-xl p-5 border"
                style={{ backgroundColor: "#131720", borderColor: "#1e2433" }}
              >
                <p className="text-sm font-semibold text-white mb-1">Estadísticas de facturación</p>
                <p className="text-xs text-gray-400 mb-4">
                  Accede a la pestaña "Facturación &amp; MRR" para el análisis completo con gráficas.
                </p>
                <button
                  onClick={() => setTab("billing")}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-white transition-colors"
                  style={{ backgroundColor: "oklch(0.55 0.22 260)" }}
                >
                  Ver estadísticas de facturación →
                </button>
              </div>
            </div>
          )}

          {/* ── BILLING & MRR ── */}
          {tab === "billing" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-white">Facturación &amp; MRR</h2>

              {billingQ.isLoading ? (
                <div className="flex items-center justify-center h-40">
                  <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : billing ? (
                <>
                  {/* Top KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      {
                        label: "MRR",
                        value: formatEur(billing.mrr),
                        sub: "Ingresos mensuales recurrentes",
                        icon: <TrendingUp size={18} />,
                        color: "#10b981",
                      },
                      {
                        label: "ARR",
                        value: formatEur(billing.arr),
                        sub: "Ingresos anuales recurrentes",
                        icon: <DollarSign size={18} />,
                        color: "#3b82f6",
                      },
                      {
                        label: "Suscripciones activas",
                        value: billing.activeSubscriptions,
                        sub: `${billing.newSubsMonth} nuevas este mes`,
                        icon: <CreditCard size={18} />,
                        color: "#8b5cf6",
                      },
                      {
                        label: "Churn rate",
                        value: `${billing.churnRate}%`,
                        sub: `${billing.canceledSubscriptions} canceladas total`,
                        icon: <TrendingDown size={18} />,
                        color: "#ef4444",
                      },
                    ].map((card) => (
                      <div
                        key={card.label}
                        className="rounded-xl p-4 border"
                        style={{ backgroundColor: "#131720", borderColor: "#1e2433" }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-xs text-gray-400">{card.label}</p>
                          <div
                            className="w-7 h-7 rounded-lg flex items-center justify-center"
                            style={{ backgroundColor: card.color + "20", color: card.color }}
                          >
                            {card.icon}
                          </div>
                        </div>
                        <p className="text-2xl font-bold text-white">{card.value}</p>
                        <p className="text-xs text-gray-500 mt-1">{card.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* Period stats */}
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { label: "Nuevas suscripciones hoy", value: billing.newSubsToday },
                      { label: "Nuevas suscripciones esta semana", value: billing.newSubsWeek },
                      { label: "Nuevas suscripciones este mes", value: billing.newSubsMonth },
                      { label: "Nuevos usuarios hoy", value: billing.newUsersToday },
                      { label: "Nuevos usuarios esta semana", value: billing.newUsersWeek },
                      { label: "Nuevos usuarios este mes", value: billing.newUsersMonth },
                    ].map((s) => (
                      <div
                        key={s.label}
                        className="rounded-xl p-4 border"
                        style={{ backgroundColor: "#131720", borderColor: "#1e2433" }}
                      >
                        <p className="text-xs text-gray-400 mb-1">{s.label}</p>
                        <p className="text-2xl font-bold text-white">{s.value}</p>
                      </div>
                    ))}
                  </div>

                  {/* Revenue chart */}
                  <div
                    className="rounded-xl p-5 border"
                    style={{ backgroundColor: "#131720", borderColor: "#1e2433" }}
                  >
                    <p className="text-sm font-semibold text-white mb-4">
                      Ingresos mensuales (últimos 12 meses)
                    </p>
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={billing.monthlyRevenue}>
                        <defs>
                          <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                        <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} />
                        <YAxis
                          tick={{ fill: "#64748b", fontSize: 11 }}
                          tickFormatter={(v) => `€${v}`}
                        />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e2433",
                            border: "1px solid #334155",
                            borderRadius: "8px",
                            color: "#e2e8f0",
                          }}
                          formatter={(v: number) => [`€${v.toFixed(2)}`, "Ingresos"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="revenue"
                          stroke="#3b82f6"
                          fill="url(#revGrad)"
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Subscriptions chart */}
                  <div
                    className="rounded-xl p-5 border"
                    style={{ backgroundColor: "#131720", borderColor: "#1e2433" }}
                  >
                    <p className="text-sm font-semibold text-white mb-4">
                      Nuevas suscripciones por mes
                    </p>
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={billing.monthlyRevenue}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1e2433" />
                        <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} />
                        <YAxis tick={{ fill: "#64748b", fontSize: 11 }} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: "#1e2433",
                            border: "1px solid #334155",
                            borderRadius: "8px",
                            color: "#e2e8f0",
                          }}
                        />
                        <Bar dataKey="subs" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </>
              ) : (
                <p className="text-gray-400">No hay datos disponibles</p>
              )}
            </div>
          )}

          {/* ── USERS ── */}
          {tab === "users" && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Gestión de usuarios</h2>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Buscar por email..."
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    className="pl-8 pr-3 py-2 rounded-lg text-sm border bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
                    style={{ borderColor: "#1e2433", color: "#e2e8f0", backgroundColor: "#131720" }}
                  />
                </div>
              </div>

              <div className="rounded-xl border overflow-x-auto" style={{ borderColor: "#1e2433" }}>
                <table className="w-full text-sm min-w-[1300px]">
                  <thead>
                    <tr style={{ backgroundColor: "#0a0d14" }}>
                      {["ID", "Nombre", "Email", "Rol", "Suscripción", "Plan", "ID Pago", "Vence", "Registro", "Último acceso", "Acciones"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {usersQ.isLoading ? (
                      <tr>
                        <td colSpan={11} className="px-4 py-8 text-center text-gray-400">
                          Cargando...
                        </td>
                      </tr>
                    ) : (usersQ.data ?? []).map((u, i) => (
                      <tr
                        key={u.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? "#131720" : "#0f1117",
                          borderTop: "1px solid #1e2433",
                        }}
                      >
                        <td className="px-4 py-3 text-gray-400 text-xs">{u.id}</td>
                        <td className="px-4 py-3 text-white font-medium">{u.name ?? "\u2014"}</td>
                        <td className="px-4 py-3 text-gray-300">{u.email ?? "\u2014"}</td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: u.role === "admin" ? "#7c3aed20" : "#1e2433",
                              color: u.role === "admin" ? "#a78bfa" : "#94a3b8",
                            }}
                          >
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {u.subStatus ? (
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium whitespace-nowrap"
                              style={{
                                backgroundColor:
                                  u.subStatus === "active" || u.subStatus === "trialing" ? "#10b98120" :
                                  u.subStatus === "canceled" ? "#ef444420" :
                                  u.subStatus === "past_due" ? "#f59e0b20" :
                                  u.subStatus === "incomplete" ? "#6366f120" : "#1e2433",
                                color:
                                  u.subStatus === "active" || u.subStatus === "trialing" ? "#34d399" :
                                  u.subStatus === "canceled" ? "#f87171" :
                                  u.subStatus === "past_due" ? "#fbbf24" :
                                  u.subStatus === "incomplete" ? "#a5b4fc" : "#94a3b8",
                              }}
                            >
                              {u.subStatus === "active" ? "\u2705 Activa" :
                               u.subStatus === "trialing" ? "\u23F3 Trial" :
                               u.subStatus === "canceled" ? "\u274C Cancelada" :
                               u.subStatus === "past_due" ? "\u26A0\uFE0F Impago" :
                               u.subStatus === "incomplete" ? "\u23F3 Incompleta" : u.subStatus}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-500">Sin suscripci\u00f3n</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {u.subPlan ?? "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-xs text-gray-500 font-mono">
                          {"\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs whitespace-nowrap">
                          {u.currentPeriodEnd ? new Date(u.currentPeriodEnd).toLocaleDateString("es-ES") : "\u2014"}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {new Date(u.createdAt).toLocaleDateString("es-ES")}
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {new Date(u.lastSignedIn).toLocaleDateString("es-ES")}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() =>
                                promoteUserMut.mutate({
                                  userId: u.id,
                                  role: u.role === "admin" ? "user" : "admin",
                                })
                              }
                              title={u.role === "admin" ? "Quitar admin" : "Hacer admin"}
                              className="p-1.5 rounded transition-colors hover:bg-gray-700"
                              style={{ color: u.role === "admin" ? "#f59e0b" : "#64748b" }}
                            >
                              {u.role === "admin" ? <ShieldOff size={14} /> : <ShieldCheck size={14} />}
                            </button>
                            {u.email && (
                              <a
                                href={`mailto:${u.email}`}
                                className="p-1.5 rounded transition-colors hover:bg-gray-700 text-gray-400 hover:text-blue-400"
                              >
                                <Mail size={14} />
                              </a>
                            )}
                            <button
                              onClick={() => {
                                if (confirm(`¿Eliminar usuario ${u.email}?`)) {
                                  deleteUserMut.mutate({ userId: u.id });
                                }
                              }}
                              className="p-1.5 rounded transition-colors hover:bg-gray-700 text-gray-400 hover:text-red-400"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── CANCELED ── */}
          {tab === "canceled" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Usuarios que se han dado de baja</h2>
              <div className="rounded-xl border overflow-hidden" style={{ borderColor: "#1e2433" }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ backgroundColor: "#0a0d14" }}>
                      {["Nombre", "Email", "Plan", "Fecha baja", "País", "ID Pago"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-400">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {canceledQ.isLoading ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                          Cargando...
                        </td>
                      </tr>
                    ) : (canceledQ.data ?? []).length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-gray-400">
                          No hay bajas registradas
                        </td>
                      </tr>
                    ) : (canceledQ.data ?? []).map((u, i) => (
                      <tr
                        key={u.id}
                        style={{
                          backgroundColor: i % 2 === 0 ? "#131720" : "#0f1117",
                          borderTop: "1px solid #1e2433",
                        }}
                      >
                        <td className="px-4 py-3 text-white">{u.name ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-300">{u.email ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className="px-2 py-0.5 rounded text-xs font-medium"
                            style={{ backgroundColor: "#ef444420", color: "#f87171" }}
                          >
                            {u.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 text-xs">
                          {u.canceledAt
                            ? new Date(u.canceledAt).toLocaleDateString("es-ES")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 text-gray-400">{u.country ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-500 text-xs font-mono">
                          {"—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── MESSAGES ── */}
          {tab === "messages" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Mensajes de contacto</h2>
              {messagesQ.isLoading ? (
                <p className="text-gray-400">Cargando...</p>
              ) : (messagesQ.data ?? []).length === 0 ? (
                <p className="text-gray-400">No hay mensajes</p>
              ) : (
                <div className="space-y-2">
                  {(messagesQ.data ?? []).map((msg) => (
                    <div
                      key={msg.id}
                      className="rounded-xl border p-4 cursor-pointer transition-colors"
                      style={{
                        backgroundColor: msg.read ? "#131720" : "#1a1f2e",
                        borderColor: msg.read ? "#1e2433" : "#3b82f640",
                      }}
                      onClick={() => {
                        setExpandedMsg(expandedMsg === msg.id ? null : msg.id);
                        if (!msg.read) markReadMut.mutate({ id: msg.id });
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {!msg.read && (
                            <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                          )}
                          <div>
                            <p className="text-sm font-medium text-white">
                              {msg.name}{" "}
                              <span className="text-gray-400 font-normal">— {msg.email}</span>
                            </p>
                            <p className="text-xs text-gray-400">{msg.subject}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">
                            {new Date(msg.createdAt).toLocaleDateString("es-ES")}
                          </span>
                          {expandedMsg === msg.id ? (
                            <ChevronUp size={14} className="text-gray-400" />
                          ) : (
                            <ChevronDown size={14} className="text-gray-400" />
                          )}
                        </div>
                      </div>
                      {expandedMsg === msg.id && (
                        <div className="mt-3 pt-3 border-t" style={{ borderColor: "#1e2433" }}>
                          <p className="text-sm text-gray-300 whitespace-pre-wrap">{msg.message}</p>
                          <a
                            href={`mailto:${msg.email}?subject=Re: ${msg.subject}`}
                            className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                            style={{ backgroundColor: "oklch(0.55 0.22 260)" }}
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Mail size={12} />
                            Responder por email
                          </a>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── LEGAL ── */}
          {tab === "legal" && (
            <div className="space-y-4">
              <h2 className="text-lg font-semibold text-white">Páginas legales</h2>
              {editingLegal ? (
                <div
                  className="rounded-xl border p-5 space-y-4"
                  style={{ backgroundColor: "#131720", borderColor: "#1e2433" }}
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-white">
                      Editando:{" "}
                      <span className="text-blue-400">{editingLegal}</span>
                    </h3>
                    <button
                      onClick={() => setEditingLegal(null)}
                      className="text-xs text-gray-400 hover:text-white"
                    >
                      Cancelar
                    </button>
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">Título</label>
                    <input
                      type="text"
                      value={legalTitle}
                      onChange={(e) => setLegalTitle(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg text-sm border bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
                      style={{ borderColor: "#1e2433", color: "#e2e8f0", backgroundColor: "#0f1117" }}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-400 block mb-1">
                      Contenido (HTML o texto)
                    </label>
                    <textarea
                      value={legalContent}
                      onChange={(e) => setLegalContent(e.target.value)}
                      rows={16}
                      className="w-full px-3 py-2 rounded-lg text-sm border bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono resize-y"
                      style={{ borderColor: "#1e2433", color: "#e2e8f0", backgroundColor: "#0f1117" }}
                    />
                  </div>
                  <button
                    onClick={() =>
                      saveLegalMut.mutate({
                        slug: editingLegal,
                        title: legalTitle,
                        content: legalContent,
                      })
                    }
                    disabled={saveLegalMut.isPending}
                    className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors"
                    style={{ backgroundColor: "oklch(0.55 0.22 260)" }}
                  >
                    {saveLegalMut.isPending ? "Guardando..." : "Guardar cambios"}
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { slug: "terms", title: "Términos de Uso y Contrato" },
                    { slug: "privacy", title: "Política de privacidad" },
                    { slug: "cookies", title: "Política de cookies" },
                    { slug: "legal", title: "Aviso legal" },
                    { slug: "refund", title: "Política de reembolso" },
                  ].map((page) => {
                    const existing = legalQ.data?.find((p) => p.slug === page.slug);
                    return (
                      <div
                        key={page.slug}
                        className="rounded-xl border p-4 flex items-center justify-between"
                        style={{ backgroundColor: "#131720", borderColor: "#1e2433" }}
                      >
                        <div>
                          <p className="text-sm font-medium text-white">{page.title}</p>
                          <p className="text-xs text-gray-400">
                            {existing
                              ? `Actualizado: ${new Date(existing.updatedAt).toLocaleDateString("es-ES")}`
                              : "Sin contenido"}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setEditingLegal(page.slug);
                            setLegalTitle(existing?.title ?? page.title);
                            setLegalContent(existing?.content ?? "");
                          }}
                          className="px-3 py-1.5 rounded-lg text-xs font-medium text-white transition-colors"
                          style={{ backgroundColor: "oklch(0.55 0.22 260)" }}
                        >
                          Editar
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── SETTINGS ── */}
          {tab === "settings" && (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold text-white">Ajustes del sitio</h2>

              {/* Site settings */}
              <div
                className="rounded-xl border p-5 space-y-4"
                style={{ backgroundColor: "#131720", borderColor: "#1e2433" }}
              >
                <p className="text-sm font-semibold text-white">Configuración del sitio</p>
                {settingsQ.isLoading ? (
                  <p className="text-gray-400 text-sm">Cargando...</p>
                ) : (
                  <div className="space-y-3">
                    {[
                      { key: "site_name", label: "Nombre del sitio", placeholder: brandName },
                      { key: "support_email", label: "Email de soporte", placeholder: "soporte@cloud-pdf.net" },
                      { key: "trial_price_eur", label: "Precio prueba 7 días (€)", placeholder: "0.99" },
                      { key: "monthly_price_eur", label: "Precio mensual (€)", placeholder: "9.99" },
                    ].map((setting) => {
                      const current =
                        settingsQ.data?.find((s) => s.key === setting.key)?.value ?? "";
                      return (
                        <SettingRow
                          key={setting.key}
                          label={setting.label}
                          defaultValue={current}
                          placeholder={setting.placeholder}
                          onSave={(value) =>
                            saveSettingMut.mutate({ key: setting.key, value })
                          }
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
          {!isFastDoc && tab === "blog" && <BlogAdmin />}
          {!isFastDoc && tab === "trustpilot" && <TrustpilotAdmin />}
        </main>
      </div>
    </div>
  );
}

// ─── SettingRow helper ────────────────────────────────────────
function SettingRow({
  label,
  defaultValue,
  placeholder,
  onSave,
}: {
  label: string;
  defaultValue: string;
  placeholder: string;
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    onSave(value);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="flex items-center gap-3">
      <label className="text-xs text-gray-400 w-44 flex-shrink-0">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setSaved(false);
        }}
        placeholder={placeholder}
        className="flex-1 px-3 py-2 rounded-lg text-sm border bg-transparent focus:outline-none focus:ring-1 focus:ring-blue-500"
        style={{ borderColor: "#1e2433", color: "#e2e8f0", backgroundColor: "#0f1117" }}
      />
      <button
        onClick={handleSave}
        className="px-3 py-2 rounded-lg text-xs font-medium text-white transition-colors flex-shrink-0"
        style={{ backgroundColor: saved ? "#10b981" : "oklch(0.55 0.22 260)" }}
      >
        {saved ? "✓ Guardado" : "Guardar"}
      </button>
    </div>
  );
}


