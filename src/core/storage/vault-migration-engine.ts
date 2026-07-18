/* eslint-disable @typescript-eslint/no-explicit-any */
import { DynamicVaultDatabase } from "./dexie-client";
import { AesGcmEngine } from "../crypto/aes-gcm";
import { MemoryWiper } from "../crypto/memory-wiper";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000; // Ngưỡng dọn mộ 30 ngày

export class VaultMigrationEngine {
  public static async migrateVaultData(
    oldDb: DynamicVaultDatabase,
    oldKey: CryptoKey,
    newDbName: string,
    newKey: CryptoKey,
    newMetaRecord: any,
  ): Promise<DynamicVaultDatabase> {
    const newDb = new DynamicVaultDatabase(newDbName);
    await newDb.open();

    try {
      const allOldRecords = await oldDb.records.toArray();
      const migratedRecords: any[] = [];
      const now = Date.now();

      for (const record of allOldRecords) {
        // 1. TOMBSTONE GARBAGE COLLECTION
        if (record.isDeleted && record.deletedAt && now - record.deletedAt > THIRTY_DAYS_MS) {
          continue; // Lọc bỏ vĩnh viễn mộ cũ khỏi DB mới
        }

        if (!record.isDeleted) {
          // 2. RAW BUFFER RE-ENCRYPTION PIPELINE (Zero Plaintext String Exposure)
          let plainBuffer: ArrayBuffer | null = null;
          try {
            // Giải mã ra ArrayBuffer thô trong RAM bằng Khóa Cũ
            plainBuffer = await AesGcmEngine.decryptRaw(
              { cipherText: record.cipherText, iv: record.iv },
              oldKey,
            );

            // Mã hóa ngay lập tức ArrayBuffer đó bằng Khóa Mới + IV ngẫu nhiên mới
            const encrypted = await AesGcmEngine.encryptRaw(plainBuffer, newKey);

            migratedRecords.push({
              id: record.id,
              cipherText: encrypted.cipherText,
              iv: encrypted.iv,
              createdAt: record.createdAt,
              updatedAt: now, // Thắng xung đột LWW khi đồng bộ Cloud
            });
          } finally {
            // ĐIỂM CHẠM PRINCIPAL ENGINEER:
            // Cưỡng chế ghi đè toàn bộ số 0x00 lên vùng nhớ RAM chứa bản rõ vừa giải mã!
            // Ngăn chặn tuyệt đối lỗ hổng Memory Dump Attack (T-01) trong suốt quá trình migrate!
            if (plainBuffer) {
              MemoryWiper.wipeArrayBuffer(plainBuffer);
            }
          }
        } else {
          // 3. Giữ nguyên Tombstone mới để lan truyền tín hiệu xóa sang thiết bị khác
          migratedRecords.push({
            ...record,
            updatedAt: now,
          });
        }
      }

      // 4. ATOMIC COMMIT xuống database mới
      await newDb.transaction("rw", newDb.meta, newDb.records, async () => {
        await newDb.meta.put(newMetaRecord);
        await newDb.records.bulkPut(migratedRecords);
      });

      return newDb;
    } catch (error) {
      await newDb.close();
      throw error;
    }
  }
}
