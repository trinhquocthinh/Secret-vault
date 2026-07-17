// src/features/vault/components/SecretCard.tsx
import React, { useState } from "react";
import type { SecretItem } from "../hooks/useVault";
import { useLiveTOTP } from "../../totp/hooks/useLiveTOTP";

interface SecretCardProps {
  item: SecretItem;
  isCopyingId: string | null;
  countdown: number;
  onCopyPassword: (id: string) => Promise<void>;
  onCopyOTP: (otp: string) => Promise<void>;
  onGetPassword: (id: string) => Promise<string>;
  onUpdate: (id: string, updatedItem: Omit<SecretItem, "id">) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export const SecretCard: React.FC<SecretCardProps> = ({
  item,
  isCopyingId,
  countdown,
  onCopyPassword,
  onCopyOTP,
  onGetPassword,
  onUpdate,
  onDelete,
}) => {
  const [isCopyingLoading, setIsCopyingLoading] = useState(false);
  const isCurrentCopied = isCopyingId === item.id;
  const { otp, secondsLeft, progress } = useLiveTOTP(item.totpSecret);

  // State điều khiển chế độ chỉnh sửa (Edit) inline
  const [isEditing, setIsEditing] = useState(false);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [editTitle, setEditTitle] = useState(item.title);
  const [editUsername, setEditUsername] = useState(item.username);
  const [editPassword, setEditPassword] = useState("");
  const [editTotpSecret, setEditTotpSecret] = useState(item.totpSecret || "");

  const handleCopyPass = async () => {
    setIsCopyingLoading(true);
    try {
      await onCopyPassword(item.id);
    } finally {
      setIsCopyingLoading(false);
    }
  };

  // Mở form chỉnh sửa: giải mã lazy-load mật khẩu hiện tại để prefill vào ô input
  const handleStartEdit = async () => {
    setIsLoadingEdit(true);
    try {
      const currentPassword = await onGetPassword(item.id);
      setEditTitle(item.title);
      setEditUsername(item.username);
      setEditPassword(currentPassword);
      setEditTotpSecret(item.totpSecret || "");
      setIsEditing(true);
    } catch (e) {
      console.error("Không thể tải mật khẩu để chỉnh sửa:", e);
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditPassword("");
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle || !editPassword) return;
    setIsSaving(true);
    try {
      // Mỗi lần Update, updateSecret() sẽ tự sinh IV mới + cập nhật updatedAt bên trong
      await onUpdate(item.id, {
        title: editTitle,
        username: editUsername,
        password: editPassword,
        totpSecret: editTotpSecret || undefined,
      });
      setIsEditing(false);
      setEditPassword("");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa "${item.title}"? Hành động này sẽ được đồng bộ tới tất cả thiết bị.`)) {
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(item.id);
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing) {
    return (
      <div className="rounded-lg border border-emerald-800/60 bg-slate-900 p-4">
        <form onSubmit={handleSaveEdit} className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <input
              type="text"
              placeholder="Tiêu đề..."
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              required
            />
            <input
              type="text"
              placeholder="Username / Email..."
              value={editUsername}
              onChange={(e) => setEditUsername(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            />
            <input
              type="password"
              placeholder="Mật khẩu mới..."
              value={editPassword}
              onChange={(e) => setEditPassword(e.target.value)}
              className="rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              required
            />
          </div>
          <input
            type="text"
            placeholder="Khóa bí mật 2FA (Base32) - Tùy chọn"
            value={editTotpSecret}
            onChange={(e) => setEditTotpSecret(e.target.value)}
            className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 font-mono text-sm text-emerald-400 placeholder:font-sans placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancelEdit}
              className="rounded-md border border-slate-700 px-4 py-1.5 text-sm text-slate-300 transition-colors hover:bg-slate-800"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
            >
              {isSaving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-start justify-between gap-4 rounded-lg border border-slate-800 bg-slate-900 p-4 transition-all hover:border-slate-700 md:flex-row md:items-center">
      {/* Thông tin tài khoản */}
      <div className="flex flex-col">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold text-slate-100">{item.title}</h3>
          {item.totpSecret && (
            <span className="rounded border border-emerald-800 bg-emerald-950 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
              2FA ACTIVE
            </span>
          )}
        </div>
        <p className="font-mono text-sm text-slate-400">{item.username}</p>
      </div>

      {/* 3. KHU VỰC HIỂN THỊ MÃ OTP 6 CHỮ SỐ & TIẾN TRÌNH 30S */}
      {item.totpSecret && (
        <div className="flex items-center gap-3 rounded-lg border border-slate-800/80 bg-slate-950/80 px-3 py-2">
          <div className="flex flex-col items-center">
            <span className="animate-pulse font-mono text-lg font-extrabold tracking-wider text-emerald-400">
              {otp.slice(0, 3)} {otp.slice(3, 6)}
            </span>
            {/* Thanh tiến trình vòng đời OTP */}
            <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full transition-all duration-1000 ${
                  secondsLeft <= 5 ? "bg-rose-500" : "bg-emerald-500"
                }`}
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>

          <button
            onClick={() => onCopyOTP(otp)}
            title="Copy mã OTP"
            className="rounded bg-slate-800 p-1.5 text-xs text-slate-400 transition-colors hover:bg-slate-700 hover:text-white"
          >
            📋 {secondsLeft}s
          </button>
        </div>
      )}

      {/* Hành động Copy mật khẩu / Sửa / Xóa */}
      <div className="flex items-center gap-3 self-end md:self-center">
        {isCurrentCopied && (
          <span className="flex animate-pulse items-center gap-1.5 rounded-full border border-emerald-800/50 bg-emerald-950/50 px-2.5 py-1 text-xs font-medium text-emerald-400">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
            Xóa sau {countdown}s
          </span>
        )}

        <button
          onClick={handleCopyPass}
          disabled={isCopyingLoading}
          className="rounded-md bg-slate-800 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white focus:outline-none"
        >
          {isCopyingLoading ? "Đang giải mã..." : isCurrentCopied ? "Đã Copy Pass!" : "Copy Pass"}
        </button>

        <button
          onClick={handleStartEdit}
          disabled={isLoadingEdit}
          className="rounded-md border border-slate-700 bg-slate-800/60 px-3 py-1.5 text-sm font-medium text-slate-200 transition-colors hover:bg-slate-700 hover:text-white focus:outline-none disabled:opacity-50"
        >
          {isLoadingEdit ? "Đang tải..." : "✏️ Sửa"}
        </button>

        <button
          onClick={handleDelete}
          disabled={isDeleting}
          className="rounded-md border border-rose-800/60 bg-rose-950/40 px-3 py-1.5 text-sm font-medium text-rose-300 transition-colors hover:bg-rose-900/50 focus:outline-none disabled:opacity-50"
        >
          {isDeleting ? "Đang xóa..." : "🗑️ Xóa"}
        </button>
      </div>
    </div>
  );
};
