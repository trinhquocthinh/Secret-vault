/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useCallback, useMemo } from "react";
import { GoogleDriveClient } from "../../../core/storage/google-drive-client";
import { VaultSyncEngine } from "../../../core/storage/vault-sync-engine";
import type { DynamicVaultDatabase } from "../../../core/storage/dexie-client";

// LƯU Ý: Thay bằng Client ID từ Google Cloud Console của bạn
const GOOGLE_CLIENT_ID = "636154949520-8ffg88qdp24ovotn369f9csbc1n0vtag.apps.googleusercontent.com";

export function useVaultSync(
  db: DynamicVaultDatabase | null,
  vaultId: string | null,
  onSyncSuccess: () => void,
  onRequireReLogin: () => void,
) {
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<string>("Chưa đồng bộ");
  const [error, setError] = useState<string | null>(null);

  const driveClient = useMemo(() => new GoogleDriveClient(GOOGLE_CLIENT_ID), []);

  /**
   * Kích hoạt luồng Đồng Bộ Hóa Đa Chiều (Pull & Push)
   *
   * @param options.interactive Có phải lệnh gọi này xuất phát trực tiếp từ thao tác click của
   *   người dùng hay không (vd: bấm nút Sync = true; auto-sync ngầm sau khi thêm secret = false).
   *   Khi `false` và chưa có access token sẵn, ta bỏ qua việc mở popup xin quyền (tránh bị trình
   *   duyệt chặn) và chỉ âm thầm dừng đồng bộ, không hiển thị lỗi giật mình cho người dùng.
   */
  const triggerSync = useCallback(async (options: { interactive?: boolean } = {}) => {
    const { interactive = true } = options;
    if (!db || !vaultId) return setError("Két sắt chưa được mở.");
    setIsSyncing(true);
    setError(null);
    setSyncStatus("Đang kết nối đám mây...");

    try {
      await driveClient.initClient();
      await driveClient.authenticate({ interactive }); // interactive=false => chỉ silent, không mở popup

      const remoteData = await driveClient.downloadBackup();
      if (remoteData) {
        const result = await VaultSyncEngine.mergeAndSave(db, remoteData, vaultId);

        // Xử lý Đăng nhập lại
        if (result.requireRelogin) {
          alert(
            "Đồng bộ thiết bị mới thành công! \n\nHệ thống đã đồng bộ Khóa bảo mật (Salt) từ đám mây. Vui lòng đăng nhập lại để làm mới phiên bản mã hóa.",
          );
          onRequireReLogin(); // Gọi hàm khóa UI
          return; // DỪNG NGAY luồng Push (không upload lên lại) vì RAM đang giữ sai Key
        } else {
          onSyncSuccess();
        }
      }

      setSyncStatus("Đang sao lưu lên đám mây...");
      const mergedPayload = await VaultSyncEngine.exportVault(db, vaultId);
      await driveClient.uploadBackup(mergedPayload);
      setSyncStatus(`Đồng bộ thành công lúc ${new Date().toLocaleTimeString("vi-VN")}`);
    } catch (err: any) {
      // Auto-sync ngầm (interactive=false) không có token sẵn: bỏ qua êm ái, không báo lỗi giật mình.
      if (err?.code === "AUTH_REQUIRED" && !interactive) {
        setSyncStatus("Chưa đồng bộ (nhấn nút Sync để đăng nhập Google Drive)");
      } else {
        setError(err.message || "Đồng bộ hóa thất bại.");
        setSyncStatus("Đồng bộ lỗi");
      }
    } finally {
      setIsSyncing(false);
    }
  }, [db, vaultId, driveClient, onSyncSuccess, onRequireReLogin]);

  return {
    isSyncing,
    syncStatus,
    error,
    triggerSync,
  };
}
