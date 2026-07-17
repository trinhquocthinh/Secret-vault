/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback } from "react";
import {
  DynamicVaultDatabase,
  type VaultRecord,
  type VaultMeta,
} from "../../../core/storage/dexie-client";
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
const MAX_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 1000; // Khóa 1 phút

// Hàm tiện ích băm SHA-256 tạo Vault ID độc nhất từ mật khẩu
const deriveVaultId = async (password: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "vault_id_namespace_salt");
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
};

export function useVault() {
  const [isUnlocked, setIsUnlocked] = useState<boolean>(false);
  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [skippedRecordCount, setSkippedRecordCount] = useState<number>(0);

  const [activeDb, setActiveDb] = useState<DynamicVaultDatabase | null>(null);
  const [vaultId, setVaultId] = useState<string | null>(null);
  const masterKeyRef = useRef<CryptoKey | null>(null);

  const fetchAndDecryptVault = useCallback(
    async (key: CryptoKey, dbInstance: DynamicVaultDatabase) => {
      // ĐIỂM CHẠM SENIOR 1: Đảm bảo database đã mở kết nối vật lý hoàn toàn trước khi đọc dữ liệu
      if (!dbInstance.isOpen()) {
        await dbInstance.open();
      }

      const records = await dbInstance.records.toArray();
      const decryptedList: SecretItem[] = [];
      let skipped = 0;

      for (const record of records) {
        try {
          const jsonStr = await AesGcmEngine.decrypt(
            { cipherText: record.cipherText, iv: record.iv },
            key,
          );
          const data = JSON.parse(jsonStr);
          decryptedList.push({
            id: record.id,
            title: data.title,
            username: data.username,
            totpSecret: data.totpSecret,
          });
        } catch (e) {
          skipped++;
          console.error(`Bỏ qua bản ghi lỗi ID: ${record.id}`, e);
        }
      }
      setSkippedRecordCount(skipped);
      setSecrets(decryptedList);
    },
    [],
  );

  const unlockVault = async (password: string): Promise<boolean> => {
    const lockoutUntil = parseInt(localStorage.getItem("vault_lockout") || "0", 10);
    if (Date.now() < lockoutUntil) {
      const waitTime = Math.ceil((lockoutUntil - Date.now()) / 1000);
      setError(`Két sắt bị khóa tạm thời. Thử lại sau ${waitTime}s.`);
      return false;
    }

    setIsLoading(true);
    setError(null);
    const encoder = new TextEncoder();
    const passBuffer = encoder.encode(password);

    try {
      const derivedVaultId = await deriveVaultId(password);
      const dbInstance = new DynamicVaultDatabase(derivedVaultId);

      // ĐIỂM CHẠM SENIOR 2: Chủ động kích hoạt kết nối tuần tự
      await dbInstance.open();

      const meta = await dbInstance.meta.get(META_ID);

      const resolvedKey: CryptoKey = await (async () => {
        if (!meta) {
          const { key, salt } = await KeyDerivationEngine.deriveKey(passBuffer);
          const encryptedCanary = await AesGcmEngine.encrypt(CANARY_STRING, key);

          const newMeta: VaultMeta = {
            id: META_ID,
            salt: salt,
            canaryCipherText: encryptedCanary.cipherText,
            canaryIv: encryptedCanary.iv,
          };

          await dbInstance.meta.put(newMeta);
          return key;
        } else {
          const { key } = await KeyDerivationEngine.deriveKey(passBuffer, meta.salt);

          try {
            const decryptedCanary = await AesGcmEngine.decrypt(
              { cipherText: meta.canaryCipherText, iv: meta.canaryIv },
              key,
            );
            if (decryptedCanary !== CANARY_STRING) throw new Error("Canary mismatch");
          } catch {
            throw new Error("INVALID_PASSWORD");
          }
          return key;
        }
      })();

      masterKeyRef.current = resolvedKey;

      // Thực hiện giải mã và chuẩn bị mảng dữ liệu vào bộ nhớ RAM trước khi đẩy trạng thái lên UI
      await fetchAndDecryptVault(resolvedKey, dbInstance);

      setActiveDb(dbInstance);
      setVaultId(derivedVaultId);
      setIsUnlocked(true);

      localStorage.removeItem("vault_attempts");
      localStorage.removeItem("vault_lockout");
      return true;
    } catch (err: any) {
      if (err.message === "INVALID_PASSWORD") {
        const attempts = parseInt(localStorage.getItem("vault_attempts") || "0", 10) + 1;
        if (attempts >= MAX_ATTEMPTS) {
          localStorage.setItem("vault_lockout", (Date.now() + LOCKOUT_DURATION_MS).toString());
          localStorage.setItem("vault_attempts", "0");
          setError(`Đã nhập sai quá ${MAX_ATTEMPTS} lần. Két sắt bị khóa trong 1 phút.`);
        } else {
          localStorage.setItem("vault_attempts", attempts.toString());
          setError(`Mật khẩu Master không chính xác! (Còn ${MAX_ATTEMPTS - attempts} lần thử).`);
        }
      } else {
        setError("Có lỗi xảy ra khi đọc bộ nhớ Két sắt.");
      }
      return false;
    } finally {
      MemoryWiper.wipe(passBuffer);
      setIsLoading(false);
    }
  };

  // ĐIỂM CHẠM SENIOR 3: Chuyển hàm lockVault thành hàm Async để giải phóng triệt để kết nối ổ đĩa,
  // loại bỏ hoàn toàn tình trạng kẹt kết nối IndexedDB khi re-login ngay lập tức
  const lockVault = useCallback(async () => {
    masterKeyRef.current = null;
    if (activeDb) {
      try {
        await activeDb.close(); // BẮT BUỘC AWAIT KẾT NỐI VẬT LÝ VỪA ĐÓNG
      } catch (e) {
        console.error("Lỗi đóng kết nối DB vật lý:", e);
      }
    }
    setActiveDb(null);
    setVaultId(null);
    setSecrets([]);
    setSkippedRecordCount(0);
    setIsUnlocked(false);
  }, [activeDb]);

  const refreshVault = useCallback(async () => {
    if (!masterKeyRef.current || !activeDb) return;
    await fetchAndDecryptVault(masterKeyRef.current, activeDb);
  }, [activeDb, fetchAndDecryptVault]);

  const addSecret = async (newItem: Omit<SecretItem, "id">) => {
    if (!masterKeyRef.current || !activeDb) throw new Error("Két sắt đang bị khóa!");

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

    await activeDb.records.add(record);
    await fetchAndDecryptVault(masterKeyRef.current, activeDb);
  };

  const getSecretPassword = async (id: string): Promise<string> => {
    if (!masterKeyRef.current || !activeDb) throw new Error("Két sắt đang bị khóa!");
    const record = await activeDb.records.get(id);
    if (!record) throw new Error("Không tìm thấy dữ liệu!");

    const jsonStr = await AesGcmEngine.decrypt(
      { cipherText: record.cipherText, iv: record.iv },
      masterKeyRef.current,
    );
    const data = JSON.parse(jsonStr);
    return data.password || "";
  };

  return {
    isUnlocked,
    isLoading,
    error,
    secrets,
    skippedRecordCount,
    unlockVault,
    lockVault,
    addSecret,
    getSecretPassword,
    activeDb,
    vaultId,
    refreshVault,
  };
}
