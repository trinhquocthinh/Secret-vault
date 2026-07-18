/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useRef, useCallback } from "react";
import {
  DynamicVaultDatabase,
  type VaultRecord,
  type VaultMeta,
} from "../../../core/storage/dexie-client";
import { AesGcmEngine } from "../../../core/crypto/aes-gcm";
import { MemoryWiper } from "../../../core/crypto/memory-wiper";
import { KeyDerivationWorkerClient } from "../../../core/crypto/worker-client";
import { VaultMigrationEngine } from "../../../core/storage/vault-migration-engine";
import { WebAuthnPrfEngine } from "../../../core/crypto/webauthn-prf";

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
        // Bỏ qua "Ngôi Mộ" (Tombstone): record đã bị xóa mềm (isDeleted=true) không được
        // hiển thị lên UI, và cũng không có ciphertext hợp lệ để giải mã.
        if (record.isDeleted) continue;
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
          const { key, salt } = await KeyDerivationWorkerClient.deriveKey(passBuffer);
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
          const { key } = await KeyDerivationWorkerClient.deriveKey(passBuffer, meta.salt);

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
      if (passBuffer.byteLength > 0) {
        MemoryWiper.wipe(passBuffer);
      }
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
    if (!record || record.isDeleted) throw new Error("Không tìm thấy dữ liệu!");

    const jsonStr = await AesGcmEngine.decrypt(
      { cipherText: record.cipherText, iv: record.iv },
      masterKeyRef.current,
    );
    const data = JSON.parse(jsonStr);
    return data.password || "";
  };

  /**
   * CẬP NHẬT (UPDATE) một record đã tồn tại.
   * - Luôn gọi AesGcmEngine.encrypt lại từ đầu => sinh ra một IV 12 bytes ngẫu nhiên MỚI
   *   HOÀN TOÀN cho lần mã hóa này (không bao giờ tái sử dụng IV cũ), tránh lỗi tử hình
   *   "IV Reuse" trong AES-GCM (2 bản mã dùng chung Key+IV sẽ lộ XOR của 2 bản rõ).
   * - Luôn set lại `updatedAt = Date.now()` để thuật toán Last-Write-Wins của Sync Engine
   *   nhận diện đúng đây là phiên bản mới nhất, tránh bị "Mất Phiên Bản" (Lost Update) khi
   *   một thiết bị khác đẩy lên một bản ghi cũ hơn nhưng lỡ có timestamp nhỉnh hơn.
   */
  const updateSecret = async (id: string, updatedItem: Omit<SecretItem, "id">) => {
    if (!masterKeyRef.current || !activeDb) throw new Error("Két sắt đang bị khóa!");

    const existing = await activeDb.records.get(id);
    if (!existing || existing.isDeleted) throw new Error("Không tìm thấy bản ghi để cập nhật!");

    const plaintext = JSON.stringify({ ...updatedItem, id });
    const encrypted = await AesGcmEngine.encrypt(plaintext, masterKeyRef.current);

    const record: VaultRecord = {
      id,
      cipherText: encrypted.cipherText,
      iv: encrypted.iv,
      createdAt: existing.createdAt,
      updatedAt: Date.now(),
    };

    await activeDb.records.put(record);
    await fetchAndDecryptVault(masterKeyRef.current, activeDb);
  };

  /**
   * XÓA (DELETE) một record theo mô hình TOMBSTONE (Soft Delete).
   * Tuyệt đối không db.records.delete(id) ngay lập tức, nếu không thiết bị khác lâu ngày
   * chưa sync sẽ vô tình "hồi sinh" (resurrect) lại record này trong lần Merge tiếp theo
   * (Bẫy Khôi Phục Ma). Thay vào đó, ta chỉ đánh dấu isDeleted=true + deletedAt, đồng thời
   * cập nhật updatedAt để Last-Write-Wins nhận diện đây là thay đổi mới nhất, rồi để cho
   * chính việc Sync lan truyền tombstone này sang các thiết bị khác. Ciphertext/IV cũ được
   * xóa rỗng luôn cho gọn (không còn cần thiết để hiển thị nữa).
   */
  const deleteSecret = async (id: string) => {
    if (!masterKeyRef.current || !activeDb) throw new Error("Két sắt đang bị khóa!");

    const existing = await activeDb.records.get(id);
    if (!existing) return;

    const now = Date.now();
    const tombstone: VaultRecord = {
      id,
      cipherText: new ArrayBuffer(0),
      iv: new Uint8Array(0),
      createdAt: existing.createdAt,
      updatedAt: now,
      isDeleted: true,
      deletedAt: now,
    };

    await activeDb.records.put(tombstone);
    await fetchAndDecryptVault(masterKeyRef.current, activeDb);
  };

  /**
   * ENGINE XOAY VÒNG KHÓA VÀ DI DỜI DATABASE CỤC BỘ (KEY ROTATION PIPELINE)
   */
  const changePassword = async (oldPassword: string, newPassword: string): Promise<boolean> => {
    if (!masterKeyRef.current || !activeDb || !vaultId) {
      setError("Két sắt phải được mở khóa trước khi thực hiện đổi mật khẩu.");
      return false;
    }

    setIsLoading(true);
    setError(null);

    const encoder = new TextEncoder();
    const oldPassBuffer = encoder.encode(oldPassword);
    const newPassBuffer = encoder.encode(newPassword);

    try {
      // 1. Kiểm tra tính chính xác của mật khẩu cũ thông qua so khớp Vault ID
      const derivedOldVaultId = await deriveVaultId(oldPassword);
      if (derivedOldVaultId !== vaultId) {
        throw new Error("MẬT_KHẨU_CŨ_KHÔNG_CHÍNH_XÁC");
      }

      // 2. Kiểm tra mật khẩu mới trùng lặp
      const derivedNewVaultId = await deriveVaultId(newPassword);
      if (derivedNewVaultId === vaultId) {
        throw new Error("Mật khẩu mới không được trùng với mật khẩu Master hiện tại.");
      }

      // 3. Sinh Salt PBKDF2 mới hoàn toàn cho mật khẩu mới
      const newSalt = crypto.getRandomValues(new Uint8Array(16));

      // 4. Gọi Web Worker luồng phụ tính toán 600,000 vòng lặp PBKDF2 tạo Khóa chính mới
      const { key: newKey } = await KeyDerivationWorkerClient.deriveKey(newPassBuffer, newSalt);

      // 5. Tạo Huy hiệu xác thực hoàng yến (Canary Verifier) mới
      const encryptedCanary = await AesGcmEngine.encrypt(CANARY_STRING, newKey);

      const newMeta: VaultMeta = {
        id: META_ID,
        salt: newSalt,
        canaryCipherText: encryptedCanary.cipherText,
        canaryIv: encryptedCanary.iv,
      };

      const newDbName = derivedNewVaultId;

      // 6. Kích hoạt Migration Engine thực hiện giải mã và mã hóa lại toàn bộ kho lưu trữ
      const newDbInstance = await VaultMigrationEngine.migrateVaultData(
        activeDb,
        masterKeyRef.current,
        newDbName,
        newKey,
        newMeta,
      );

      // 7. Giải phóng vật lý và XÓA HOÀN TOÀN file Database cũ trên ổ đĩa
      const oldDbName = vaultId;
      await activeDb.close(); // Giải phóng connection lock chống kẹt kết nối vật lý

      // Sử dụng native Web API xóa triệt để file DB cũ khỏi ổ cứng trình duyệt
      await new Promise<void>((resolve, reject) => {
        const req = globalThis.indexedDB.deleteDatabase(oldDbName);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      // 8. Thực hiện Hot-Swap các tham chiếu mật mã học trong RAM State của React
      masterKeyRef.current = newKey;
      setVaultId(derivedNewVaultId);
      setActiveDb(newDbInstance);

      // 9. Nạp lại danh sách bản ghi mới vào RAM để UI cập nhật mượt mà
      await fetchAndDecryptVault(newKey, newDbInstance);

      // Lưu ý: Nếu người dùng cấu hình Auto-Sync Cloud, lần đồng bộ tiếp theo
      // sẽ tự động đẩy bản mã hóa mới này lên file `zero_knowledge_vault_sync.enc` của Drive.
      return true;
    } catch (err: any) {
      if (err.message === "MẬT_KHẨU_CŨ_KHÔNG_CHÍNH_XÁC") {
        setError("Mật khẩu cũ không chính xác!");
      } else {
        setError(err.message || "Có lỗi xảy ra trong quá trình xoay vòng khóa.");
      }
      return false;
    } finally {
      // Dọn sạch vùng dữ liệu mật khẩu thô nhị phân tại Main Thread chống Memory Dump
      if (oldPassBuffer.byteLength > 0) MemoryWiper.wipe(oldPassBuffer);
      if (newPassBuffer.byteLength > 0) MemoryWiper.wipe(newPassBuffer);
      setIsLoading(false);
    }
  };

  /**
   * [PHASE 4] ĐĂNG KÝ VÂN TAY VÀ MÃ HÓA (WRAP) MASTER KEY
   */
  const enableBiometric = async (): Promise<boolean> => {
    if (!masterKeyRef.current || !activeDb || !vaultId) {
      setError("Két sắt phải đang mở khóa để kích hoạt sinh trắc học.");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      // 1. Kiểm tra phần cứng
      if (!(await WebAuthnPrfEngine.isSupported())) {
        throw new Error("Thiết bị hoặc trình duyệt hiện tại không hỗ trợ chuẩn WebAuthn PRF.");
      }

      // 2. Kích hoạt cảm biến vân tay/FaceID để đăng ký Credential + lấy KEK
      const { credentialId, prfSymmetricKey } = await WebAuthnPrfEngine.registerBiometric(
        vaultId,
        "Zero-Vault User",
      );

      // 3. Xuất Master Key hiện tại ra nhị phân thô trong RAM
      const rawMasterKey = await crypto.subtle.exportKey("raw", masterKeyRef.current);

      // 4. Mã hóa (Wrap) rawMasterKey bằng khóa KEK sinh trắc học (Dùng encryptRaw từ Phase 3!)
      const wrapped = await AesGcmEngine.encryptRaw(rawMasterKey, prfSymmetricKey);

      // 5. Cập nhật bảng meta trong IndexedDB
      const currentMeta = await activeDb.meta.get(META_ID);
      if (currentMeta) {
        await activeDb.meta.put({
          ...currentMeta,
          biometricCredentialId: credentialId,
          wrappedMasterKey: wrapped.cipherText,
          wrappedKeyIv: wrapped.iv,
        });

        localStorage.setItem("ZERO_VAULT_BIOMETRIC_DB", vaultId);
      }

      return true;
    } catch (err: any) {
      setError(err.message || "Không thể kích hoạt mở khóa bằng sinh trắc học.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * [PHASE 4] MỞ KHÓA KÉT SẮT BẰNG VÂN TAY / FACEID (~50ms - Zero PBKDF2!)
   */
  const unlockWithBiometric = async (dbInstance: DynamicVaultDatabase): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const meta = await dbInstance.meta.get(META_ID);
      if (!meta || !meta.biometricCredentialId || !meta.wrappedMasterKey || !meta.wrappedKeyIv) {
        throw new Error("Két sắt chưa được thiết lập mở khóa bằng sinh trắc học.");
      }

      // 1. Quét vân tay để lấy lại khóa KEK từ TPM
      const prfSymmetricKey = await WebAuthnPrfEngine.authenticateBiometric(
        meta.biometricCredentialId,
      );

      // 2. Giải mã (Unwrap) lấy lại Master Key nhị phân
      const rawMasterKeyBuffer = await AesGcmEngine.decryptRaw(
        { cipherText: meta.wrappedMasterKey, iv: meta.wrappedKeyIv },
        prfSymmetricKey,
      );

      // 3. Re-import thành CryptoKey hợp lệ
      const masterKey = await crypto.subtle.importKey(
        "raw",
        rawMasterKeyBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"],
      );

      // 4. Xác minh lại với Canary Verifier để đảm bảo an toàn tuyệt đối
      const decryptedCanary = await AesGcmEngine.decrypt(
        { cipherText: meta.canaryCipherText, iv: meta.canaryIv },
        masterKey,
      );
      if (decryptedCanary !== CANARY_STRING) throw new Error("Canary Verifier mismatch!");

      // 5. Mở khóa thành công! Nạp vào state
      masterKeyRef.current = masterKey;
      setActiveDb(dbInstance);
      await fetchAndDecryptVault(masterKey, dbInstance);

      return true;
    } catch (err: any) {
      setError(
        err.message || "Mở khóa bằng sinh trắc học thất bại. Vui lòng dùng mật khẩu Master.",
      );
      return false;
    } finally {
      setIsLoading(false);
    }
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
    updateSecret,
    deleteSecret,
    getSecretPassword,
    activeDb,
    vaultId,
    refreshVault,
    changePassword,
    enableBiometric,
    unlockWithBiometric
  };
}
