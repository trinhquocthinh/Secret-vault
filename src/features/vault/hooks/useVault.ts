// src/features/vault/hooks/useVault.ts
import { useState, useRef, useCallback } from "react";
import { db, type VaultRecord, type VaultMeta } from "../../../core/storage/dexie-client";
import { KeyDerivationEngine } from "../../../core/crypto/key-derivation";
import { AesGcmEngine } from "../../../core/crypto/aes-gcm";
import { MemoryWiper } from "../../../core/crypto/memory-wiper";

export interface SecretItem {
  id: string;
  title: string;
  username: string;
  password?: string;
  totpSecret?: string;
}

const CANARY_STRING = "ZERO_KNOWLEDGE_VAULT_VALID_CANARY";
const META_ID = "VAULT_CONFIG";

export function useVault() {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const masterKeyRef = useRef<CryptoKey | null>(null);

  /**
   * Tải và giải mã danh sách metadata từ IndexedDB
   */
  const fetchAndDecryptVault = useCallback(async (key: CryptoKey) => {
    const records = await db.records.toArray();
    const decryptedList: SecretItem[] = [];

    for (const record of records) {
      try {
        const jsonStr = await AesGcmEngine.decrypt({ cipherText: record.cipherText, iv: record.iv }, key);
        const data = JSON.parse(jsonStr);
        decryptedList.push({
          id: record.id,
          title: data.title,
          username: data.username,
          totpSecret: data.totpSecret,
        });
      } catch (e) {
        console.error(`Bỏ qua bản ghi bị hỏng ID: ${record.id}`, e);
      }
    }
    setSecrets(decryptedList);
  }, []);

  /**
   * MỞ KHÓA HOẶC KHỞI TẠO KÉT SẮT (CANARY ARCHITECTURE)
   */
  const MAX_ATTEMPTS = 5;
  const LOCKOUT_DURATION_MS = 60 * 1000;

  const unlockVault = async (password: string): Promise<boolean> => {
    // 1. KIỂM TRA THROTTLING TRƯỚC KHI THỰC THI CRYPTO
    const lockoutUntil = parseInt(localStorage.getItem("vault_lockout") || "0", 10);
    if (Date.now() < lockoutUntil) {
      const waitTime = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setError(`Két sắt bị khóa tạm thời do nhập sai quá nhiều. Thử lại sau ${waitTime}s.`);
      return false;
    }

    setIsLoading(true);
    setError(null);
    const encoder = new TextEncoder();
    const passBuffer = encoder.encode(password);

    try {
      // 1. Kiểm tra xem Két sắt đã từng được tạo cấu hình chưa
      const meta = await db.meta.get(META_ID);

      if (!meta) {
        // --- TRƯỜNG HỢP 1: KHỞI TẠO KÉT SẮT LẦN ĐẦU (FIRST-TIME SETUP) ---
        console.log("Khởi tạo Két sắt mới...");
        const { key, salt } = await KeyDerivationEngine.deriveKey(passBuffer);

        // Mã hóa Canary string để làm "Huy hiệu xác thực" cho các lần đăng nhập sau
        const encryptedCanary = await AesGcmEngine.encrypt(CANARY_STRING, key);

        const newMeta: VaultMeta = {
          id: META_ID,
          salt: salt,
          canaryCipherText: encryptedCanary.cipherText,
          canaryIv: encryptedCanary.iv,
        };

        await db.meta.put(newMeta);
        localStorage.removeItem("vault_attempts");
        localStorage.removeItem("vault_lockout");
        masterKeyRef.current = key;
        await fetchAndDecryptVault(key);
        setIsUnlocked(true);
        return true;
      } else {
        // --- TRƯỜNG HỢP 2: MỞ KHÓA KÉT SẮT ĐÃ CÓ (NORMAL UNLOCK) ---
        console.log("Đang xác thực Master Password...");
        // BẮT BUỘC TRUYỀN LẠI SALT CŨ từ database vào hàm dẫn xuất
        const { key } = await KeyDerivationEngine.deriveKey(passBuffer, meta.salt);

        // THỬ GIẢI MÃ CANARY ĐỂ KIỂM CHỨNG MẬT KHẨU
        try {
          const decryptedCanary = await AesGcmEngine.decrypt(
            { cipherText: meta.canaryCipherText, iv: meta.canaryIv },
            key,
          );

          if (decryptedCanary !== CANARY_STRING) {
            throw new Error("Canary mismatch");
          }
        } catch (canaryError) {
          // Nếu giải mã Canary thất bại -> CHẮC CHẮN SAI MẬT KHẨU!
          throw new Error("INVALID_PASSWORD", { cause: canaryError });
        }

        // Nếu qua được ải Canary -> Mật khẩu chính xác 100%!
        localStorage.removeItem("vault_attempts");
        localStorage.removeItem("vault_lockout");
        masterKeyRef.current = key;
        await fetchAndDecryptVault(key);
        setIsUnlocked(true);
        return true;
      }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (err) {
      // 2. XỬ LÝ KHI NHẬP SAI MẬT KHẨU
      const attempts = parseInt(localStorage.getItem("vault_attempts") || "0", 10) + 1;
      if (attempts >= MAX_ATTEMPTS) {
        localStorage.setItem("vault_lockout", (Date.now() + LOCKOUT_DURATION_MS).toString());
        localStorage.setItem("vault_attempts", "0");
        setError("Đã nhập sai quá 5 lần. Két sắt bị khóa trong 1 phút.");
      } else {
        localStorage.setItem("vault_attempts", attempts.toString());
        setError(`Mật khẩu Master không chính xác! (Còn ${MAX_ATTEMPTS - attempts} lần thử).`);
      }
      return false;
    } finally {
      MemoryWiper.wipe(passBuffer);
      setIsLoading(false);
    }
  };

  /**
   * Khóa Két sắt và lập tức xóa sạch RAM
   */
  const lockVault = useCallback(() => {
    masterKeyRef.current = null;
    setSecrets([]);
    setIsUnlocked(false);
  }, []);

  /**
   * Thêm một bản ghi bí mật mới vào Két sắt
   */
  const addSecret = async (newItem: Omit<SecretItem, "id">) => {
    if (!masterKeyRef.current) throw new Error("Két sắt đang bị khóa!");

    const id = crypto.randomUUID();
    const plaintext = JSON.stringify({ ...newItem, id });
    const encrypted = await AesGcmEngine.encrypt(plaintext, masterKeyRef.current);

    const record: VaultRecord = {
      id,
      cipherText: encrypted.cipherText,
      iv: encrypted.iv,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db.records.add(record);
    await fetchAndDecryptVault(masterKeyRef.current);
  };

  /**
   * Giải mã lazy-load chi tiết 1 mật khẩu
   */
  const getSecretPassword = async (id: string): Promise<string> => {
    if (!masterKeyRef.current) throw new Error("Két sắt đang bị khóa!");
    const record = await db.records.get(id);
    if (!record) throw new Error("Không tìm thấy dữ liệu!");

    const jsonStr = await AesGcmEngine.decrypt({ cipherText: record.cipherText, iv: record.iv }, masterKeyRef.current);
    const data = JSON.parse(jsonStr);
    return data.password || "";
  };

  return {
    isUnlocked,
    isLoading,
    error,
    secrets,
    unlockVault,
    lockVault,
    addSecret,
    getSecretPassword,
  };
}
