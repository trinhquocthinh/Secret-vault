import { describe, it, expect } from "vitest";
import { KeyDerivationEngine } from "./key-derivation";
import { AesGcmEngine } from "./aes-gcm";
import { MemoryWiper } from "./memory-wiper";

describe("Zero-Knowledge Core Crypto Engine", () => {
  const mockPassword = "SuperSecretMasterPassword2026!";
  const secretData = JSON.stringify({
    title: "Vietcombank Internet Banking",
    username: "senior_dev_99",
    password: "UnbreakablePassword#123",
    totpSecret: "JBSWY3DPEHPK3PXP",
  });

  it("1. Phải mã hóa và giải mã chính xác 100% dữ liệu ban đầu", async () => {
    const encoder = new TextEncoder();
    const passBuffer = encoder.encode(mockPassword);

    // Dẫn xuất khóa
    const { key } = await KeyDerivationEngine.deriveKey(passBuffer);

    // Mã hóa
    const encrypted = await AesGcmEngine.encrypt(secretData, key);
    expect(encrypted.cipherText.byteLength).toBeGreaterThan(0);
    expect(encrypted.iv.length).toBe(12);

    // Giải mã
    const decrypted = await AesGcmEngine.decrypt(encrypted, key);
    expect(decrypted).toBe(secretData);
  });

  it("2. Hai lần mã hóa cùng 1 dữ liệu với cùng 1 khóa PHẢI ra Ciphertext khác nhau (nhờ IV ngẫu nhiên)", async () => {
    const encoder = new TextEncoder();
    const { key } = await KeyDerivationEngine.deriveKey(encoder.encode(mockPassword));

    const enc1 = await AesGcmEngine.encrypt(secretData, key);
    const enc2 = await AesGcmEngine.encrypt(secretData, key);

    // IV phải khác nhau
    expect(enc1.iv).not.toEqual(enc2.iv);
    // Ciphertext phải hoàn toàn khác nhau dù dữ liệu đầu vào y hệt
    expect(new Uint8Array(enc1.cipherText)).not.toEqual(new Uint8Array(enc2.cipherText));
  });

  it("3. MemoryWiper phải ghi đè toàn bộ mảng nhị phân về số 0", () => {
    const sensitiveArray = new Uint8Array([115, 101, 99, 114, 101, 116]); // "secret"
    expect(sensitiveArray[0]).toBe(115);

    MemoryWiper.wipe(sensitiveArray);

    // Tất cả các phần tử phải bị biến thành số 0
    expect(sensitiveArray.every((byte) => byte === 0)).toBe(true);
  });

  it("4. Phải ném lỗi nếu giải mã bằng sai Master Password (GCM Tamper Resistance)", async () => {
    const encoder = new TextEncoder();
    const { key: correctKey } = await KeyDerivationEngine.deriveKey(encoder.encode(mockPassword));
    const { key: wrongKey } = await KeyDerivationEngine.deriveKey(encoder.encode("WrongPassword!"));

    const encrypted = await AesGcmEngine.encrypt(secretData, correctKey);

    // Cố tình dùng sai khóa để giải mã
    await expect(AesGcmEngine.decrypt(encrypted, wrongKey)).rejects.toThrow(/Giải mã thất bại/);
  });
});
