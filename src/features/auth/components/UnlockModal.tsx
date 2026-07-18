// src/features/auth/components/UnlockModal.tsx
import React, { useEffect, useState } from "react";
import { DynamicVaultDatabase } from "../../../core/storage/dexie-client"; // Sửa lại đường dẫn nếu khác

interface UnlockModalProps {
  onUnlock: (password: string) => Promise<boolean>;
  // Bổ sung Prop để nhận hàm vân tay từ Hook
  onBiometricUnlock?: (dbInstance: DynamicVaultDatabase) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({
  onUnlock,
  onBiometricUnlock, // Nhận hàm từ Component cha
  isLoading,
  error
}) => {
  const [password, setPassword] = useState("");
  const [hasBiometric, setHasBiometric] = useState(false);
  const [biometricDb, setBiometricDb] = useState<DynamicVaultDatabase | null>(null);

  // Xử lý kiểm tra vân tay mượt mà, không dính lỗi ESLint
  useEffect(() => {
    let isMounted = true;

    const checkBiometric = async () => {
      // 1. Đọc tên Két sắt đã lưu từ localStorage
      const savedDbName = localStorage.getItem("ZERO_VAULT_BIOMETRIC_DB");
      if (!savedDbName) return;

      try {
        // 2. Mở kết nối tạm tới Database đó để kiểm tra
        const tempDb = new DynamicVaultDatabase(savedDbName);
        await tempDb.open();
        const meta = await tempDb.meta.get("ZERO_VAULT_META");

        // 3. Nếu cấu hình vân tay hợp lệ -> Bật UI
        if (isMounted && meta && meta.biometricCredentialId) {
          setHasBiometric(true);
          setBiometricDb(tempDb); // Giữ lại connection để dùng khi click mở khóa
        } else {
          tempDb.close();
        }
      } catch (err) {
        console.warn("Chưa thể tải trạng thái sinh trắc học:", err);
      }
    };

    checkBiometric();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    const success = await onUnlock(password);
    if (success) setPassword("");
  };

  const handleBiometricClick = async () => {
    if (onBiometricUnlock && biometricDb) {
      await onBiometricUnlock(biometricDb);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">Zero-Knowledge Vault</h1>
          <p className="mt-1 text-sm text-slate-400">
            Nhập Master Password để giải mã bộ nhớ cục bộ
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Master Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu chính..."
              className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2.5 text-white transition-all focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
              autoFocus
            />
          </div>

          {error && (
            <div className="rounded-md border border-rose-900/50 bg-rose-950/30 p-3 text-xs text-rose-400">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isLoading || !password}
            className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 font-medium text-white transition-colors hover:bg-emerald-500 focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isLoading ? "Đang xử lý khóa mật mã..." : "Mở Khóa Két Sắt"}
          </button>
        </form>

        {/* Nút bấm Vân Tay đã được sửa lại an toàn */}
        {hasBiometric && (
          <div className="mt-4 border-t border-slate-800 pt-4">
            <button
              type="button"
              onClick={handleBiometricClick}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600/80 hover:bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white transition-all shadow-lg shadow-indigo-500/20 border border-indigo-500/30 disabled:opacity-50"
            >
              <span className="text-lg">👆</span> Mở khóa nhanh bằng Vân tay / FaceID
            </button>
          </div>
        )}
      </div>
    </div>
  );
};