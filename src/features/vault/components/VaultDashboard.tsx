// src/features/vault/components/VaultDashboard.tsx
import React, { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useVault } from "../hooks/useVault";
import { SecretCard } from "./SecretCard";
import { SyncButton } from "./SyncButton";
import { useClipboardWiper } from "../hooks/useClipboardWiper";
import { useAutoLock } from "../../security/hooks/useAutoLock";
import { UnlockModal } from "../../auth/components/UnlockModal";
import { QrScannerModal } from "../../totp/components/QrScannerModal";
import { useVaultSync } from '../hooks/useVaultSync';
import { ChangePasswordForm } from "./ChangePasswordForm";


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
        skippedRecordCount,
        changePassword,
        unlockWithBiometric
    } = useVault();
    const { copiedId, countdown, copyAndWipe } = useClipboardWiper({
        onFirstCopyWarning: (msg) => {
            // Bạn có thể dùng thư viện toast (như react-toastify, sonner) hoặc dùng browser alert:
            alert(msg);
            // Hoặc nếu có toast: toast.warning(msg, { duration: 6000 });
        }
    });

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

    const [searchQuery, setSearchQuery] = useState("");

    // 2. ENGINE LỌC GẠN RECORD CHỐNG FREEZE (Tối ưu hóa bằng useMemo)
    const filteredSecrets = useMemo(() => {
        // Nếu secrets chưa được tải xong hoặc rỗng, trả về mảng trống ngay
        if (!secrets || secrets.length === 0) return [];

        const query = searchQuery.trim().toLowerCase();

        // TRƯỜNG HỢP KHÔNG GÕ GÌ: Trả về toàn bộ danh sách gốc lập tức
        if (!query) return secrets;

        return secrets.filter((secret) => {
            // Ép kiểu về chuỗi an toàn bằng Fallback || "" để chống lỗi undefined/null
            const title = (secret.title || "").toLowerCase();
            const username = (secret.username || "").toLowerCase();

            // Kiểm tra khớp từ khóa
            const titleMatch = title.includes(query);
            const usernameMatch = username.includes(query);

            return titleMatch || usernameMatch;
        });
    }, [secrets, searchQuery]);

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
        return <UnlockModal onUnlock={unlockVault} onBiometricUnlock={unlockWithBiometric} isLoading={isLoading} error={error} />;
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
                <ChangePasswordForm
                    changePassword={changePassword}
                    isLoading={isLoading}
                    vaultError={error}
                />
                {skippedRecordCount > 0 && (
                    <div className="rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
                        ⚠️ Có {skippedRecordCount} bản ghi không thể giải mã (có thể do Mật khẩu Master
                        không khớp với Khóa đã dùng để mã hóa các bản ghi này). Kiểm tra Console (F12) để
                        biết chi tiết, hoặc thử đăng nhập lại.
                    </div>
                )}

                {/* 3. COMPONENT SEARCH BAR (THIẾT KẾ GLASSMORPHISM SANG TRỌNG) */}
                <div className="relative rounded-xl border border-slate-800/60 bg-slate-900/20 p-1 backdrop-blur-md focus-within:border-emerald-500/50 transition-all max-w-xl">
                    <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4 text-slate-500">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    </div>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Tìm kiếm nhanh tài khoản, email hoặc dịch vụ..."
                        className="w-full rounded-lg bg-transparent py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none"
                    />
                    {searchQuery && (
                        <button
                            onClick={() => setSearchQuery("")}
                            className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-500 hover:text-slate-300 text-xs transition-colors"
                        >
                            Xóa lọc
                        </button>
                    )}
                </div>


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
                    {filteredSecrets.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-slate-800 p-12 text-center text-sm text-slate-600">
                            📭 Không tìm thấy mật khẩu nào khớp với từ khóa của bạn.
                        </div>
                    ) : (
                        // ĐIỂM CHẠM SENIOR: Bọc danh sách bằng motion.div và AnimatePresence
                        <motion.div
                            layout // Cưỡng chế kích hoạt thuật toán FLIP để các card tự trượt trơn tru sang vị trí mới
                            className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
                        >
                            <AnimatePresence mode="popLayout">
                                {filteredSecrets.map((secret) => (
                                    <motion.div
                                        key={secret.id} // Rất quan trọng: key tĩnh không đổi để Framer Motion nhận diện
                                        layout // Trượt mượt khi vị trí vật lý thay đổi
                                        initial={{ opacity: 0, scale: 0.92 }}
                                        animate={{ opacity: 1, scale: 1 }}
                                        exit={{ opacity: 0, scale: 0.85, transition: { duration: 0.15 } }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 320,
                                            damping: 30,
                                            mass: 0.8
                                        }}
                                        className="origin-center"
                                    >
                                        <SecretCard
                                            item={secret}
                                            onCopyPassword={handleCopyPassword}
                                            onCopyOTP={handleCopyOTP}
                                            countdown={countdown}
                                            onUpdate={handleUpdateSecret}
                                            onDelete={handleDeleteSecret}
                                            onGetPassword={getSecretPassword}
                                            isCopyingId={copiedId} />
                                    </motion.div>
                                ))}
                            </AnimatePresence>
                        </motion.div>
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
