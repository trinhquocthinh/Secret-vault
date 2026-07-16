// Thuật toán RFC 6238 tạo mã 2FA offline

import { MemoryWiper } from "./memory-wiper";

export class TotpEngine {
  /**
   * Bộ giải mã Base32 chuẩn RFC 4648 sang Uint8Array (Không dùng thư viện ngoài)
   */
  private static base32ToUint8Array(base32: string): Uint8Array {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    const cleaned = base32.toUpperCase().replace(/=+$/, "").replace(/\s+/g, "");
    const bytes: number[] = [];
    let buffer = 0;
    let bitsLeft = 0;

    for (const char of cleaned) {
      const val = alphabet.indexOf(char);
      if (val === -1) throw new Error(`Ký tự Base32 không hợp lệ: ${char}`);

      buffer = (buffer << 5) | val;
      bitsLeft += 5;

      if (bitsLeft >= 8) {
        bitsLeft -= 8;
        bytes.push((buffer >> bitsLeft) & 0xff);
      }
    }
    return new Uint8Array(bytes);
  }

  /**
   * Chuyển bộ đếm thời gian T thành mảng nhị phân 8-byte Big-Endian
   */
  private static intTo8ByteArray(counter: number): Uint8Array {
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    // RFC 6238 yêu cầu số nguyên 64-bit Big-Endian
    view.setBigUint64(0, BigInt(counter), false);
    return new Uint8Array(buffer);
  }

  /**
   * Sinh mã OTP 6 chữ số hoàn toàn offline từ Secret Base32 và thời gian hệ thống
   */
  public static async generateTOTP(secretBase32: string, step = 30): Promise<string> {
    const secretBytes = this.base32ToUint8Array(secretBase32);
    const currentEpoch = Math.floor(Date.now() / 1000);
    const counter = Math.floor(currentEpoch / step);
    const counterBytes = this.intTo8ByteArray(counter);

    try {
      // 1. Import Secret Key vào Web Crypto API (HMAC-SHA1)
      const cryptoKey = await globalThis.crypto.subtle.importKey(
        "raw",
        secretBytes as BufferSource, // FIX lỗi TypeScript Strict
        { name: "HMAC", hash: { name: "SHA-1" } },
        false,
        ["sign"],
      );

      // 2. Ký HMAC-SHA1 với bộ đếm thời gian T
      const signatureBuffer = await globalThis.crypto.subtle.sign("HMAC", cryptoKey, counterBytes as BufferSource);
      const hash = new Uint8Array(signatureBuffer);

      // 3. Dynamic Truncation (Thuật toán cắt bit RFC 4226)
      const offset = hash[hash.length - 1] & 0xf;
      const binary =
        ((hash[offset] & 0x7f) << 24) |
        ((hash[offset + 1] & 0xff) << 16) |
        ((hash[offset + 2] & 0xff) << 8) |
        (hash[offset + 3] & 0xff);

      const otp = (binary % 1000000).toString().padStart(6, "0");

      // Xóa bộ nhớ tạm của chữ ký HMAC
      MemoryWiper.wipe(hash);
      return otp;
    } finally {
      // ĐIỂM CHẠM SENIOR: Lập tức xóa sạch Secret Key thô nhị phân khỏi RAM
      MemoryWiper.wipe(secretBytes);
      MemoryWiper.wipe(counterBytes);
    }
  }
}
