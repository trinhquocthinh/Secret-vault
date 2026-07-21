// src/shared/hooks/useToast.ts
import { useCallback, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

/**
 * Quản lý danh sách thông báo Toast nổi (auto-dismiss sau 3s).
 * Dùng thay cho window.alert() để không chặn luồng tương tác của người dùng.
 */
export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = useCallback((message: string, type: ToastType = "info") => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  return { toasts, showToast };
}
