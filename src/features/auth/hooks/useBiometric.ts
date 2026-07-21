/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { DynamicVaultDatabase } from "../../../core/storage/dexie-client";

// Helper chuyển đổi ArrayBuffer sang Base64 chuỗi an toàn
const bufferToBase64 = (buffer: ArrayBuffer): string => {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
};

// Helper chuyển đổi Base64 sang ArrayBuffer
const base64ToBuffer = (base64: string): ArrayBuffer => {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
};

export const useBiometric = () => {
  const [isSupported, setIsSupported] = useState<boolean>(() => {
    return typeof window !== "undefined" && !!window.PublicKeyCredential;
  });

  const [hasBiometric, setHasBiometric] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    if (typeof window !== "undefined" && window.PublicKeyCredential) {
      window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then((available) => {
          if (isMounted) {
            setIsSupported(available);
          }
        })
        .catch(() => {
          if (isMounted) setIsSupported(false);
        });
    }
    return () => {
      isMounted = false;
    };
  }, []);

  const loadBiometricStatus = useCallback(async (): Promise<{
    db: DynamicVaultDatabase | null;
    hasBiometric: boolean;
  }> => {
    const savedDbName = localStorage.getItem("ZERO_VAULT_BIOMETRIC_DB");
    if (!savedDbName) {
      return { db: null, hasBiometric: false };
    }

    try {
      const tempDb = new DynamicVaultDatabase(savedDbName);
      await tempDb.open();
      // Phải trùng với META_ID ("VAULT_CONFIG") dùng xuyên suốt ứng dụng (useVault.ts,
      // dexie-client.ts) - trước đây dùng nhầm "ZERO_VAULT_META" (không bao giờ tồn tại)
      // khiến hasBiometric luôn bằng false dù đã bật sinh trắc học thành công.
      const meta = await tempDb.meta.get("VAULT_CONFIG");

      if (meta && meta.biometricCredentialId) {
        return { db: tempDb, hasBiometric: true };
      } else {
        tempDb.close();
        return { db: null, hasBiometric: false };
      }
    } catch (err) {
      console.warn("Không thể kiểm tra trạng thái sinh trắc học:", err);
      return { db: null, hasBiometric: false };
    }
  }, []);

  const checkBiometricStatus = useCallback(async (): Promise<DynamicVaultDatabase | null> => {
    const { db, hasBiometric } = await loadBiometricStatus();
    setHasBiometric(hasBiometric);
    return db;
  }, [loadBiometricStatus]);

  useEffect(() => {
    loadBiometricStatus().then(({ hasBiometric }) => {
      setHasBiometric(hasBiometric);
    });
  }, [loadBiometricStatus]);

  // 3. ĐĂNG KÝ VÂN TAY / FACEID MỚI
  const registerBiometric = async (
    dbInstance: DynamicVaultDatabase,
    userEmail: string = "user@zero-vault.local",
  ): Promise<boolean> => {
    if (!isSupported) {
      setError("Thiết bị của bạn không hỗ trợ hoặc chưa cài đặt Vân tay/FaceID.");
      return false;
    }

    setIsLoading(true);
    setError(null);

    try {
      const challenge = crypto.getRandomValues(new Uint8Array(32));
      const userId = crypto.getRandomValues(new Uint8Array(16));

      const publicKey: PublicKeyCredentialCreationOptions = {
        challenge,
        rp: {
          name: "Zero-Knowledge Vault",
          id: window.location.hostname,
        },
        user: {
          id: userId,
          name: userEmail,
          displayName: userEmail.split("@")[0] || "Vault User",
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" }, // ES256
          { alg: -257, type: "public-key" }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          requireResidentKey: false,
        },
        timeout: 60000,
      };

      const credential = (await navigator.credentials.create({
        publicKey,
      })) as PublicKeyCredential;

      if (!credential) {
        throw new Error("Không thể tạo thông tin xác thực sinh trắc học.");
      }

      const credentialId = bufferToBase64(credential.rawId);

      const currentMeta = await dbInstance.meta.get("VAULT_CONFIG");
      await dbInstance.meta.put({
        ...currentMeta,
        id: "VAULT_CONFIG",
        biometricCredentialId: credentialId,
      } as any);

      localStorage.setItem("ZERO_VAULT_BIOMETRIC_DB", dbInstance.name);
      setHasBiometric(true);
      return true;
    } catch (err: any) {
      console.error("Lỗi đăng ký sinh trắc học:", err);
      setError(err.message || "Đăng ký sinh trắc học thất bại hoặc bị hủy.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // 4. XÁC THỰC VÂN TAY / FACEID
  const verifyBiometric = async (dbInstance: DynamicVaultDatabase): Promise<boolean> => {
    setIsLoading(true);
    setError(null);

    try {
      const meta = await dbInstance.meta.get("VAULT_CONFIG");
      if (!meta || !meta.biometricCredentialId) {
        throw new Error("Chưa cấu hình sinh trắc học cho Két sắt này.");
      }

      const allowCredentials: PublicKeyCredentialDescriptor[] = [
        {
          id: base64ToBuffer(meta.biometricCredentialId),
          type: "public-key",
          transports: ["internal"],
        },
      ];

      const challenge = crypto.getRandomValues(new Uint8Array(32));

      const assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          allowCredentials,
          userVerification: "required",
          timeout: 60000,
        },
      });

      if (!assertion) {
        throw new Error("Xác thực sinh trắc học thất bại.");
      }

      return true;
    } catch (err: any) {
      console.error("Lỗi xác thực sinh trắc học:", err);
      setError("Xác thực vân tay/FaceID thất bại hoặc bị hủy.");
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // 5. HỦY KÍCH HOẠT SINH TRẮC HỌC
  const disableBiometric = async (dbInstance: DynamicVaultDatabase): Promise<void> => {
    try {
      const meta = await dbInstance.meta.get("VAULT_CONFIG");
      if (meta) {
        delete meta.biometricCredentialId;
        await dbInstance.meta.put(meta);
      }
      localStorage.removeItem("ZERO_VAULT_BIOMETRIC_DB");
      setHasBiometric(false);
    } catch (err) {
      console.error("Lỗi khi tắt sinh trắc học:", err);
    }
  };

  return {
    isSupported,
    hasBiometric,
    isLoading,
    error,
    registerBiometric,
    verifyBiometric,
    disableBiometric,
    checkBiometricStatus,
  };
};
