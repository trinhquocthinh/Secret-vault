// src/features/auth/components/UnlockModal.tsx
import React, { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Fingerprint, KeyRound, ShieldCheck } from "lucide-react";
import { DynamicVaultDatabase } from "../../../core/storage/dexie-client";
import { useBiometric } from "../hooks/useBiometric";

interface UnlockModalProps {
  onUnlock: (password: string) => Promise<boolean>;
  onBiometricUnlock?: (dbInstance: DynamicVaultDatabase) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({
  onUnlock,
  onBiometricUnlock,
  isLoading: isParentLoading,
  error: parentError,
}) => {
  const [password, setPassword] = useState("");
  const [biometricDb, setBiometricDb] = useState<DynamicVaultDatabase | null>(null);

  // Sử dụng Hook useBiometric
  const {
    hasBiometric,
    isLoading: isBioLoading,
    error: bioError,
    checkBiometricStatus,
    verifyBiometric,
  } = useBiometric();

  useEffect(() => {
    // Tự động tải connection DB khi mount
    const initDb = async () => {
      const db = await checkBiometricStatus();
      if (db) setBiometricDb(db);
    };
    initDb();
  }, [checkBiometricStatus]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    const success = await onUnlock(password);
    if (success) setPassword("");
  };

  const handleBiometricClick = async () => {
    if (!biometricDb) return;

    // 1. Xác thực qua hệ điều hành (TouchID/FaceID)
    const isVerified = await verifyBiometric(biometricDb);

    // 2. Nếu quét thành công, gọi callback mở két từ Component cha
    if (isVerified && onBiometricUnlock) {
      await onBiometricUnlock(biometricDb);
    }
  };

  const isLoading = isParentLoading || isBioLoading;
  const displayError = parentError || bioError;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0a0a0a] p-4">
      <div className="pointer-events-none absolute top-1/2 left-1/2 h-150 w-150 -translate-x-1/2 -translate-y-1/2 rounded-full bg-emerald-500/10 blur-[120px]" />

      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        className="relative z-10 w-full max-w-md rounded-3xl border border-slate-800/80 bg-slate-900/60 p-8 shadow-[0_0_40px_rgba(16,185,129,0.1)] backdrop-blur-xl"
      >
        <div className="mb-8 flex flex-col items-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_20px_rgba(16,185,129,0.4)]">
            <ShieldCheck size={32} className="text-slate-950" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">Vùng bảo mật</h1>
          <p className="mt-2 text-center text-sm text-slate-400">
            Lưu trữ mật mã học cấp quân sự. Không ai ngoài bạn có thể đọc được dữ liệu này.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4">
              <KeyRound size={18} className="text-slate-500" />
            </div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu chủ..."
              autoFocus
              className="w-full rounded-xl border border-slate-700 bg-slate-950/50 py-3.5 pr-4 pl-12 text-white transition-all placeholder:text-slate-600 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none"
            />
          </div>

          {displayError && (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-400">
              {displayError}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 py-3.5 font-semibold text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all hover:from-emerald-400 hover:to-emerald-500 hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Đang xử lý khóa mật mã..." : "Giải mã Két sắt"}
          </button>
        </form>

        {/* Nút bấm tự động hiện lên khi hasBiometric = true */}
        {hasBiometric && (
          <div className="mt-6 border-t border-slate-800 pt-6">
            <button
              type="button"
              onClick={handleBiometricClick}
              disabled={isLoading}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-500/30 bg-transparent py-3 font-medium text-emerald-400 shadow-[0_0_15px_rgba(16,185,129,0.1)] transition-all hover:bg-emerald-500/10 hover:shadow-[0_0_20px_rgba(16,185,129,0.2)] active:scale-[0.98] disabled:opacity-50"
            >
              <Fingerprint size={20} className={isBioLoading ? "animate-pulse" : ""} />
              {isBioLoading ? "Đang chờ xác thực..." : "Mở khóa bằng Vân tay / FaceID"}
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
};
