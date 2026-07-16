// # Hook đếm ngược vòng tròn 30s thời gian thực

import { useState, useEffect, useRef, useCallback } from "react";
import { TotpEngine } from "../../../core/crypto/totp-engine";

export function useLiveTOTP(secretBase32?: string) {
  // ĐIỂM CHẠM SENIOR 1: Khởi tạo giá trị ban đầu bằng Lazy Initial State,
  // loại bỏ hoàn toàn việc gọi setOtp("------") đồng bộ trong useEffect.
  const [otp, setOtp] = useState<string>(() => (secretBase32 ? "Tính toán..." : "------"));

  // Tính toán thời gian ban đầu ngay lúc render thay vì đợi vào effect
  const [secondsLeft, setSecondsLeft] = useState<number>(() => {
    const now = Math.floor(Date.now() / 1000);
    return 30 - (now % 30);
  });

  const [progress, setProgress] = useState<number>(() => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = 30 - (now % 30);
    return (remaining / 30) * 100;
  });

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Hàm tính toán mã OTP (Bất đồng bộ - Async Web Crypto API)
  const generateCode = useCallback(async (secret: string) => {
    try {
      const code = await TotpEngine.generateTOTP(secret);
      setOtp(code);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    } catch (e) {
      setOtp("ERROR ");
    }
  }, []);

  useEffect(() => {
    // Nếu không có secret, đặt giá trị mặc định thông qua setTimeout(..., 0)
    // để tránh gọi setState đồng bộ (tránh lỗi Cascading Renders tại dòng 49)
    if (!secretBase32) {
      const timeoutId = setTimeout(() => {
        setOtp("------");
        setSecondsLeft(30);
        setProgress(100);
      }, 0);
      return () => clearTimeout(timeoutId);
    }

    // Kích hoạt tính toán mã OTP lần đầu tiên một cách bất đồng bộ
    const timeoutId = setTimeout(() => {
      generateCode(secretBase32);
    }, 0);

    // ĐIỂM CHẠM SENIOR 2: Thiết lập vòng lặp đếm ngược thời gian thực theo từng giây
    const tick = () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = 30 - (now % 30);

      setSecondsLeft(remaining);
      setProgress((remaining / 30) * 100);

      // Khi chu kỳ 30 giây mới bắt đầu (remaining === 30), mới tính toán lại mã OTP mới
      if (remaining === 30) {
        generateCode(secretBase32);
      }
    };

    timerRef.current = setInterval(tick, 1000);


    return () => {
      clearTimeout(timeoutId);
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [secretBase32, generateCode]);

  return { otp, secondsLeft, progress };
}
