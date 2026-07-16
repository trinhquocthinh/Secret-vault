// Cấu hình IndexedDB Schema

import Dexie, { type EntityTable } from "dexie";

/**
 * Cấu trúc một bản ghi Két sắt được lưu trong IndexedDB.
 * Hoàn toàn Zero-Knowledge: Không ai biết title, username hay password thực sự là gì.
 */
export interface VaultRecord {
  id: string; // UUID v4
  ciphertext: ArrayBuffer; // Dữ liệu JSON (Title, User, Pass, TOTP Secret...) đã mã hóa
  iv: Uint8Array; // Initialization Vector dùng để giải mã bản ghi này
  salt: Uint8Array; // Salt dùng để dẫn xuất khóa (nếu áp dụng salt riêng cho từng record hoặc vault)
  createdAt: number;
  updatedAt: number;
}

class VaultDatabase extends Dexie {
  records!: EntityTable<VaultRecord, "id">;

  constructor() {
    super("ZeroKnowledgeVaultDB");

    // Chỉ định định danh trường 'id' là Primary Key.
    // Các trường nhị phân không cần đánh Index để tránh lộ metadata.
    this.version(1).stores({
      records: "id, createdAt, updatedAt",
    });
  }
}

export const db = new VaultDatabase();
