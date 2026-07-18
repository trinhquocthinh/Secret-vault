/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useRef, useCallback, useEffect } from "react";

const WARNING_SESSION_KEY = "ZERO_VAULT_CLIPBOARD_HISTORY_WARNED";
const WARNING_MESSAGE =
  "⚠️ Lưu ý bảo mật: Hãy tắt chức năng Clipboard History (Windows + V) hoặc các ứng dụng quản lý clipboard bên thứ ba để tránh lộ mật khẩu trong lịch sử hệ điều hành.";

interface UseClipboardWiperOptions {
  /** Callback được gọi duy nhất 1 lần mỗi phiên (session) để UI hiển thị cảnh báo cho người dùng */
  onFirstCopyWarning?: (message: string) => void;
}

export function useClipboardWiper(options?: UseClipboardWiperOptions) {
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [countdown, setCountdown] = useState<number>(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastCopiedTextRef = useRef<string>("");

  const clearClipboard = useCallback(async () => {
    try {
      const currentClip = await navigator.clipboard.readText();
      // Chỉ xóa nếu clipboard hiện tại vẫn là mật khẩu vừa copy (tránh xóa nhầm data mới của user)
      if (currentClip === lastCopiedTextRef.current && lastCopiedTextRef.current !== "") {
        await navigator.clipboard.writeText(" "); // Ghi đè bằng khoảng trắng
      }
    } catch (error) {
      // Trình duyệt có thể chặn readText nếu mất focus, fallback ghi đè trực tiếp
      await navigator.clipboard.writeText(" ");
    } finally {
      lastCopiedTextRef.current = "";
      setCopiedId(null);
      setCountdown(0);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  }, []);

  const copyAndWipe = useCallback(
    async (id: string, textToCopy: string) => {
      await navigator.clipboard.writeText(textToCopy);
      lastCopiedTextRef.current = textToCopy;
      setCopiedId(id);
      setCountdown(30);

      // 1. KIỂM TRA CỜ CẢNH BÁO TRONG SESSION STORAGE (Chỉ nhắc 1 lần duy nhất mỗi phiên tải trang)
      if (!sessionStorage.getItem(WARNING_SESSION_KEY)) {
        sessionStorage.setItem(WARNING_SESSION_KEY, "true");
        if (options?.onFirstCopyWarning) {
          options.onFirstCopyWarning(WARNING_MESSAGE);
        } else {
          // Fallback mặc định nếu UI không truyền callback: Dùng thông báo console/alert nhẹ
          console.warn(WARNING_MESSAGE);
        }
      }

      // Xóa timer cũ nếu đang chạy
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);

      // Đếm ngược từng giây để hiển thị UI Progress
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(intervalRef.current!);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      // Hẹn giờ 30s cưỡng chế xóa clipboard
      timerRef.current = setTimeout(() => {
        clearClipboard();
      }, 30000);
    },
    [clearClipboard, options],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { copiedId, countdown, copyAndWipe, clearClipboard };
}
