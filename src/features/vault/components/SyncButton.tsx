import React from "react";

interface SyncButtonProps {
    onSync: () => Promise<void>;
    isSyncing: boolean;
    status: string;
    error: string | null;
}

export const SyncButton: React.FC<SyncButtonProps> = ({ onSync, isSyncing, status, error }) => {
    return (
        <div className="flex items-center gap-3">
            <div className="flex flex-col items-end">
                <span className="text-xs font-medium text-slate-300">{status}</span>
                {error && <span className="text-[10px] text-rose-400 max-w-[200px] truncate">{error}</span>}
            </div>

            <button
                onClick={onSync}
                disabled={isSyncing}
                className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold text-white transition-all bg-indigo-600 hover:bg-indigo-500 rounded-lg border border-indigo-500/50 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
                title="Đồng bộ hóa E2EE với Google Drive (appDataFolder)"
            >
                <svg
                    className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin" : ""}`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                >
                    <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                    />
                </svg>
                {isSyncing ? "Đang đồng bộ..." : "☁️ Google Drive Sync"}
            </button>
        </div>
    );
};