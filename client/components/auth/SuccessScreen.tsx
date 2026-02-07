import { CheckCircle2 } from "lucide-react";
import { useEffect } from "react";

interface SuccessScreenProps {
  onComplete: () => void;
  autoCloseDelay?: number;
  title?: string;
  subtitle?: string;
}

export function SuccessScreen({
  onComplete,
  autoCloseDelay = 1500,
  title,
  subtitle,
}: SuccessScreenProps) {

  useEffect(() => {
    const timer = setTimeout(onComplete, autoCloseDelay);
    return () => clearTimeout(timer);
  }, [onComplete, autoCloseDelay]);

  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {/* Success animation */}
      <div className="relative mb-6">
        <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center animate-pulse">
          <CheckCircle2 className="w-10 h-10 text-green-600" />
        </div>
        {/* Celebration particles */}
        <div className="absolute -top-2 -left-2 text-2xl animate-bounce" style={{ animationDelay: "0ms" }}>
          🎉
        </div>
        <div className="absolute -top-2 -right-2 text-2xl animate-bounce" style={{ animationDelay: "200ms" }}>
          ✨
        </div>
        <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-2xl animate-bounce" style={{ animationDelay: "400ms" }}>
          🎊
        </div>
      </div>

      {/* Title */}
      <h2
        className="text-2xl font-bold text-slate-900 mb-2"
        style={{ fontFamily: "Circular Std, sans-serif" }}
      >
        {title || "Bienvenue !"}
      </h2>

      {/* Subtitle */}
      <p className="text-slate-600">
        {subtitle || "Votre compte a été créé avec succès"}
      </p>
    </div>
  );
}
