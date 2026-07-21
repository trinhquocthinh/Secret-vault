import React from "react";
import { RefreshCw } from "lucide-react";

interface SyncButtonProps {
  onSync: () => Promise<void>;
  isSyncing: boolean;
  status: string;
  error: string | null;
}

export const SyncButton: React.FC<SyncButtonProps> = ({ onSync, isSyncing, status, error }) => {
  return (
    <div className="flex items-center gap-3">
      <div className="hidden flex-col items-end md:flex">
        <span className="text-xs font-medium text-slate-400">{status}</span>
        {error && <span className="max-w-[200px] truncate text-[10px] text-rose-400">{error}</span>}
      </div>

      <button
        onClick={onSync}
        disabled={isSyncing}
        title="Đồng bộ hóa E2EE với Google Drive (appDataFolder)"
        className={`flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 transition-all hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50 ${
          isSyncing
            ? "bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.4)]"
            : "shadow-[0_0_10px_rgba(16,185,129,0.1)]"
        }`}
      >
        <RefreshCw size={16} className={isSyncing ? "animate-spin" : ""} />
        <span className="hidden md:inline">{isSyncing ? "Đang đồng bộ..." : "Đồng bộ Drive"}</span>
      </button>
    </div>
  );
};
