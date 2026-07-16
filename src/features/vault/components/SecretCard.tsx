// src/features/vault/components/SecretCard.tsx
import React, { useState } from 'react';
import type { SecretItem } from '../hooks/useVault';
import { useLiveTOTP } from '../../totp/hooks/useLiveTOTP'

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
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between p-4 transition-all border rounded-lg bg-slate-900 border-slate-800 hover:border-slate-700 gap-4">
            {/* Thông tin tài khoản */}
            <div className="flex flex-col">
                <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-100">{item.title}</h3>
                    {item.totpSecret && (
                        <span className="px-1.5 py-0.5 text-[10px] font-bold bg-emerald-950 text-emerald-400 border border-emerald-800 rounded">
                            2FA ACTIVE
                        </span>
                    )}
                </div>
                <p className="text-sm font-mono text-slate-400">{item.username}</p>
            </div>

            {/* 3. KHU VỰC HIỂN THỊ MÃ OTP 6 CHỮ SỐ & TIẾN TRÌNH 30S */}
            {item.totpSecret && (
                <div className="flex items-center gap-3 bg-slate-950/80 px-3 py-2 rounded-lg border border-slate-800/80">
                    <div className="flex flex-col items-center">
                        <span className="font-mono text-lg font-extrabold tracking-wider text-emerald-400 animate-pulse">
                            {otp.slice(0, 3)} {otp.slice(3, 6)}
                        </span>
                        {/* Thanh tiến trình vòng đời OTP */}
                        <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden mt-1">
                            <div
                                className={`h-full transition-all duration-1000 ${secondsLeft <= 5 ? 'bg-rose-500' : 'bg-emerald-500'
                                    }`}
                                style={{ width: `${progress}%` }}
                            ></div>
                        </div>
                    </div>

                    <button
                        onClick={() => onCopyOTP(otp)}
                        title="Copy mã OTP"
                        className="p-1.5 text-xs text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded transition-colors"
                    >
                        📋 {secondsLeft}s
                    </button>
                </div>
            )}

            {/* Hành động Copy mật khẩu */}
            <div className="flex items-center gap-3 self-end md:self-center">
                {isCurrentCopied && (
                    <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium text-emerald-400 bg-emerald-950/50 border border-emerald-800/50 rounded-full animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Xóa sau {countdown}s
                    </span>
                )}

                <button
                    onClick={handleCopyPass}
                    disabled={isCopyingLoading}
                    className="px-3 py-1.5 text-sm font-medium transition-colors rounded-md bg-slate-800 text-slate-200 hover:bg-slate-700 hover:text-white focus:outline-none"
                >
                    {isCopyingLoading ? "Đang giải mã..." : isCurrentCopied ? "Đã Copy Pass!" : "Copy Pass"}
                </button>
            </div>
        </div>
    );
};