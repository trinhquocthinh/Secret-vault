// src/features/vault/components/VaultDashboard.tsx
import React, { useCallback, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertCircle,
  Fingerprint,
  Lock,
  LogOut,
  Plus,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  Timer,
  X,
} from "lucide-react";
import { useVault, type SecretItem } from "../hooks/useVault";
import { TotpEngine } from "../../../core/crypto/totp-engine";
import { SecretCard } from "./SecretCard";
import { SyncButton } from "./SyncButton";
import { useClipboardWiper } from "../hooks/useClipboardWiper";
import { useAutoLock } from "../../security/hooks/useAutoLock";
import { UnlockModal } from "../../auth/components/UnlockModal";
import { QrScannerModal } from "../../totp/components/QrScannerModal";
import { useVaultSync } from "../hooks/useVaultSync";
import { ChangePasswordForm } from "./ChangePasswordForm";
import { Modal } from "../../../shared/components/Modal";
import { ToastContainer } from "../../../shared/components/ToastContainer";
import { useToast } from "../../../shared/hooks/useToast";

type ModalKind = "add" | "edit" | "delete" | "changePassword" | null;

const formatTime = (secs: number) => {
  const m = Math.floor(secs / 60)
    .toString()
    .padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
};

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
    isBiometricEnrolled,
    enableBiometric,
    disableBiometric,
    unlockWithBiometric,
  } = useVault();

  const { toasts, showToast } = useToast();

  const { copiedId, countdown, copyAndWipe } = useClipboardWiper({
    onFirstCopyWarning: (msg) => showToast(msg, "info"),
  });

  // Tự động khóa app sau 5 phút không có thao tác chuột/bàn phím
  const { remainingSeconds } = useAutoLock(() => {
    lockVault();
    showToast("Két sắt đã tự động khóa do không hoạt động!", "info");
  }, isUnlocked);

  const [isBiometricBusy, setIsBiometricBusy] = useState(false);

  const handleToggleBiometric = async () => {
    setIsBiometricBusy(true);
    try {
      if (isBiometricEnrolled) {
        const { ok, message } = await disableBiometric();
        showToast(message, ok ? "success" : "error");
      } else {
        const { ok, message } = await enableBiometric();
        showToast(message, ok ? "success" : "error");
      }
    } finally {
      setIsBiometricBusy(false);
    }
  };

  // Modal điều khiển chung: Thêm / Sửa / Xóa / Đổi mật khẩu
  const [activeModal, setActiveModal] = useState<ModalKind>(null);
  const [selectedSecret, setSelectedSecret] = useState<SecretItem | null>(null);
  const [isLoadingEdit, setIsLoadingEdit] = useState(false);
  const [isSavingSecret, setIsSavingSecret] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Form state dùng chung cho cả Modal Thêm và Modal Sửa
  const [title, setTitle] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [totpSecret, setTotpSecret] = useState("");

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
      const t = (secret.title || "").toLowerCase();
      const u = (secret.username || "").toLowerCase();

      return t.includes(query) || u.includes(query);
    });
  }, [secrets, searchQuery]);

  // Khi tải data mới từ Google Drive về, ta cần unlockVault lại bằng chính key đang có trong RAM để làm mới UI
  const handleSyncSuccess = useCallback(async () => {
    // Luồng fetchAndDecryptVault đã tự động cập nhật State bên trong useVault
    await refreshVault();
    showToast("Đã đồng bộ an toàn với Google Drive", "success");
  }, [refreshVault, showToast]);

  const {
    isSyncing,
    syncStatus,
    error: syncError,
    triggerSync,
  } = useVaultSync(activeDb, vaultId, handleSyncSuccess, lockVault);

  const handleUnlock = async (pass: string) => {
    const success = await unlockVault(pass);
    if (success) showToast("Giải mã Két sắt thành công", "success");
    return success;
  };

  const handleCopyPassword = async (id: string) => {
    // Giải mã lazy-load đúng mật khẩu của item này và đẩy vào Clipboard Wiper
    const plainPass = await getSecretPassword(id);
    await copyAndWipe(id, plainPass);
    showToast("Đã copy mật khẩu! RAM sẽ tự xóa sau 30s", "success");
  };

  // Hàm xử lý copy mã OTP 6 số (chỉ copy, tự xóa sau 30s)
  const handleCopyOTP = async (otpCode: string) => {
    await copyAndWipe("OTP_CLIPBOARD", otpCode);
    showToast("Đã copy mã OTP! RAM sẽ tự xóa sau 30s", "success");
  };

  // 3. HÀM CALLBACK KHI QUÉT CAMERA THÀNH CÔNG
  const handleScanSuccess = (scannedSecret: string, accountLabel?: string) => {
    setTotpSecret(scannedSecret);
    if (accountLabel && !title) {
      setTitle(accountLabel);
    }
  };

  const resetForm = () => {
    setTitle("");
    setUsername("");
    setPassword("");
    setTotpSecret("");
    setSelectedSecret(null);
  };

  const openAddModal = () => {
    resetForm();
    setActiveModal("add");
  };

  // Mở Modal sửa: giải mã lazy-load mật khẩu hiện tại để prefill vào ô input
  const openEditModal = async (item: SecretItem) => {
    setIsLoadingEdit(true);
    try {
      const currentPassword = await getSecretPassword(item.id);
      setSelectedSecret(item);
      setTitle(item.title);
      setUsername(item.username);
      setPassword(currentPassword);
      setTotpSecret(item.totpSecret || "");
      setActiveModal("edit");
    } catch (e) {
      console.error("Không thể tải mật khẩu để chỉnh sửa:", e);
      showToast("Không thể tải mật khẩu để chỉnh sửa.", "error");
    } finally {
      setIsLoadingEdit(false);
    }
  };

  const openDeleteModal = (item: SecretItem) => {
    setSelectedSecret(item);
    setActiveModal("delete");
  };

  const closeModal = () => {
    setActiveModal(null);
    resetForm();
  };

  const handleSaveSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !password) return;

    const trimmedTotp = totpSecret.trim();
    if (trimmedTotp && !TotpEngine.isValidBase32Secret(trimmedTotp)) {
      showToast(
        "Khóa bí mật 2FA không hợp lệ. Chỉ chấp nhận ký tự Base32 (A-Z, 2-7), hãy kiểm tra lại.",
        "error",
      );
      return;
    }

    setIsSavingSecret(true);
    try {
      if (activeModal === "edit" && selectedSecret) {
        await updateSecret(selectedSecret.id, {
          title,
          username,
          password,
          totpSecret: trimmedTotp || undefined,
        });
        showToast("Đã cập nhật mật khẩu", "success");
      } else {
        await addSecret({ title, username, password, totpSecret: trimmedTotp || undefined });
        showToast("Đã thêm mật khẩu mới", "success");
      }
      // Tự động kích hoạt đồng bộ ngầm sau khi thêm/sửa mật khẩu (như 1Password).
      // interactive=false: nếu chưa có access token sẵn, không được mở popup xin quyền
      // (trình duyệt sẽ chặn). Người dùng cần bấm nút Sync thủ công cho lần đăng nhập đầu.
      triggerSync({ interactive: false });
      closeModal();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể lưu mật khẩu.", "error");
    } finally {
      setIsSavingSecret(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!selectedSecret) return;
    setIsDeleting(true);
    try {
      await deleteSecret(selectedSecret.id);
      triggerSync({ interactive: false });
      showToast("Đã xóa bản ghi vĩnh viễn", "success");
      closeModal();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Không thể xóa bản ghi.", "error");
    } finally {
      setIsDeleting(false);
    }
  };

  if (!isUnlocked) {
    return (
      <>
        <ToastContainer toasts={toasts} />
        <UnlockModal
          onUnlock={handleUnlock}
          onBiometricUnlock={unlockWithBiometric}
          isLoading={isLoading}
          error={error}
        />
      </>
    );
  }

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#0a0a0a] text-gray-200 selection:bg-emerald-500/30">
      <ToastContainer toasts={toasts} />

      {/* Background Lighting Effects */}
      <div className="pointer-events-none fixed top-[-10%] left-[-10%] h-[500px] w-[500px] rounded-full bg-emerald-600/10 blur-[150px]" />
      <div className="pointer-events-none fixed right-[-10%] bottom-[-10%] h-[600px] w-[600px] rounded-full bg-emerald-600/10 blur-[150px]" />

      {/* Header (Sticky) */}
      <header className="sticky top-0 z-40 border-b border-white/5 bg-[#0a0a0a]/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-full flex-wrap items-center justify-between gap-4 px-4 pt-4 md:px-8 lg:gap-0">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-[0_0_15px_rgba(16,185,129,0.4)]">
              <ShieldCheck size={24} className="text-slate-950" />
            </div>
            <h1 className="bg-gradient-to-r from-white to-gray-400 bg-clip-text text-xl font-bold text-transparent">
              Vùng bảo mật
            </h1>
            <span className="hidden rounded border border-slate-700 bg-slate-800 px-2 py-0.5 text-xs text-slate-400 md:inline">
              AES-GCM 256 + TOTP
            </span>
          </div>

          <div className="flex items-center gap-2 md:gap-4">
            {/* Auto-Lock Indicator */}
            <div className="mr-2 hidden items-center gap-2 rounded-lg border border-gray-800 bg-gray-900/50 px-3 py-1.5 font-mono text-xs text-gray-400 md:flex">
              <Timer
                size={14}
                className={remainingSeconds < 60 ? "animate-pulse text-rose-400" : "text-gray-500"}
              />
              <span className={remainingSeconds < 60 ? "text-rose-400" : ""}>
                {formatTime(remainingSeconds)}
              </span>
            </div>

            <button
              onClick={handleToggleBiometric}
              disabled={isBiometricBusy}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all disabled:opacity-50 ${
                isBiometricEnrolled
                  ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
                  : "border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
              }`}
              title={
                isBiometricEnrolled
                  ? "Tắt mở khóa bằng Vân tay/FaceID"
                  : "Bật mở khóa bằng Vân tay/FaceID"
              }
            >
              <Fingerprint size={16} className={isBiometricBusy ? "animate-pulse" : ""} />
              <span className="hidden md:inline">
                {isBiometricBusy
                  ? "Đang xử lý..."
                  : isBiometricEnrolled
                    ? "Vân tay: Bật"
                    : "Bật Vân tay/FaceID"}
              </span>
            </button>

            <button
              onClick={() => setActiveModal("changePassword")}
              className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-gray-300 transition-all hover:bg-white/10"
            >
              <Settings size={16} />
              <span className="hidden md:inline">Đổi Mật Khẩu</span>
            </button>

            <SyncButton
              onSync={() => triggerSync({ interactive: true })}
              isSyncing={isSyncing}
              status={syncStatus}
              error={syncError}
            />

            <button
              onClick={lockVault}
              className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-400 transition-all hover:bg-rose-500/20"
            >
              <LogOut size={16} />
              <span className="hidden md:inline">Khóa</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 mx-auto max-w-full px-4 py-8 md:px-8">
        {skippedRecordCount > 0 && (
          <div className="mb-6 flex items-start gap-2 rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-300">
            <AlertCircle size={18} className="mt-0.5 shrink-0" />
            <span>
              Có {skippedRecordCount} bản ghi không thể giải mã (có thể do Mật khẩu Master không
              khớp với Khóa đã dùng để mã hóa các bản ghi này). Kiểm tra Console (F12) để biết chi
              tiết, hoặc thử đăng nhập lại.
            </span>
          </div>
        )}

        {/* Actions Bar */}
        <div className="mb-8 flex flex-col items-stretch justify-between gap-4 md:flex-row md:items-center">
          <div className="group relative w-full md:flex-1">
            <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 opacity-0 blur transition-opacity duration-500 group-focus-within:opacity-20" />
            <div className="relative flex items-center">
              <div className="pointer-events-none absolute inset-y-0 left-0 z-10 flex items-center pl-4">
                <Search
                  size={20}
                  className="text-gray-400 transition-colors group-focus-within:text-emerald-400"
                />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm theo tiêu đề, tài khoản..."
                className="w-full rounded-xl border border-gray-800 bg-gray-900/50 py-3.5 pr-4 pl-12 text-white backdrop-blur-sm transition-all placeholder:text-gray-600 focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/50 focus:outline-none"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery("")}
                  className="absolute inset-y-0 right-0 z-10 flex items-center pr-4 text-xs text-gray-500 transition-colors hover:text-gray-300"
                >
                  Xóa lọc
                </button>
              )}
            </div>
          </div>

          <button
            onClick={openAddModal}
            className="flex w-full shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-3.5 font-bold text-slate-950 shadow-[0_0_15px_rgba(16,185,129,0.3)] transition-all hover:from-emerald-400 hover:to-emerald-500 hover:shadow-[0_0_25px_rgba(16,185,129,0.5)] active:scale-[0.98] md:w-auto"
          >
            <Plus size={20} />
            Thêm Mật khẩu
          </button>
        </div>

        <h2 className="mb-4 text-sm font-semibold tracking-wider text-slate-400 uppercase">
          Danh sách đã lưu ({secrets.length})
        </h2>

        {/* Grid Layout với Framer Motion */}
        <motion.div
          layout
          className="grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-6 lg:grid-cols-4"
        >
          <AnimatePresence mode="popLayout">
            {filteredSecrets.length > 0 ? (
              filteredSecrets.map((secret) => (
                <SecretCard
                  key={secret.id}
                  item={secret}
                  isCopyingId={copiedId}
                  countdown={countdown}
                  onCopyPassword={handleCopyPassword}
                  onCopyOTP={handleCopyOTP}
                  onEdit={openEditModal}
                  onDelete={openDeleteModal}
                />
              ))
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="col-span-full flex flex-col items-center justify-center py-20 text-gray-500"
              >
                <Lock size={48} className="mb-4 opacity-20" />
                <p>Không tìm thấy mật khẩu nào phù hợp.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </main>

      {/* --- MODALS OVERLAY --- */}
      <AnimatePresence>
        {activeModal === "add" || activeModal === "edit" ? (
          <Modal onClose={closeModal}>
            <form onSubmit={handleSaveSecret} className="flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
                <h3 className="text-lg font-bold text-white">
                  {activeModal === "edit" ? "Chỉnh sửa Mật khẩu" : "Thêm Mật khẩu Mới"}
                </h3>
                <button
                  type="button"
                  onClick={closeModal}
                  className="text-slate-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4 p-6">
                <input
                  type="text"
                  placeholder="Tiêu đề (VD: GitHub, Bank)..."
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  autoFocus
                  required
                />
                <input
                  type="text"
                  placeholder="Username / Email..."
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                />
                <input
                  type="password"
                  placeholder={activeModal === "edit" ? "Mật khẩu mới..." : "Mật khẩu..."}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3.5 py-2.5 text-sm focus:border-emerald-500 focus:outline-none"
                  required
                />

                <div className="relative">
                  <input
                    type="text"
                    placeholder="Khóa bí mật 2FA (Base32: JBSWY3D...) - Tùy chọn"
                    value={totpSecret}
                    onChange={(e) => setTotpSecret(e.target.value)}
                    className="w-full rounded-lg border border-slate-700 bg-slate-950 py-2.5 pr-14 pl-3.5 font-mono text-sm text-emerald-400 placeholder:font-sans placeholder:text-slate-600 focus:border-emerald-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    title="Quét mã QR"
                    className="absolute top-1.5 right-1.5 flex items-center justify-center rounded-md border border-slate-700 bg-slate-800 p-1.5 text-slate-200 transition-colors hover:bg-slate-700 hover:text-emerald-400"
                  >
                    <QrCode size={16} />
                  </button>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-800 bg-slate-900/50 px-6 py-4">
                <button
                  type="button"
                  onClick={closeModal}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSavingSecret || isLoadingEdit}
                  className="rounded-lg bg-gradient-to-r from-emerald-500 to-emerald-600 px-6 py-2 text-sm font-semibold text-slate-950 transition-all hover:from-emerald-400 hover:to-emerald-500 disabled:opacity-50"
                >
                  {isSavingSecret ? "Đang lưu..." : "Mã Hóa & Lưu"}
                </button>
              </div>
            </form>
          </Modal>
        ) : null}

        {activeModal === "delete" && selectedSecret ? (
          <Modal onClose={closeModal}>
            <div className="p-6 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/10">
                <AlertCircle size={32} className="text-rose-400" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-white">Xóa bản ghi này?</h3>
              <p className="mb-6 text-sm text-slate-400">
                Bạn có chắc chắn muốn xóa{" "}
                <strong className="text-slate-200">"{selectedSecret.title}"</strong>? Hành động này
                sẽ được đồng bộ tới tất cả thiết bị.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={closeModal}
                  className="rounded-lg border border-slate-700 px-4 py-2 text-sm text-slate-300 transition-colors hover:bg-slate-800"
                >
                  Hủy
                </button>
                <button
                  onClick={handleConfirmDelete}
                  disabled={isDeleting}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
                >
                  {isDeleting ? "Đang xóa..." : "Xóa vĩnh viễn"}
                </button>
              </div>
            </div>
          </Modal>
        ) : null}

        {activeModal === "changePassword" ? (
          <Modal onClose={closeModal}>
            <ChangePasswordForm
              changePassword={changePassword}
              isLoading={isLoading}
              vaultError={error}
              onClose={closeModal}
              onSuccess={(msg) => showToast(msg, "success")}
            />
          </Modal>
        ) : null}
      </AnimatePresence>

      {/* RENDER MODAL QUÉT CAMERA (NẾU ĐANG MỞ) */}
      {isScannerOpen && (
        <QrScannerModal onScanSuccess={handleScanSuccess} onClose={() => setIsScannerOpen(false)} />
      )}
    </div>
  );
};
