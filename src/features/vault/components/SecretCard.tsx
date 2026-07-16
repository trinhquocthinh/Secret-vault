// src/features/vault/components/SecretCard.tsx
import React, { useState } from 'react';
import type { SecretItem } from '../hooks/useVault';

interface SecretCardProps {
    item: SecretItem;
    onCopyPassword: (id: string) => Promise<void>;
    isCopyingId: string | null;
    countdown: number;
}

export const SecretCard: React.FC<SecretCardProps> = ({
    item,
    onCopyPassword,
    isCopyingId,
    countdown,
}) => {
    const [isCopyingLoading, setIsCopyingLoading] = useState(false);
    const isCurrentCopied = isCopyingId === item.id;

    const handleCopy = async () => {
        setIsCopyingLoading(true);
        try {
            await onCopyPassword(item.id);
        } finally {
            setIsCopyingLoading(false);
        }
    };

    return (
        <div className="flex items-center justify-between p-4 transition-all border rounded-lg bg-slate-900 border-slate-800 hover:border-slate-700">
            <div className="flex flex-col">
                <h3 className="font-semibold text-slate-100">{item.title}</h3>
                <p className="text-sm font-mono text-slate-400">{item.username}</p>
                <div className="flex items-center gap-2 mt-2">
                    <span className="text-xs tracking-widest text-slate-500">••••••••••••</span>
                </div>
            </div>

            <div className="flex items-center gap-3">
                {isCurrentCopied && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 rounded-full animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Xóa sau {countdown}s
                    </span>
                )}

                <button
                    onClick={handleCopy}
                    disabled={isCopyingLoading}
                    className="px-3 py-1.5 text-sm font-medium transition-colors rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                    {isCopyingLoading ? "Đang giải mã..." : isCurrentCopied ? "Đã Copy!" : "Copy Pass"}
                </button>
            </div>
        </div>
    );
};