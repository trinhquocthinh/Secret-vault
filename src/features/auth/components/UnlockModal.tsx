// src/features/auth/components/UnlockModal.tsx
import React, { useState } from "react";

interface UnlockModalProps {
  onUnlock: (password: string) => Promise<boolean>;
  isLoading: boolean;
  error: string | null;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({ onUnlock, isLoading, error }) => {
  const [password, setPassword] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password) return;
    const success = await onUnlock(password);
    if (success) setPassword(""); // Xóa RAM state ngay sau khi mở khóa thành công
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-800 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-6 text-center">
          <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400">
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
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
            {isLoading ? "Đang dẫn xuất khóa PBKDF2..." : "Mở Khóa Két Sắt"}
          </button>
        </form>
      </div>
    </div>
  );
};
