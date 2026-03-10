// =============================================================================
// AMBASSADOR REWARD QR DIALOG
// Shows QR code + claim code for a consumer ambassador reward
// =============================================================================

import { useState } from "react";
import { X, Gift, Copy, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { generateQRCode } from "@/lib/qrcode";

// =============================================================================
// Types
// =============================================================================

interface AmbassadorRewardQRDialogProps {
  open: boolean;
  onClose: () => void;
  reward: {
    claim_code: string;
    qr_reward_token: string;
    establishment_name: string;
    reward_description: string;
    expires_at: string;
    status: "active" | "claimed" | "expired";
  };
}

// =============================================================================
// COMPONENT
// =============================================================================

export function AmbassadorRewardQRDialog({
  open,
  onClose,
  reward,
}: AmbassadorRewardQRDialogProps) {
  const [copied, setCopied] = useState(false);

  if (!open) return null;

  const qrUrl = generateQRCode(
    `SAM:reward|token=${reward.qr_reward_token}`,
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(reward.claim_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: noop
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative max-w-sm w-full mx-4 bg-white rounded-2xl p-6 shadow-xl">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 transition-colors"
        >
          <X className="w-5 h-5 text-slate-500" />
        </button>

        <div className="flex flex-col items-center text-center space-y-4">
          {/* Header */}
          <div className="w-12 h-12 rounded-full bg-[#b30013]/10 flex items-center justify-center">
            <Gift className="w-6 h-6 text-[#b30013]" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Votre récompense</h3>

          {/* Establishment name */}
          <p className="text-sm text-slate-600">{reward.establishment_name}</p>

          {/* QR Code */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl">
            <img
              src={qrUrl}
              alt="QR Code récompense ambassadeur"
              width={300}
              height={300}
              className="w-[300px] h-[300px]"
            />
          </div>

          {/* Claim code */}
          <div className="w-full bg-slate-100 rounded-xl px-4 py-3">
            <p className="font-mono text-xl font-bold text-slate-900 tracking-wider">
              {reward.claim_code}
            </p>
          </div>

          {/* Copy button */}
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={handleCopy}
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                <span className="text-emerald-600">Copié !</span>
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copier le code
              </>
            )}
          </Button>

          {/* Reward description */}
          <p className="text-sm text-slate-700 font-medium">
            {reward.reward_description}
          </p>

          {/* Expiry / claimed info */}
          {reward.status === "claimed" ? (
            <p className="text-xs text-emerald-600 font-medium">
              Utilisée
            </p>
          ) : (
            <p className="text-xs text-slate-500">
              Expire le{" "}
              {new Date(reward.expires_at).toLocaleDateString("fr-FR", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
