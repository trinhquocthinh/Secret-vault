// PBKDF2 / Argon2id engine
import { MemoryWiper } from "./memory-wiper";

export interface DerivedKeyResult {
  key: CryptoKey;
  salt: Uint8Array;
}

const PBKDF2_ITERATIONS = 600000; // Tiêu chuẩn OWASP 2023+ cho SHA-256
const SALT_BYTE_LENGTH = 16;
const KEY_LENGTH_BITS = 256;

export class KeyDerivationEngine {
  /**
   * Sinh Salt ngẫu nhiên bằng trình tạo số ngẫu nhiên mật mã học (CSPRNG).
   */
  public static generateSalt(): Uint8Array {
    return globalThis.crypto.getRandomValues(new Uint8Array(SALT_BYTE_LENGTH));
  }

  /**
   * Chuyển đổi Master Password từ dạng văn bản sang CryptoKey 256-bit.
   */
  public static async deriveKey(passwordBuffer: Uint8Array, salt?: Uint8Array): Promise<DerivedKeyResult> {
    const actualSalt = salt || this.generateSalt();

    try {
      // 1. Import mật khẩu thô vào Web Crypto API
      const baseKey = await globalThis.crypto.subtle.importKey(
        "raw",
        passwordBuffer as BufferSource,
        { name: "PBKDF2" },
        false,
        ["deriveKey"],
      );

      // 2. Dẫn xuất khóa AES-GCM 256-bit qua 600,000 vòng lặp PBKDF2
      const derivedKey = await globalThis.crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: actualSalt as BufferSource,
          iterations: PBKDF2_ITERATIONS,
          hash: "SHA-256",
        },
        baseKey,
        {
          name: "AES-GCM",
          length: KEY_LENGTH_BITS,
        },
        false, // KHÔNG CHO PHÉP export khóa này ngược lại ra plaintext (Zero-Knowledge)
        ["encrypt", "decrypt"],
      );

      return {
        key: derivedKey,
        salt: actualSalt,
      };
    } finally {
      // Lập tức xóa sạch buffer chứa mật khẩu thô trong RAM
      MemoryWiper.wipe(passwordBuffer);
    }
  }
}
