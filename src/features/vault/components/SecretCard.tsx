// src/features/vault/components/SecretCard.tsx
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Edit2, MoreVertical, Trash2 } from "lucide-react";
import type { SecretItem } from "../hooks/useVault";
import { useLiveTOTP } from "../../totp/hooks/useLiveTOTP";

interface SecretCardProps {
  item: SecretItem;
  isCopyingId: string | null;
  countdown: number;
  onCopyPassword: (id: string) => Promise<void>;
  onCopyOTP: (otp: string) => Promise<void>;
  onEdit: (item: SecretItem) => void;
  onDelete: (item: SecretItem) => void;
}

export const SecretCard: React.FC<SecretCardProps> = ({
  item,
  isCopyingId,
  countdown,
  onCopyPassword,
  onCopyOTP,
  onEdit,
  onDelete,
}) => {
  const [isCopyingLoading, setIsCopyingLoading] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const isCurrentCopied = isCopyingId === item.id;
  const { otp, secondsLeft, progress } = useLiveTOTP(item.totpSecret);

  const handleCopyPass = async () => {
    setIsCopyingLoading(true);
    try {
      await onCopyPassword(item.id);
    } finally {
      setIsCopyingLoading(false);
    }
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className="group relative rounded-2xl border border-slate-800/80 bg-slate-900/40 p-5 backdrop-blur-md transition-colors hover:border-emerald-500/50 hover:bg-slate-800/50"
    >
      <div className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-br from-emerald-500/5 to-transparent opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="relative z-10 mb-4 flex items-start justify-between">
        <div className="min-w-0 flex-1 pr-4">
          <h3 className="truncate text-lg font-semibold text-slate-100">{item.title}</h3>
          <p className="mt-1 truncate font-mono text-sm text-slate-400">{item.username}</p>
        </div>

        <div className="relative">
          <button
            onClick={() => setShowMenu(!showMenu)}
            onBlur={() => setTimeout(() => setShowMenu(false), 200)}
            className="rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white"
          >
            <MoreVertical size={18} />
          </button>

          <AnimatePresence>
            {showMenu && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="absolute right-0 z-20 mt-2 w-36 overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl"
              >
                <button
                  onClick={() => onEdit(item)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-white/5 hover:text-emerald-400"
                >
                  <Edit2 size={14} /> Chỉnh sửa
                </button>
                <button
                  onClick={() => onDelete(item)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-rose-400 transition-colors hover:bg-rose-500/10"
                >
                  <Trash2 size={14} /> Xóa bản ghi
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="relative z-10 mt-6 flex items-center justify-between border-t border-slate-800/80 pt-4">
        <div className="flex items-center gap-3">
          {item.totpSecret ? (
            <div className="flex items-center gap-2">
              <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-400">
                2FA Active
              </span>
              <button
                onClick={() => onCopyOTP(otp)}
                title="Copy mã OTP"
                className="flex flex-col items-start"
              >
                <span className="font-mono text-lg tracking-widest text-slate-200">
                  {otp.slice(0, 3)} {otp.slice(3, 6)}
                </span>
                <div className="mt-0.5 h-1 w-16 overflow-hidden rounded-full bg-slate-800">
                  <div
                    className={`h-full transition-all duration-1000 ${
                      secondsLeft <= 5 ? "bg-rose-500" : "bg-emerald-500"
                    }`}
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </button>
            </div>
          ) : (
            <span className="font-mono text-sm text-slate-500">••••••••</span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {isCurrentCopied && (
            <span className="animate-pulse rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-1 font-mono text-xs text-emerald-400">
              Xóa sau {countdown}s
            </span>
          )}
          <button
            onClick={handleCopyPass}
            disabled={isCopyingLoading}
            title="Copy Password"
            className={`rounded-lg p-2 shadow-sm transition-all disabled:cursor-not-allowed disabled:opacity-50 ${
              isCurrentCopied
                ? "bg-emerald-500 text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.5)]"
                : "bg-slate-800 text-slate-300 hover:bg-emerald-500 hover:text-slate-950 hover:shadow-[0_0_10px_rgba(16,185,129,0.4)]"
            }`}
          >
            <Copy size={16} />
          </button>
        </div>
      </div>
    </motion.div>
  );
};
