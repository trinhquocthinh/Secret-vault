import { useRef, useEffect } from "react";

const INACTIVITY_TIMEOUT_MS = 5 * 60 * 1000; // 5 Phút

export function useAutoLock(onLock: () => void, isUnlocked: boolean) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isUnlocked) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onLock();
      }, INACTIVITY_TIMEOUT_MS);
    };

    const events = ["mousemove", "mousedown", "keydown", "touchstart", "scroll"];

    // Gán event listeners
    events.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer(); // Kích hoạt lần đầu

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      events.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [isUnlocked, onLock]);
}
