import { KeyDerivationEngine } from "./key-derivation";
import { MemoryWiper } from "./memory-wiper";

interface WorkerRequest {
  id: string;
  passwordBuffer: Uint8Array;
  salt?: Uint8Array;
}

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const { id, passwordBuffer, salt } = e.data;

  try {
    // Gọi trực tiếp engine dẫn xuất PBKDF2 600,000 vòng lặp trên luồng phụ
    const { key, salt: actualSalt } = await KeyDerivationEngine.deriveKey(passwordBuffer, salt);

    // Lưu ý: Thuật toán Structured Clone của trình duyệt hiện đại cho phép
    // gửi trả object CryptoKey (với extractable: false) qua postMessage một cách an toàn!
    self.postMessage({
      id,
      success: true,
      key,
      salt: actualSalt,
    });
  } catch (error) {
    self.postMessage({
      id,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    // Cưỡng chế ghi đè 0x00 lên vùng nhớ RAM của Worker ngay sau khi dẫn xuất xong
    // (Bản thân KeyDerivationEngine.deriveKey đã có finally wipe, gọi thêm ở đây là Defense-in-Depth)
    if (passwordBuffer.byteLength > 0) {
      MemoryWiper.wipe(passwordBuffer);
    }
  }
};
