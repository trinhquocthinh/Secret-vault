import { useRef, useEffect, useState } from "react";

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 Phút
const INACTIVITY_TIMEOUT_SECONDS = INACTIVITY_TIMEOUT_MS / 1000;

export function useAutoLock(onLock: () => void, isUnlocked: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Giây còn lại trước khi tự khóa - dùng để hiển thị đồng hồ đếm ngược trên UI
  const [remainingSeconds, setRemainingSeconds] = useState(INACTIVITY_TIMEOUT_SECONDS);

  // Luôn giữ bản mới nhất của onLock trong ref thay vì đưa thẳng vào dependency
  // array của effect bên dưới. Nếu không, vì remainingSeconds cập nhật mỗi giây
  // khiến component cha re-render và tạo ra một hàm onLock MỚI mỗi lần, effect
  // sẽ bị hủy + chạy lại liên tục -> resetTimer() bị gọi lại mỗi giây -> đồng hồ
  // luôn bị kéo về lại 5:00 dù người dùng không hề tương tác (bug đã gặp phải).
  const onLockRef = useRef(onLock);
  useEffect(() => {
    onLockRef.current = onLock;
  }, [onLock]);

  useEffect(() => {
    if (!isUnlocked) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);

      setRemainingSeconds(INACTIVITY_TIMEOUT_SECONDS);
      intervalRef.current = setInterval(() => {
        setRemainingSeconds((prev) => (prev > 0 ? prev - 1 : 0));
      }, 1000);

      timerRef.current = setTimeout(() => {
        onLockRef.current();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

    // Gán event listeners
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer(); // Kích hoạt lần đầu

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      if (intervalRef.current) clearInterval(intervalRef.current);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isUnlocked]);

  return { remainingSeconds };
}
