// Cấu hình IndexedDB Schema

import Dexie, { type EntityTable } from "dexie";

/**
 * Cấu trúc một bản ghi Két sắt được lưu trong IndexedDB.
 * Hoàn toàn Zero-Knowledge: Không ai biết title, username hay password thực sự là gì.
 */
export interface VaultRecord {
  id: string; // UUID v4
  cipherText: ArrayBuffer; // Dữ liệu JSON (Title, User, Pass, TOTP Secret...) đã mã hóa
  iv: Uint8Array; // Initialization Vector dùng để giải mã bản ghi này
  createdAt: number;
  updatedAt: number;
  // TOMBSTONE PATTERN (Soft Delete): Tuyệt đối không Hard Delete record khỏi IndexedDB,
  // nếu không thiết bị khác chưa kịp sync sẽ "hồi sinh" (resurrect) lại record đã xóa
  // trong lần Merge tiếp theo. Thay vào đó chỉ đánh dấu isDeleted + deletedAt, cập nhật
  // updatedAt để thuật toán Last-Write-Wins nhận diện đúng đây là thay đổi mới nhất.
  isDeleted?: boolean;
  deletedAt?: number;
}

// Cấu hình bảo mật của Két sắt (Lưu Salt & Canary)
export interface VaultMeta {
  id: string; // Luôn là chuỗi cố định: 'VAULT_CONFIG'
  salt: Uint8Array; // Salt dùng chung cho toàn bộ Két sắt
  canaryCipherText: ArrayBuffer; // Chuỗi "CANARY" đã bị mã hóa
  canaryIv: Uint8Array; // IV dùng để giải mã Canary
}

export class DynamicVaultDatabase extends Dexie {
  records!: EntityTable<VaultRecord, "id">;
  meta!: EntityTable<VaultMeta, "id">; // Thêm bảng meta

  constructor(vaultId?: string) {
    super(vaultId ? `ZeroKnowledgeVaultDB_${vaultId}` : "ZeroKnowledgeVaultDB");

    // Chỉ định định danh trường 'id' là Primary Key.
    // Các trường nhị phân không cần đánh Index để tránh lộ metadata.
    this.version(1).stores({
      records: "id, createdAt, updatedAt",
      meta: "id",
    });
  }
}

export const db = new DynamicVaultDatabase();
