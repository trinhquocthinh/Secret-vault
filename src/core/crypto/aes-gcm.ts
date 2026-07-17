// Logic mã hóa/giải mã AES-GCM native

import { MemoryWiper } from "./memory-wiper";

const IV_BYTE_LENGTH = 12; // 96-bit là độ dài tối ưu và an toàn nhất cho AES-GCM IV

export interface EncryptedPayload {
  cipherText: ArrayBuffer;
  iv: Uint8Array;
}

export class AesGcmEngine {
  /**
   * Mã hóa một chuỗi văn bản (Plaintext JSON) thành nhị phân đã mã hóa (Ciphertext).
   * Mỗi lần mã hóa LUÔN sinh ra một IV ngẫu nhiên mới.
   */
  public static async encrypt(plaintext: string, key: CryptoKey): Promise<EncryptedPayload> {
    const encoder = new TextEncoder();
    const encodedData = encoder.encode(plaintext);

    // Sinh IV ngẫu nhiên cho lần mã hóa này
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTE_LENGTH));

    try {
      const cipherText = await globalThis.crypto.subtle.encrypt(
        {
          name: "AES-GCM",
          iv: iv,
        },
        key,
        encodedData,
      );

      return {
        cipherText,
        iv,
      };
    } finally {
      // Xóa bản rõ nhị phân ngay sau khi mã hóa xong
      MemoryWiper.wipe(encodedData);
    }
  }

  /**
   * Giải mã Ciphertext về lại chuỗi JSON Plaintext ban đầu.
   */
  public static async decrypt(payload: EncryptedPayload, key: CryptoKey): Promise<string> {
    try {
      const decryptedBuffer = await globalThis.crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: payload.iv as BufferSource,
        },
        key,
        payload.cipherText,
      );

      const decoder = new TextDecoder();
      const plaintext = decoder.decode(decryptedBuffer);

      // Xóa vùng nhớ đệm sau khi đã convert sang string
      MemoryWiper.wipeArrayBuffer(decryptedBuffer);

      return plaintext;
    } catch (error) {
      throw new Error(
        "Giải mã thất bại: Khóa không đúng hoặc dữ liệu đã bị can thiệp trái phép (Tampered Data).",
        {
          cause: error,
        },
      );
    }
  }
}
