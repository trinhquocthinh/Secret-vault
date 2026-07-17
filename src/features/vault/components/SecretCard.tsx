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
}

export const SecretCard: React.FC<SecretCardProps> = ({
  item,
  isCopyingId,
  countdown,
  onCopyPassword,
  onCopyOTP,
}) => {
  const [isCopyingLoading, setIsCopyingLoading] = useState(false);
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

      {/* Hành động Copy mật khẩu */}
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
      </div>
    </div>
  );
};
