"use client";

import { useState } from "react";
import { WhatsappWizard } from "@/components/settings/whatsapp-wizard";
import OmnichannelSettingsPage from "@/app/(app)/settings/omnichannel/page";
import { cn } from "@/lib/utils";

export function WhatsappSettingsView() {
  const [tab, setTab] = useState<"cloud" | "web">("cloud");

  return (
    <div className="space-y-6">
      <div className="flex border-b border-border">
        <button
          onClick={() => setTab("cloud")}
          className={cn(
            "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            tab === "cloud"
              ? "border-brand text-brand"
              : "border-transparent text-text-3 hover:text-foreground"
          )}
        >
          WhatsApp Cloud API (Meta Oficial)
        </button>
        <button
          onClick={() => setTab("web")}
          className={cn(
            "border-b-2 px-4 py-2.5 text-sm font-medium transition-colors",
            tab === "web"
              ? "border-brand text-brand"
              : "border-transparent text-text-3 hover:text-foreground"
          )}
        >
          WhatsApp Web (QR Multi-cuenta)
        </button>
      </div>

      {tab === "cloud" ? <WhatsappWizard /> : <OmnichannelSettingsPage />}
    </div>
  );
}
