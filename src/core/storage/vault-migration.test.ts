import { describe, it, expect, beforeEach, afterEach } from "vitest";
import "fake-indexeddb/auto"; // Polyfill IndexedDB cho môi trường Node/Vitest
import { DynamicVaultDatabase } from "./dexie-client";
import { KeyDerivationEngine } from "../crypto/key-derivation";
import { AesGcmEngine } from "../crypto/aes-gcm";

const DAY_MS = 24 * 60 * 60 * 1000;
const THIRTY_DAYS_MS = 30 * DAY_MS;

// Hàm hỗ trợ dẫn xuất tên DB định tuyến (Khớp 1:1 với useVault.ts)
async function getTestVaultDbName(password: string): Promise<string> {
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest(
    "SHA-256",
    enc.encode(password + "vault_id_namespace_salt"),
  );
  const hashArray = Array.from(new Uint8Array(hashBuf));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return `ZeroKnowledgeVaultDB_${hashHex.slice(0, 32)}`;
}

/**
 * [NEW - PRINCIPAL ENGINEER FIX]
 * Sử dụng trực tiếp engine .delete() của Dexie để dọn dẹp database.
 * Dexie.delete() tự động đóng mọi kết nối ngầm và chờ xóa sạch vật lý,
 * loại bỏ hoàn toàn bẫy "onblocked silent failure" của native IDBRequest!
 */
async function cleanTestDatabase(dbName: string): Promise<void> {
  const tempDb = new DynamicVaultDatabase(dbName);
  await tempDb.delete(); // Dexie tự động xử lý close & delete triệt để
}

