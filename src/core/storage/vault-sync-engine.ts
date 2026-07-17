/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamicVaultDatabase, type VaultRecord, type VaultMeta } from "./dexie-client";
import type { SyncPayload } from "./google-drive-client";

export class VaultSyncEngine {
  /**
   * Chuyển ArrayBuffer nhị phân sang mảng số nguyên để lưu được trong file JSON
   */
  private static bufferToArray(buffer: ArrayBuffer | Uint8Array): number[] {
    return Array.from(new Uint8Array(buffer));
  }

  /**
   * Chuyển mảng số nguyên JSON về lại ArrayBuffer chuẩn Web Crypto
   */
  private static arrayToBuffer(arr: number[]): ArrayBuffer {
    return new Uint8Array(arr).buffer;
  }

  /**
   * Xuất toàn bộ dữ liệu Két sắt hiện tại ra SyncPayload
   */
  public static async exportVault(db: DynamicVaultDatabase, vaultId: string): Promise<SyncPayload> {
    const meta = await db.meta.get("VAULT_CONFIG");
    if (!meta) throw new Error("Két sắt chưa được cấu hình.");

    const records = await db.records.toArray();

    return {
      version: 1,
      vaultId,
      syncedAt: Date.now(),
      meta: {
        salt: this.bufferToArray(meta.salt),
        canaryCipherText: this.bufferToArray(meta.canaryCipherText),
        canaryIv: this.bufferToArray(meta.canaryIv),
      },
      // LƯU Ý: KHÔNG được lọc bỏ các record có isDeleted=true khỏi payload xuất đi!
      // Đây chính là "Ngôi Mộ" (Tombstone) - phải luôn đẩy nó lên Cloud để các thiết bị
      // khác đọc được cờ xóa và tự xóa record tương ứng ở local của chúng. Nếu lọc bỏ ở
      // đây, thiết bị khác sẽ không bao giờ biết record đã bị xóa => Bẫy "Khôi Phục Ma".
      records: records.map((r: VaultRecord) => ({
        id: r.id,
        cipherText: this.bufferToArray(r.cipherText),
        iv: this.bufferToArray(r.iv),
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        isDeleted: r.isDeleted,
        deletedAt: r.deletedAt,
      })),
    };
  }

  /**
   * THUẬT TOÁN GỘP DỮ LIỆU ĐA MÁY (RECORD-LEVEL LAST-WRITE-WINS)
   */
  public static async mergeAndSave(
    db: DynamicVaultDatabase,
    remotePayload: SyncPayload,
    currentVaultId: string,
  ): Promise<{ added: number; updated: number; total: number; requireRelogin: boolean }> {
    // Thêm cờ requireRelogin
    if (remotePayload.vaultId !== currentVaultId) {
      throw new Error("Dữ liệu trên đám mây thuộc về một Két sắt khác!");
    }

    const localRecords = await db.records.toArray();
    const localMeta = await db.meta.get("VAULT_CONFIG");
    let requireRelogin = false;

    // ĐIỂM CHẠM SENIOR: Thuật toán "Nhận nuôi Salt" trên thiết bị mới
    if (localMeta) {
      const localSaltStr = localMeta.salt.toString();
      const remoteSaltStr = remotePayload.meta.salt.toString();

      if (localSaltStr !== remoteSaltStr) {
        if (localRecords.length === 0) {
          // Máy mới tinh chưa có data, nhưng lỡ sinh Salt rác lúc đăng nhập.
          // BẮT BUỘC ghi đè bằng cấu hình Salt của đám mây!
          const remoteMeta: VaultMeta = {
            id: "VAULT_CONFIG",
            salt: new Uint8Array(remotePayload.meta.salt),
            canaryCipherText: this.arrayToBuffer(remotePayload.meta.canaryCipherText),
            canaryIv: new Uint8Array(remotePayload.meta.canaryIv),
          };
          await db.meta.put(remoteMeta);
          requireRelogin = true; // Kích hoạt cờ yêu cầu đăng nhập lại
        } else {
          throw new Error(
            "Xung đột khóa: Thiết bị này đang chứa dữ liệu cũ bằng một khóa khác. Vui lòng xóa dữ liệu (Clear Site Data) trước khi đồng bộ.",
          );
        }
      }
    } else {
      // Backup trường hợp chưa có Meta
      const remoteMeta: VaultMeta = {
        id: "VAULT_CONFIG",
        salt: new Uint8Array(remotePayload.meta.salt),
        canaryCipherText: this.arrayToBuffer(remotePayload.meta.canaryCipherText),
        canaryIv: new Uint8Array(remotePayload.meta.canaryIv),
      };
      await db.meta.put(remoteMeta);
      requireRelogin = true;
    }

    // ... [Đoạn gộp dữ liệu Records bên dưới giữ nguyên không đổi]
    const localMap = new Map<string, VaultRecord>();
    localRecords.forEach((r) => localMap.set(r.id, r));

    let addedCount = 0;
    let updatedCount = 0;

    for (const remote of remotePayload.records) {
      const local = localMap.get(remote.id);
      const remoteRecord: VaultRecord = {
        id: remote.id,
        cipherText: this.arrayToBuffer(remote.cipherText),
        iv: new Uint8Array(remote.iv),
        createdAt: remote.createdAt,
        updatedAt: remote.updatedAt,
        isDeleted: remote.isDeleted,
        deletedAt: remote.deletedAt,
      };

      // THUẬT TOÁN LAST-WRITE-WINS THUẦN TÚY: so sánh updatedAt bất kể record đó là
      // bản cập nhật thường hay một "Ngôi Mộ" (isDeleted=true). Miễn là mọi thao tác
      // Update/Delete đều nghiêm túc set lại updatedAt = Date.now(), thuật toán này tự
      // động xử lý đúng cả 2 tình huống:
      //  - Máy A xóa record (tombstone mới hơn) -> máy B (đang có bản update cũ hơn) sẽ
      //    nhận tombstone và xóa mềm theo, KHÔNG hồi sinh lại record.
      //  - Máy A xóa record nhưng máy B cập nhật record đó sau lúc xóa (updatedAt mới
      //    hơn) -> bản cập nhật của máy B thắng, record "sống lại" một cách CHỦ ĐÍCH
      //    (đúng ý người dùng), không phải do lỗi logic.
      if (!local) {
        await db.records.add(remoteRecord);
        addedCount++;
      } else if (remote.updatedAt > local.updatedAt) {
        await db.records.put(remoteRecord);
        updatedCount++;
      }
    }

    const finalRecords = await db.records.count();
    return { added: addedCount, updated: updatedCount, total: finalRecords, requireRelogin };
  }
}
