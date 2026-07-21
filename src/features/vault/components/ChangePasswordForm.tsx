/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";
import { KeyRound, X } from "lucide-react";

interface ChangePasswordFormProps {
  changePassword: (oldPass: string, newPass: string) => Promise<boolean>;
  isLoading: boolean;
  vaultError: string | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
}

export const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({
  changePassword,
  isLoading,
  vaultError,
  onClose,
  onSuccess,
}) => {
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);

    // Kiểm tra nhanh ở Client trước khi đẩy vào Core Crypto Pipeline
    if (!oldPassword || !newPassword) {
      setLocalError("Vui lòng điền đầy đủ cả mật khẩu cũ và mới.");
      return;
    }

    if (oldPassword === newPassword) {
      setLocalError("Mật khẩu mới không được trùng với mật khẩu Master hiện tại.");
      return;
    }

    try {
      // Gọi Hàm Xoay Vòng Khóa từ useVault hook
      const success = await changePassword(oldPassword, newPassword);
      if (success) {
        onSuccess("🎉 Đổi mật khẩu Master và xoay vòng khóa dữ liệu thành công!");
        setOldPassword("");
        setNewPassword("");
        onClose();
      }
    } catch (err: any) {
      setLocalError(err.message || "Có lỗi xảy ra trong quá trình đổi mật khẩu.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col">
      <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <h3 className="flex items-center gap-2 text-lg font-bold text-white">
          <KeyRound size={18} className="text-emerald-400" /> Đổi Mật Khẩu Master
        </h3>
        <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
          <X size={20} />
        </button>
      </div>

      <div className="space-y-4 p-6">
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">Mật khẩu cũ</label>
          <input
            type="password"
            placeholder="Nhập mật khẩu Master cũ..."
            value={oldPassword}
            onChange={(e) => setOldPassword(e.target.value)}
            disabled={isLoading}
            autoFocus
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
            required
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400">Mật khẩu mới</label>
          <input
            type="password"
            placeholder="Nhập mật khẩu Master mới..."
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={isLoading}
            className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
            required
          />
        </div>

        {(localError || vaultError) && (
          <div className="rounded-md border border-rose-900/40 bg-rose-950/30 px-3 py-2 text-xs font-medium text-rose-400">
            ❌ {localError || vaultError}
          </div>
        )}
      </div>

      <div className="flex justify-end gap-3 border-t border-slate-800 bg-slate-900/50 px-6 py-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
        >
          Hủy
        </button>
        <button
          type="submit"
          disabled={isLoading}
          className="flex min-w-[130px] items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2 text-sm font-semibold text-slate-950 transition-all hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50"
        >
          {isLoading ? (
            <>
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-950 border-t-transparent"></span>
              Đang Re-encrypt...
            </>
          ) : (
            "Xoay Vòng Khóa"
          )}
        </button>
      </div>
    </form>
  );
};