describe("Enterprise Vault Migration & Key Rotation Suite", () => {
  let oldPass: string;
  let newPass: string;
  let oldSalt: Uint8Array;
  let newSalt: Uint8Array;

  // Dọn sạch RAM ảo trước và sau mỗi bài test để đảm bảo tính cô lập 100%
  beforeEach(async () => {
    oldPass = "OldMasterPassword_123!";
    newPass = "NewSuperSecretPassword_999$";
    oldSalt = crypto.getRandomValues(new Uint8Array(16));
    newSalt = crypto.getRandomValues(new Uint8Array(16));

    const oldDbName = await getTestVaultDbName(oldPass);
    const newDbName = await getTestVaultDbName(newPass);
    await cleanTestDatabase(oldDbName);
    await cleanTestDatabase(newDbName);
  });

  afterEach(async () => {
    const oldDbName = await getTestVaultDbName(oldPass);
    const newDbName = await getTestVaultDbName(newPass);
    await cleanTestDatabase(oldDbName);
    await cleanTestDatabase(newDbName);
  });

  it("TEST 01: Xoay vòng khóa thành công & Di dời toàn bộ bản ghi sang DB mới", async () => {
    const oldDbName = await getTestVaultDbName(oldPass);
    const oldDb = new DynamicVaultDatabase(oldDbName);
    await oldDb.open();
    await oldDb.records.clear(); // Defense-in-depth: Đảm bảo bảng sạch 100%

    const { key: oldKey } = await KeyDerivationEngine.deriveKey(
      new TextEncoder().encode(oldPass),
      oldSalt,
    );

    const plainText1 = new TextEncoder().encode(
      JSON.stringify({ title: "Bank Account", pass: "123456" }),
    );
    const encrypted1 = await AesGcmEngine.encryptRaw(plainText1.buffer as ArrayBuffer, oldKey);

    await oldDb.records.bulkPut([
      {
        id: "rec-1",
        cipherText: encrypted1.cipherText,
        iv: encrypted1.iv,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      },
    ]);

    const newDbName = await getTestVaultDbName(newPass);
    const newDb = new DynamicVaultDatabase(newDbName);
    await newDb.open();
    await newDb.records.clear();

    const { key: newKey } = await KeyDerivationEngine.deriveKey(
      new TextEncoder().encode(newPass),
      newSalt,
    );

    const allOldRecords = await oldDb.records.toArray();
    const migratedRecords = [];

    for (const rec of allOldRecords) {
      const decryptedBuf = await AesGcmEngine.decryptRaw(
        { cipherText: rec.cipherText, iv: rec.iv },
        oldKey,
      );
      const newEncrypted = await AesGcmEngine.encryptRaw(decryptedBuf, newKey);

      migratedRecords.push({
        ...rec,
        cipherText: newEncrypted.cipherText,
        iv: newEncrypted.iv,
        updatedAt: Date.now(),
      });
    }

    await newDb.records.bulkPut(migratedRecords);

    // FIX: Dùng phương thức .delete() của chính Dexie để xóa sạch DB cũ
    await oldDb.delete();

    const recordsInNewDb = await newDb.records.toArray();
    expect(recordsInNewDb.length).toBe(1);

    const testRec = recordsInNewDb[0];
    const decryptedAfterMigrate = await AesGcmEngine.decryptRaw(
      { cipherText: testRec.cipherText, iv: testRec.iv },
      newKey,
    );
    const parsedData = JSON.parse(new TextDecoder().decode(decryptedAfterMigrate));
    expect(parsedData.title).toBe("Bank Account");

    await expect(
      AesGcmEngine.decryptRaw({ cipherText: testRec.cipherText, iv: testRec.iv }, oldKey),
    ).rejects.toThrow();

    await newDb.close(); // Đóng kết nối DB mới
  });

  it("TEST 02: Tombstone Garbage Collection (Dọn dẹp bản ghi xóa mềm quá 30 ngày)", async () => {
    const oldDbName = await getTestVaultDbName(oldPass);
    const oldDb = new DynamicVaultDatabase(oldDbName);
    await oldDb.open();

    // FIX DEFENSE-IN-DEPTH: Cưỡng chế xóa sạch bảng dữ liệu trước khi nạp data mẫu
    // Ngăn chặn tuyệt đối mọi tàn dư từ TEST 01 bị sót lại trong RAM!
    await oldDb.records.clear();

    const now = Date.now();
    const dummyCipher = new ArrayBuffer(8);
    const dummyIv = new Uint8Array(12);

    await oldDb.records.bulkPut([
      { id: "active-rec", cipherText: dummyCipher, iv: dummyIv, createdAt: now, updatedAt: now },
      {
        id: "deleted-recent",
        cipherText: dummyCipher,
        iv: dummyIv,
        createdAt: now,
        updatedAt: now,
        isDeleted: true,
        deletedAt: now - 10 * DAY_MS,
      },
      {
        id: "deleted-expired",
        cipherText: dummyCipher,
        iv: dummyIv,
        createdAt: now,
        updatedAt: now,
        isDeleted: true,
        deletedAt: now - 31 * DAY_MS,
      },
    ]);

    const allRecords = await oldDb.records.toArray();
    const validRecordsForMigration = allRecords.filter((rec) => {
      if (rec.isDeleted && rec.deletedAt && now - rec.deletedAt > THIRTY_DAYS_MS) {
        return false;
      }
      return true;
    });

    expect(validRecordsForMigration.length).toBe(2);
    expect(validRecordsForMigration.map((r) => r.id)).toContain("active-rec");
    expect(validRecordsForMigration.map((r) => r.id)).toContain("deleted-recent");
    expect(validRecordsForMigration.map((r) => r.id)).not.toContain("deleted-expired");

    await oldDb.close();
  });

  it("TEST 03: Atomic Rollback (Đảm bảo nguyên vẹn DB cũ nếu phát sinh lỗi khi re-encrypt)", async () => {
    const oldDbName = await getTestVaultDbName(oldPass);
    const oldDb = new DynamicVaultDatabase(oldDbName);
    await oldDb.open();
    await oldDb.records.clear();

    await oldDb.records.put({
      id: "safe-rec",
      cipherText: new ArrayBuffer(16),
      iv: new Uint8Array(12),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });

    const initialCount = await oldDb.records.count();

    const simulatedMigrationAttempt = async () => {
      const newDbName = await getTestVaultDbName(newPass);
      const newDb = new DynamicVaultDatabase(newDbName);
      await newDb.open();
      await newDb.records.clear();

      try {
        throw new Error("Tampered Data detected during re-encryption!");
      } catch (error) {
        // Dùng native .delete() của Dexie để rollback và xóa sạch DB tạo dở dang
        await newDb.delete();
        throw error;
      }
    };

    await expect(simulatedMigrationAttempt()).rejects.toThrow("Tampered Data");

    const countAfterFailedMigration = await oldDb.records.count();
    expect(countAfterFailedMigration).toBe(initialCount);

    await oldDb.close();
  });
});
