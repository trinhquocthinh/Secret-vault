// src/features/vault/components/VaultDashboard.tsx
import React, { useCallback, useState } from "react";
import { useVault } from "../hooks/useVault";
import { SecretCard } from "./SecretCard";
import { SyncButton } from "./SyncButton";
import { useClipboardWiper } from "../hooks/useClipboardWiper";
import { useAutoLock } from "../../security/hooks/useAutoLock";
import { UnlockModal } from "../../auth/components/UnlockModal";
import { QrScannerModal } from "../../totp/components/QrScannerModal";
import { useVaultSync } from '../hooks/useVaultSync';


export const VaultDashboard: React.FC = () => {
    const {
        isUnlocked,
        isLoading,
        error,
        secrets,
        unlockVault,
        lockVault,
        addSecret,
        updateSecret,
        deleteSecret,
        getSecretPassword,
        activeDb,
        vaultId,
        refreshVault,
        skippedRecordCount
    } = useVault();
    const { copiedId, countdown, copyAndWipe } = useClipboardWiper();

    // Tự động khóa app sau 5 phút không có thao tác chuột/bàn phím
    useAutoLock(lockVault, isUnlocked);

    // Form state thêm mật khẩu
    const [title, setTitle] = useState("");
    const [username, setUsername] = useState("");
    const [password, setPassword] = useState("");
    const [totpSecret, setTotpSecret] = useState("");
    const [isAdding, setIsAdding] = useState(false);

    // State điều khiển Modal Quét QR
    const [isScannerOpen, setIsScannerOpen] = useState(false);

    // Khi tải data mới từ Google Drive về, ta cần unlockVault lại bằng chính key đang có trong RAM để làm mới UI
    const handleSyncSuccess = useCallback(async () => {
        // Luồng fetchAndDecryptVault đã tự động cập nhật State bên trong useVault
        await refreshVault();
        console.log("Đã gộp dữ liệu từ Cloud thành công!");
    }, [refreshVault]);

    const { isSyncing, syncStatus, error: syncError, triggerSync } = useVaultSync(
        activeDb,
        vaultId,
        handleSyncSuccess,
        lockVault
    );

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
            setTitle("");
            setUsername("");
            setPassword("");
            setTotpSecret("");
            // Tự động kích hoạt đồng bộ ngầm sau khi thêm mật khẩu mới (như 1Password).
            // interactive=false: đây KHÔNG phải kết quả trực tiếp của 1 cú click chuột (đã đi qua
            // await addSecret), nên nếu chưa có access token sẵn, không được mở popup xin quyền
            // (trình duyệt sẽ chặn). Người dùng cần bấm nút Sync thủ công cho lần đăng nhập đầu.
            triggerSync({ interactive: false });
        } finally {
            setIsAdding(false);
        }
    };

    // Cập nhật record: updateSecret() đã tự sinh IV mới + cập nhật updatedAt bên trong useVault.
    // Sau khi lưu xong, kích hoạt đồng bộ ngầm để đẩy bản mới nhất lên Cloud ngay lập tức.
    const handleUpdateSecret = async (id: string, updatedItem: { title: string; username: string; password?: string; totpSecret?: string }) => {
        await updateSecret(id, updatedItem);
        triggerSync({ interactive: false });
    };

    // Xóa record: deleteSecret() chỉ đánh dấu Tombstone (isDeleted=true), không Hard Delete,
    // để tránh Bẫy "Khôi Phục Ma" khi thiết bị khác sync ngược lại. Đồng bộ ngầm ngay để lan
    // truyền cờ xóa lên Cloud sớm nhất có thể.
    const handleDeleteSecret = async (id: string) => {
        await deleteSecret(id);
        triggerSync({ interactive: false });
    };

    if (!isUnlocked) {
        return <UnlockModal onUnlock={unlockVault} isLoading={isLoading} error={error} />;
    }

    return (
        <div className="min-h-screen bg-slate-950 pb-12 text-slate-100">
            {/* Navbar */}
            <header className="sticky top-0 z-10 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md">
                <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500"></span>
                        <span className="font-bold tracking-tight text-white">Zero-Knowledge Vault</span>
                        <span className="rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400">
                            AES-GCM 256 + TOTP
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-400">
                            Auto-lock: <strong className="text-slate-200">5 phút</strong>
                        </span>

                        <SyncButton
                            onSync={triggerSync}
                            isSyncing={isSyncing}
                            status={syncStatus}
                            error={syncError}
                        />

                        <div className="h-4 w-px bg-slate-800"></div>

                        <button
                            onClick={lockVault}
                            className="rounded-md border border-rose-800/60 bg-rose-950/40 px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors hover:bg-rose-900/50"
                        >
                            Khóa Ngay (Lock)
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="mx-auto mt-8 max-w-4xl space-y-8 px-4">
                {skippedRecordCount > 0 && (
                    <div className="rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
                        ⚠️ Có {skippedRecordCount} bản ghi không thể giải mã (có thể do Mật khẩu Master
                        không khớp với Khóa đã dùng để mã hóa các bản ghi này). Kiểm tra Console (F12) để
                        biết chi tiết, hoặc thử đăng nhập lại.
                    </div>
                )}
                {/* Form thêm bản ghi có tích hợp 2FA */}
                <div className="rounded-xl border border-slate-800 bg-slate-900 p-6">
                    <h2 className="mb-4 text-base font-semibold text-white">Thêm tài khoản & Mã 2FA mới</h2>
                    <form onSubmit={handleAddSecret} className="space-y-4">
                        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                            <input
                                type="text"
                                placeholder="Tiêu đề (VD: GitHub, Bank)..."
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                                required
                            />
                            <input
                                type="text"
                                placeholder="Username / Email..."
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                className="rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
                            />
                            <input
                                type="password"
                                placeholder="Mật khẩu..."
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="rounded-lg border border-slate-800 bg-slate-950 px-3.5 py-2 text-sm focus:border-emerald-500 focus:outline-none"
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
                                    className="w-full rounded-lg border border-slate-800 bg-slate-950 py-2 pr-24 pl-3.5 font-mono text-sm text-emerald-400 placeholder:font-sans placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                                />
                                <button
                                    type="button"
                                    onClick={() => setIsScannerOpen(true)}
                                    className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded border border-slate-700 bg-slate-800 px-2.5 py-1 text-xs font-semibold text-slate-200 transition-colors hover:bg-slate-700"
                                >
                                    📷 Quét QR
                                </button>
                            </div>

                            <button
                                type="submit"
                                disabled={isAdding}
                                className="rounded-lg bg-emerald-600 px-6 py-2 text-sm font-medium whitespace-nowrap text-white transition-colors hover:bg-emerald-500 disabled:opacity-50"
                            >
                                {isAdding ? "Đang lưu..." : "Mã Hóa & Lưu"}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Danh sách bản ghi */}
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold tracking-wider text-slate-400 uppercase">
                        Danh sách đã lưu ({secrets.length})
                    </h2>
                    {secrets.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-800 py-12 text-center text-slate-500">
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
                                    onGetPassword={getSecretPassword}
                                    onUpdate={handleUpdateSecret}
                                    onDelete={handleDeleteSecret}
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
                <QrScannerModal onScanSuccess={handleScanSuccess} onClose={() => setIsScannerOpen(false)} />
            )}
        </div>
    );
};
