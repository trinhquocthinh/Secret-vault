/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useRef, useCallback, useEffect } from "react";

export function useClipboardWiper() {
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
    [clearClipboard],
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { copiedId, countdown, copyAndWipe, clearClipboard };
}
