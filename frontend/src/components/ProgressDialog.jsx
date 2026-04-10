import { Loader2, CheckCircle, XCircle } from "lucide-react";

export default function ProgressDialog({ progress }) {
  if (!progress) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-nfs-card border border-nfs-border rounded-2xl p-8 w-full max-w-xs shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        <div className="flex flex-col items-center text-center gap-4">
          {progress.status === "loading" && (
            <div className="p-4 rounded-full bg-nfs-primary/10">
              <Loader2 className="w-8 h-8 text-nfs-primary animate-spin" />
            </div>
          )}
          {progress.status === "success" && (
            <div className="p-4 rounded-full bg-emerald-500/10">
              <CheckCircle className="w-8 h-8 text-emerald-400" />
            </div>
          )}
          {progress.status === "error" && (
            <div className="p-4 rounded-full bg-red-500/10">
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
          )}
          <div>
            <p className="text-white font-semibold text-sm">
              {progress.message}
            </p>
            {progress.detail && (
              <p className="text-xs text-nfs-muted mt-1.5">{progress.detail}</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
