// src/features/vault/components/VaultDashboard.tsx
import React, { useState } from 'react';
import { useVault } from '../hooks/useVault';
import { useClipboardWiper } from '../hooks/useClipboardWiper';
import { useAutoLock } from '../../security/hooks/useAutoLock';
import { SecretCard } from './SecretCard';
import { UnlockModal } from '../../auth/components/UnlockModal';
import { QrScannerModal } from '../../totp/components/QrScannerModal';

export const VaultDashboard: React.FC = () => {
    const { isUnlocked, isLoading, error, secrets, unlockVault, lockVault, addSecret, getSecretPassword } = useVault();
    const { copiedId, countdown, copyAndWipe } = useClipboardWiper();

    // Tự động khóa app sau 5 phút không có thao tác chuột/bàn phím
    useAutoLock(lockVault, isUnlocked);

    // Form state thêm mật khẩu
    const [title, setTitle] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [totpSecret, setTotpSecret] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    // State điều khiển Modal Quét QR
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    const handleCopyPassword = async (id: string) => {
        // Giải mã lazy-load đúng mật khẩu của item này và đẩy vào Clipboard Wiper
        const plainPass = await getSecretPassword(id);
        await copyAndWipe(id, plainPass);
    };

    // Hàm xử lý copy mã OTP 6 số (chỉ copy, tự xóa sau 30s)
    const handleCopyOTP = async (otpCode: string) => {
        await copyAndWipe("OTP_CLIPBOARD", otpCode);
    };

    // 3. HÀM CALLBACK KHI QUÉT CAMERA THÀNH CÔNG
    const handleScanSuccess = (scannedSecret: string, accountLabel?: string) => {
        setTotpSecret(scannedSecret);
        if (accountLabel && !title) {
            setTitle(accountLabel);
        }
    };

    const handleAddSecret = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !password) return;
        setIsAdding(true);
        try {
            await addSecret({ title, username, password, totpSecret: totpSecret || undefined });
            setTitle('');
            setUsername('');
            setPassword('');
            setTotpSecret('');
        } finally {
            setIsAdding(false);
        }
    };

    if (!isUnlocked) {
        return <UnlockModal onUnlock={unlockVault} isLoading={isLoading} error={error} />;
    }

    return (
        <div className="min-h-screen pb-12 text-slate-100 bg-slate-950">
            {/* Navbar */}
            <header className="sticky top-0 z-10 border-b bg-slate-950/80 backdrop-blur-md border-slate-800">
                <div className="flex items-center justify-between max-w-4xl px-4 py-3 mx-auto">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="font-bold tracking-tight text-white">Zero-Knowledge Vault</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            AES-GCM 256 + TOTP
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-400">
                            Auto-lock: <strong className="text-slate-200">5 phút</strong>
                        </span>
                        <button
                            onClick={lockVault}
                            className="px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors bg-rose-950/40 border border-rose-800/60 rounded-md hover:bg-rose-900/50"
                        >
                            Khóa Ngay (Lock)
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-4xl px-4 mt-8 mx-auto space-y-8">
                {/* Form thêm bản ghi có tích hợp 2FA */}
                <div className="p-6 border rounded-xl bg-slate-900 border-slate-800">
                    <h2 className="mb-4 text-base font-semibold text-white">Thêm tài khoản & Mã 2FA mới</h2>
                    <form onSubmit={handleAddSecret} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <input
                                type="text"
                                placeholder="Tiêu đề (VD: GitHub, Bank)..."
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-emerald-500"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Username / Email..."
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-emerald-500"
                            />
                            <input
                                type="password"
                                placeholder="Mật khẩu..."
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-emerald-500"
                                required
                            />
                        </div>

                        {/* Hàng nhập Khóa 2FA + Nút bật Camera quét QR */}
                        <div className="flex gap-2">
                            <div className="relative flex-1">
                                <input
                                    type="text"
                                    placeholder="Khóa bí mật 2FA (Base32: JBSWY3D...) - Tùy chọn"
                                    value={totpSecret}
                                    onChange={(e) => setTotpSecret(e.target.value)}
                                    className="w-full pl-3.5 pr-24 py-2 text-sm font-mono bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-emerald-500 text-emerald-400 placeholder:font-sans placeholder:text-slate-600"
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsScannerOpen(true)}
                                    className="absolute right-1.5 top-1.5 px-2.5 py-1 text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 rounded border border-slate-700 transition-colors flex items-center gap-1"
                                >
                                    📷 Quét QR
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={isAdding}
                                className="px-6 py-2 text-sm font-medium text-white transition-colors rounded-lg bg-emerald-600 hover:bg-emerald-500 whitespace-nowrap disabled:opacity-50"
                            >
                                {isAdding ? "Đang lưu..." : "Mã Hóa & Lưu"}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Danh sách bản ghi */}
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold tracking-wider uppercase text-slate-400">
                        Danh sách đã lưu ({secrets.length})
                    </h2>
                    {secrets.length === 0 ? (
                        <div className="py-12 text-center border border-dashed rounded-xl border-slate-800 text-slate-500">
                            Chưa có mật khẩu nào trong Két sắt. Hãy thêm bản ghi đầu tiên ở trên!
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {secrets.map((item) => (
                                <SecretCard
                                    key={item.id}
                                    item={item}
                                    onCopyPassword={handleCopyPassword}
                                    onCopyOTP={handleCopyOTP}
                                    isCopyingId={copiedId}
                                    countdown={countdown}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* 4. RENDER MODAL QUÉT CAMERA (NẾU ĐANG MỞ) */}
            {isScannerOpen && (
                <QrScannerModal
                    onScanSuccess={handleScanSuccess}
                    onClose={() => setIsScannerOpen(false)}
                />
            )}
        </div>
    );
};