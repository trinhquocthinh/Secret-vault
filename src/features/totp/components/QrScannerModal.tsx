// src/features/totp/components/QrScannerModal.tsx
import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

interface QrScannerModalProps {
  onScanSuccess: (totpSecret: string, accountLabel?: string) => void;
  onClose: () => void;
}

export const QrScannerModal: React.FC<QrScannerModalProps> = ({ onScanSuccess, onClose }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    let stream: MediaStream | null = null;

    const startCamera = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.setAttribute("playsinline", "true");
          videoRef.current.play();
          requestAnimationFrame(tick);
        }
      } catch (err) {
        setError(
          `Không thể truy cập Camera. Vui lòng cấp quyền hoặc gõ tay Secret Key. Lỗi: ${err}`,
        );
      }
    };

    const tick = () => {
      if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (canvas) {
          const ctx = canvas.getContext("2d");
          canvas.height = video.videoHeight;
          canvas.width = video.videoWidth;
          ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

          const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
          if (imageData) {
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data.startsWith("otpauth://")) {
              // Phân tích chuỗi URI chuẩn: otpauth://totp/GitHub:senior_dev?secret=JBSWY...&issuer=GitHub
              try {
                const url = new URL(code.data);
                const secret = url.searchParams.get("secret");
                const label = decodeURIComponent(
                  url.pathname.replace("//totp/", "").replace("/totp/", ""),
                );

                if (secret) {
                  onScanSuccess(secret, label);
                  onClose();
                  return;
                }
              } catch (e) {
                console.error("Lỗi parse chuỗi QR URI", e);
              }
            }
          }
        }
      }
      animationFrameRef.current = requestAnimationFrame(tick);
    };

    startCamera();

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current);
      if (stream) stream.getTracks().forEach((track) => track.stop());
    };
  }, [onScanSuccess, onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Quét Mã QR 2FA (TOTP)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            ✕
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-300">
            {error}
          </div>
        ) : (
          <div className="relative aspect-square overflow-hidden rounded-lg border border-slate-700 bg-black">
            <video ref={videoRef} className="h-full w-full object-cover" />
            <canvas ref={canvasRef} className="hidden" />
            {/* UI Khung quét nhắm mục tiêu */}
            <div className="pointer-events-none absolute inset-8 flex animate-pulse items-center justify-center rounded-lg border-2 border-emerald-400/80">
              <span className="rounded bg-slate-900/80 px-2 py-1 text-xs text-emerald-400">
                Đưa mã QR vào khung
              </span>
            </div>
          </div>
        )}

        <p className="text-center text-xs text-slate-400">
          Dữ liệu video được xử lý 100% offline tại trình duyệt bằng jsQR, không gửi lên bất kỳ máy
          chủ nào.
        </p>
      </div>
    </div>
  );
};
