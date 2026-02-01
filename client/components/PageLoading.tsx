import { Loader2 } from "lucide-react";

export function PageLoading(props: { label?: string }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 py-12 text-slate-700">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm font-medium">{props.label ?? "Chargement…"}</span>
      </div>
    </div>
  );
}
