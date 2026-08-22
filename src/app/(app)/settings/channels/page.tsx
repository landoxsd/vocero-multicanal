"use client";

import { useEffect, useState } from "react";
import {
  Smartphone,
  Instagram,
  ShoppingBag,
  Facebook,
  Plus,
  Trash2,
  RefreshCw,
  QrCode,
  CheckCircle2,
  AlertCircle,
  X,
  ExternalLink,
} from "lucide-react";
import { ChannelBadge } from "@/components/channels/channel-badge";

interface Channel {
  id: string;
  provider:
    | "whatsapp_web"
    | "whatsapp_cloud"
    | "instagram"
    | "mercadolibre"
    | "facebook_messenger";
  name: string;
  status: "connected" | "connecting" | "scan_qr" | "disconnected" | "error";
  phoneNumber?: string | null;
  accountIdentifier?: string | null;
  qrCode?: string | null;
  errorMessage?: string | null;
  lastConnectedAt?: string | null;
  createdAt: string;
}

export default function ChannelsSettingsPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeModal, setActiveModal] = useState<
    "whatsapp_web" | "instagram" | "mercadolibre" | "facebook" | null
  >(null);

  // Form state
  const [channelName, setChannelName] = useState("");
  const [sessionName, setSessionName] = useState("");
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [creating, setCreating] = useState(false);

  // Cargar canales
  const loadChannels = async () => {
    try {
      const res = await fetch("/api/channels");
      if (res.ok) {
        const data = await res.json();
        setChannels(data.channels || []);
      }
    } catch (e) {
      console.error("Error al cargar canales:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadChannels();
  }, []);

  // Polling para actualizar QR y estado si hay un modal de WhatsApp Web abierto
  useEffect(() => {
    if (!activeChannel || activeChannel.status === "connected") return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/channels/${activeChannel.id}`);
        if (res.ok) {
          const data = await res.json();
          if (data.channel) {
            setActiveChannel(data.channel);
            setChannels((prev) =>
              prev.map((c) => (c.id === data.channel.id ? data.channel : c))
            );
            if (data.channel.status === "connected") {
              clearInterval(interval);
            }
          }
        }
      } catch (err) {
        console.error("Error consultando estado de canal:", err);
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [activeChannel]);

  // Crear canal de WhatsApp Web
  const handleCreateWhatsAppWeb = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!channelName.trim()) return;

    setCreating(true);
    try {
      const sId = sessionName.trim() || `session_${Date.now()}`;
      const res = await fetch("/api/channels", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: "whatsapp_web",
          name: channelName.trim(),
          accountIdentifier: sId,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setActiveChannel(data.channel);
        setChannels((prev) => [...prev, data.channel]);
      }
    } catch (err) {
      console.error("Error creando canal:", err);
    } finally {
      setCreating(false);
    }
  };

  // Eliminar canal
  const handleDeleteChannel = async (id: string) => {
    if (!confirm("¿Seguro que deseas desconectar y eliminar este canal?")) return;
    try {
      const res = await fetch(`/api/channels/${id}`, { method: "DELETE" });
      if (res.ok) {
        setChannels((prev) => prev.filter((c) => c.id !== id));
        if (activeChannel?.id === id) {
          setActiveChannel(null);
          setActiveModal(null);
        }
      }
    } catch (err) {
      console.error("Error eliminando canal:", err);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h3 className="text-lg font-medium">Canales e Integraciones Omnicanal</h3>
        <p className="text-sm text-muted-foreground">
          Conecta múltiples cuentas de WhatsApp Web, Instagram Direct, MercadoLibre y
          Facebook para centralizar todos los mensajes en tu CRM.
        </p>
      </div>

      {/* Tarjetas para conectar nuevos canales */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* WhatsApp Web */}
        <div className="flex flex-col justify-between rounded-xl border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Smartphone size={20} />
            </div>
            <h4 className="font-semibold text-sm">WhatsApp Web</h4>
            <p className="text-xs text-muted-foreground">
              Conecta números físicos escaneando código QR (motor multi-sesión con LocalAuth).
            </p>
          </div>
          <button
            onClick={() => {
              setChannelName("");
              setSessionName("");
              setActiveChannel(null);
              setActiveModal("whatsapp_web");
            }}
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-medium text-white hover:bg-emerald-700 transition"
          >
            <Plus size={14} /> Añadir WhatsApp
          </button>
        </div>

        {/* Instagram Direct */}
        <div className="flex flex-col justify-between rounded-xl border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-pink-500/10 text-pink-600 dark:text-pink-400">
              <Instagram size={20} />
            </div>
            <h4 className="font-semibold text-sm">Instagram Direct</h4>
            <p className="text-xs text-muted-foreground">
              Recibe y responde DMs, fotos y respuestas a historias de tu cuenta de Instagram.
            </p>
          </div>
          <button
            onClick={() => setActiveModal("instagram")}
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-pink-600 px-3 py-2 text-xs font-medium text-white hover:opacity-90 transition"
          >
            <Plus size={14} /> Conectar Instagram
          </button>
        </div>

        {/* MercadoLibre */}
        <div className="flex flex-col justify-between rounded-xl border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <ShoppingBag size={20} />
            </div>
            <h4 className="font-semibold text-sm">MercadoLibre</h4>
            <p className="text-xs text-muted-foreground">
              Responde preguntas de publicaciones pre-venta y mensajes de compradores post-venta.
            </p>
          </div>
          <button
            onClick={() => setActiveModal("mercadolibre")}
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white hover:bg-amber-600 transition"
          >
            <Plus size={14} /> Vincular MeLi
          </button>
        </div>

        {/* Facebook Messenger */}
        <div className="flex flex-col justify-between rounded-xl border bg-card p-5 shadow-sm">
          <div className="space-y-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
              <Facebook size={20} />
            </div>
            <h4 className="font-semibold text-sm">Facebook Marketplace</h4>
            <p className="text-xs text-muted-foreground">
              Atiende prospectos de Marketplace y mensajes de tus páginas comerciales.
            </p>
          </div>
          <button
            onClick={() => setActiveModal("facebook")}
            className="mt-4 inline-flex items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white hover:bg-blue-700 transition"
          >
            <Plus size={14} /> Conectar Facebook
          </button>
        </div>
      </div>

      {/* Lista de Canales Conectados */}
      <div className="rounded-xl border bg-card overflow-hidden shadow-sm">
        <div className="border-b px-5 py-4 flex items-center justify-between">
          <h4 className="font-medium text-sm">Cuentas y Líneas Conectadas</h4>
          <button
            onClick={loadChannels}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Actualizar
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            Cargando canales...
          </div>
        ) : channels.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            No tienes canales conectados aún. Selecciona uno de los servicios arriba para
            comenzar.
          </div>
        ) : (
          <div className="divide-y">
            {channels.map((ch) => (
              <div
                key={ch.id}
                className="flex items-center justify-between px-5 py-4 hover:bg-muted/30 transition"
              >
                <div className="flex items-center gap-3">
                  <ChannelBadge
                    provider={ch.provider}
                    platform={
                      ch.provider.startsWith("whatsapp")
                        ? "whatsapp"
                        : ch.provider === "instagram"
                        ? "instagram"
                        : ch.provider === "mercadolibre"
                        ? "mercadolibre"
                        : "facebook"
                    }
                    label={ch.name}
                    size="md"
                  />
                  <div className="text-xs text-muted-foreground">
                    ID: <code className="text-[11px] font-mono">{ch.accountIdentifier || ch.id}</code>
                    {ch.phoneNumber && <span className="ml-2">({ch.phoneNumber})</span>}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Estado */}
                  {ch.status === "connected" ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-500/10 px-2 py-0.5 rounded-full">
                      <CheckCircle2 size={12} /> Conectado
                    </span>
                  ) : ch.status === "scan_qr" ? (
                    <button
                      onClick={() => {
                        setActiveChannel(ch);
                        setActiveModal("whatsapp_web");
                      }}
                      className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-500/10 px-2 py-0.5 rounded-full hover:bg-amber-500/20 transition"
                    >
                      <QrCode size={12} /> Escanear QR
                    </button>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-rose-600 bg-rose-500/10 px-2 py-0.5 rounded-full">
                      <AlertCircle size={12} /> Desconectado
                    </span>
                  )}

                  {/* Eliminar */}
                  <button
                    onClick={() => handleDeleteChannel(ch.id)}
                    className="p-1.5 text-muted-foreground hover:text-rose-600 rounded-md hover:bg-rose-500/10 transition"
                    title="Desconectar y eliminar"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal WhatsApp Web (Escaneo de QR) */}
      {activeModal === "whatsapp_web" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl relative animate-in fade-in zoom-in-95">
            <button
              onClick={() => {
                setActiveModal(null);
                setActiveChannel(null);
              }}
              className="absolute right-4 top-4 text-muted-foreground hover:text-foreground"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-2 text-emerald-600 font-semibold mb-4">
              <Smartphone size={20} />
              <h4>Vincular WhatsApp Web</h4>
            </div>

            {!activeChannel ? (
              <form onSubmit={handleCreateWhatsAppWeb} className="space-y-4">
                <p className="text-xs text-muted-foreground">
                  Ingresa un nombre para identificar esta línea (ej. &quot;Ventas Línea 1&quot;, &quot;Soporte&quot;).
                </p>
                <div>
                  <label className="block text-xs font-medium mb-1">Nombre del Canal</label>
                  <input
                    type="text"
                    required
                    placeholder="Ej. WhatsApp Ventas Caracas"
                    value={channelName}
                    onChange={(e) => setChannelName(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Identificador de Sesión (Opcional)
                  </label>
                  <input
                    type="text"
                    placeholder="Ej. linea-1"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                  />
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveModal(null)}
                    className="rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={creating}
                    className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {creating ? "Generando QR..." : "Generar Código QR"}
                  </button>
                </div>
              </form>
            ) : (
              <div className="text-center space-y-4">
                <div className="text-xs text-muted-foreground">
                  Abre WhatsApp en tu teléfono $\rightarrow$ Dispositivos vinculados $\rightarrow$ Vincular un dispositivo y escanea este código:
                </div>

                {activeChannel.status === "connected" ? (
                  <div className="py-8 space-y-2">
                    <CheckCircle2 size={48} className="mx-auto text-emerald-500 animate-bounce" />
                    <h5 className="font-semibold text-emerald-600">¡WhatsApp Vinculado con Éxito!</h5>
                    <p className="text-xs text-muted-foreground">
                      Tu línea ya está activa y lista para enviar y recibir mensajes.
                    </p>
                    <button
                      onClick={() => {
                        setActiveModal(null);
                        setActiveChannel(null);
                      }}
                      className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-medium text-white hover:bg-emerald-700"
                    >
                      Cerrar y Ver Bandeja
                    </button>
                  </div>
                ) : activeChannel.qrCode ? (
                  <div className="flex flex-col items-center justify-center p-4 bg-white rounded-xl border inline-block mx-auto shadow-inner">
                    {/* Renderizado de código QR */}
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(
                        activeChannel.qrCode
                      )}`}
                      alt="Código QR WhatsApp"
                      className="w-56 h-56"
                    />
                    <span className="text-[10px] text-gray-500 mt-2 font-mono flex items-center gap-1">
                      <RefreshCw size={10} className="animate-spin text-emerald-600" /> Esperando escaneo...
                    </span>
                  </div>
                ) : (
                  <div className="py-12 text-center text-xs text-muted-foreground flex flex-col items-center gap-2">
                    <RefreshCw size={24} className="animate-spin text-emerald-600" />
                    Generando sesión y código QR seguro...
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modales informativos para Instagram, MeLi, FB */}
      {activeModal === "instagram" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl relative">
            <button onClick={() => setActiveModal(null)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 text-pink-600 font-semibold mb-3">
              <Instagram size={20} />
              <h4>Conectar Instagram Direct</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Para vincular tu cuenta comercial de Instagram a Vocero CRM, ingresa tu Page Access Token de Meta Graph API.
            </p>
            <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1 mb-4">
              <div className="font-medium text-foreground">Webhook Endpoint para Meta:</div>
              <code className="block font-mono text-[11px] bg-background p-2 rounded border break-all select-all">
                {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/instagram` : "/api/webhooks/instagram"}
              </code>
            </div>
            <button onClick={() => setActiveModal(null)} className="w-full rounded-lg bg-pink-600 py-2 text-xs font-medium text-white hover:bg-pink-700">
              Entendido
            </button>
          </div>
        </div>
      )}

      {activeModal === "mercadolibre" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl relative">
            <button onClick={() => setActiveModal(null)} className="absolute right-4 top-4 text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
            <div className="flex items-center gap-2 text-amber-600 font-semibold mb-3">
              <ShoppingBag size={20} />
              <h4>Vincular Cuenta de MercadoLibre</h4>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Puedes vincular **múltiples cuentas de MercadoLibre** (Tienda 1, Tienda 2, etc.) para centralizar preguntas pre-venta y mensajes post-venta en el CRM.
            </p>

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const form = e.currentTarget;
                const name = (form.elements.namedItem("meliName") as HTMLInputElement).value;
                const sellerId = (form.elements.namedItem("meliSellerId") as HTMLInputElement).value;
                const token = (form.elements.namedItem("meliToken") as HTMLInputElement).value;

                try {
                  const res = await fetch("/api/channels", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      provider: "mercadolibre",
                      name: name.trim(),
                      accountIdentifier: sellerId.trim(),
                      metadata: {
                        sellerId: sellerId.trim(),
                        accessToken: token.trim(),
                      },
                    }),
                  });
                  if (res.ok) {
                    const data = await res.json();
                    setChannels((prev) => [...prev, data.channel]);
                    setActiveModal(null);
                  }
                } catch (err) {
                  console.error("Error guardando cuenta MercadoLibre:", err);
                }
              }}
              className="space-y-3"
            >
              <div>
                <label className="block text-xs font-medium mb-1">Nombre de la Cuenta / Tienda</label>
                <input
                  name="meliName"
                  required
                  placeholder="Ej. MercadoLibre Tienda Principal"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">User ID / Seller ID (ID de Vendedor MeLi)</label>
                <input
                  name="meliSellerId"
                  required
                  placeholder="Ej. 123456789"
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium mb-1">Access Token de MercadoLibre</label>
                <input
                  name="meliToken"
                  required
                  type="password"
                  placeholder="APP_USR-..."
                  className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono"
                />
              </div>

              <div className="rounded-lg bg-muted/50 p-3 text-xs space-y-1 mt-2">
                <div className="font-medium text-foreground">Webhook de Notificaciones para MeLi Devs:</div>
                <code className="block font-mono text-[10px] bg-background p-2 rounded border break-all select-all">
                  {typeof window !== "undefined" ? `${window.location.origin}/api/webhooks/mercadolibre` : "/api/webhooks/mercadolibre"}
                </code>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setActiveModal(null)}
                  className="rounded-lg border px-4 py-2 text-xs font-medium hover:bg-muted"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="rounded-lg bg-amber-500 px-4 py-2 text-xs font-medium text-white hover:bg-amber-600"
                >
                  Guardar Cuenta MeLi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
