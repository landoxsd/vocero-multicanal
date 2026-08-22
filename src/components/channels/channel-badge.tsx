import React from "react";
import {
  MessageSquare,
  Instagram,
  ShoppingBag,
  Facebook,
  Smartphone,
} from "lucide-react";

interface ChannelBadgeProps {
  platform?: "whatsapp" | "instagram" | "mercadolibre" | "facebook" | string | null;
  provider?: string | null;
  label?: string | null;
  size?: "sm" | "md";
  showLabel?: boolean;
}

export function ChannelBadge({
  platform = "whatsapp",
  provider,
  label,
  size = "sm",
  showLabel = true,
}: ChannelBadgeProps) {
  const isWaWeb = provider === "whatsapp_web";
  const iconSize = size === "sm" ? 12 : 14;

  switch (platform) {
    case "instagram":
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-full bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-orange-500/10 text-pink-600 dark:text-pink-400 border border-pink-500/20 ${
            size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
          }`}
          title="Instagram Direct"
        >
          <Instagram size={iconSize} className="text-pink-500 shrink-0" />
          {showLabel && <span>{label || "Instagram"}</span>}
        </span>
      );

    case "mercadolibre":
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20 ${
            size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
          }`}
          title="MercadoLibre"
        >
          <ShoppingBag size={iconSize} className="text-amber-500 shrink-0" />
          {showLabel && <span>{label || "MercadoLibre"}</span>}
        </span>
      );

    case "facebook":
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 ${
            size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
          }`}
          title="Facebook Messenger"
        >
          <Facebook size={iconSize} className="text-blue-500 shrink-0" />
          {showLabel && <span>{label || "Facebook"}</span>}
        </span>
      );

    case "whatsapp":
    default:
      return (
        <span
          className={`inline-flex items-center gap-1 font-medium rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 ${
            size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"
          }`}
          title={isWaWeb ? "WhatsApp Web" : "WhatsApp Cloud"}
        >
          {isWaWeb ? (
            <Smartphone size={iconSize} className="text-emerald-500 shrink-0" />
          ) : (
            <MessageSquare size={iconSize} className="text-emerald-500 shrink-0" />
          )}
          {showLabel && (
            <span>{label || (isWaWeb ? "WhatsApp Web" : "WhatsApp")}</span>
          )}
        </span>
      );
  }
}
