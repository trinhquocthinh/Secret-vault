/* eslint-disable @typescript-eslint/no-explicit-any */
import type { DerivedKeyResult } from "./key-derivation";

interface PendingTask {
  resolve: (result: DerivedKeyResult) => void;
  reject: (reason: any) => void;
}

export class KeyDerivationWorkerClient {
  private static workerInstance: Worker | null = null;
  private static pendingTasks = new Map<string, PendingTask>();

  /**
   * Khởi tạo Singleton cho Web Worker theo chuẩn module của Vite
   */
  private static getWorker(): Worker {
    if (!this.workerInstance) {
      // Khởi tạo worker với type: module để hỗ trợ import TypeScript bên trong worker
      this.workerInstance = new Worker(new URL("./crypto.worker.ts", import.meta.url), {
        type: "module",
      });

      // Lắng nghe sự kiện trả về từ Worker
      this.workerInstance.onmessage = (e: MessageEvent) => {
        const { id, success, key, salt, error } = e.data;
        const task = this.pendingTasks.get(id);

        if (task) {
          this.pendingTasks.delete(id);
          if (success) {
            task.resolve({ key, salt });
          } else {
            task.reject(new Error(error || "Lỗi dẫn xuất khóa trên Web Worker"));
          }
        }
      };

      this.workerInstance.onerror = (err) => {
        console.error("Web Worker System Error:", err);
      };
    }
    return this.workerInstance;
  }

  /**
   * Đẩy tác vụ PBKDF2 sang Worker bằng cơ chế Zero-Copy Transferables
   */
  public static async deriveKey(
    passwordBuffer: Uint8Array,
    salt?: Uint8Array,
  ): Promise<DerivedKeyResult> {
    const worker = this.getWorker();
    const id = crypto.randomUUID();

    return new Promise<DerivedKeyResult>((resolve, reject) => {
      this.pendingTasks.set(id, { resolve, reject });

      // ĐIỂM CHẠM SENIOR: Đưa passwordBuffer.buffer vào danh sách Transferables (mảng thứ 2).
      // Quyền sở hữu vùng nhớ bị tước khỏi Main Thread lập tức!
      worker.postMessage(
        { id, passwordBuffer, salt },
        [passwordBuffer.buffer], // <-- ZERO-COPY MEMORY DETACHMENT
      );
    });
  }
}
