/* eslint-disable @typescript-eslint/no-explicit-any */
import React, { useState } from "react";

interface ChangePasswordFormProps {
    changePassword: (oldPass: string, newPass: string) => Promise<boolean>;
    isLoading: boolean;
    vaultError: string | null;
}

export const ChangePasswordForm: React.FC<ChangePasswordFormProps> = ({
    changePassword,
    isLoading,
    vaultError,
}) => {
    const [oldPassword, setOldPassword] = useState("");
    const [newPassword, setNewPassword] = useState("");
    const [localError, setLocalError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalError(null);
        setSuccessMessage(null);

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
                setSuccessMessage("🎉 Đổi mật khẩu Master và xoay vòng khóa dữ liệu (Atomic Migration) thành công!");
                setOldPassword("");
                setNewPassword("");
            }
        } catch (err: any) {
            setLocalError(err.message || "Có lỗi xảy ra trong quá trình đổi mật khẩu.");
        }
    };

    return (
        <div className="mb-6 rounded-lg border border-slate-800/80 bg-slate-900/40 p-4 backdrop-blur-md transition-all hover:border-slate-700/60">
            <h3 className="mb-3 text-sm font-semibold text-slate-200 flex items-center gap-2">
                🔑 Hệ thống Luân chuyển Khóa (Master Key Rotation Tool)
            </h3>

            <form onSubmit={handleSubmit} className="flex flex-wrap items-end gap-3">
                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-400">Mật khẩu cũ</label>
                    <input
                        type="password"
                        placeholder="Nhập mật khẩu Master cũ..."
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        disabled={isLoading}
                        className="rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none w-64 disabled:opacity-50"
                        required
                    />
                </div>

                <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-medium text-slate-400">Mật khẩu mới</label>
                    <input
                        type="password"
                        placeholder="Nhập mật khẩu Master mới..."
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={isLoading}
                        className="rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-1.5 text-sm text-slate-100 placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none w-64 disabled:opacity-50"
                        required
                    />
                </div>

                <button
                    type="submit"
                    disabled={isLoading}
                    className="rounded-lg bg-emerald-600 px-5 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 focus:outline-none disabled:opacity-50 h-[38px] flex items-center justify-center min-w-[130px]"
                >
                    {isLoading ? (
                        <span className="flex items-center gap-2">
                            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"></span>
                            Đang Re-encrypt...
                        </span>
                    ) : (
                        "Xoay Vòng Khóa"
                    )}
                </button>
            </form>

            {/* Tầng hiển thị thông báo lỗi hoặc thành công */}
            {(localError || vaultError) && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 rounded bg-rose-950/30 border border-rose-900/40 px-2.5 py-1 text-xs text-rose-400 font-medium">
                    ❌ {localError || vaultError}
                </div>
            )}

            {successMessage && (
                <div className="mt-2.5 inline-flex items-center gap-1.5 rounded bg-emerald-950/30 border border-emerald-900/40 px-2.5 py-1 text-xs text-emerald-400 font-medium">
                    {successMessage}
                </div>
            )}
        </div>
    );
};