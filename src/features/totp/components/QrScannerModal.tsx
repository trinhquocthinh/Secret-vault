// src/features/totp/components/QrScannerModal.tsx
import React, { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { motion } from "framer-motion";
import { AlertCircle, ScanLine, ShieldCheck, X } from "lucide-react";

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-[0_0_40px_rgba(0,0,0,0.5)]"
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <h3 className="flex items-center gap-2 text-lg font-bold text-white">
            <ScanLine size={18} className="text-emerald-400" /> Quét Mã QR 2FA (TOTP)
          </h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 p-6">
          {error ? (
            <div className="flex items-start gap-2 rounded-lg border border-rose-800 bg-rose-950/40 p-4 text-sm text-rose-300">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          ) : (
            <div className="relative aspect-square overflow-hidden rounded-xl border border-slate-700 bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" />
              <canvas ref={canvasRef} className="hidden" />
              {/* UI Khung quét nhắm mục tiêu */}
              <div className="pointer-events-none absolute inset-8 flex animate-pulse items-center justify-center rounded-lg border-2 border-emerald-400/80 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
                <span className="rounded bg-slate-900/80 px-2 py-1 text-xs text-emerald-400">
                  Đưa mã QR vào khung
                </span>
              </div>
            </div>
          )}

          <p className="flex items-center justify-center gap-1.5 text-center text-xs text-slate-400">
            <ShieldCheck size={14} className="text-emerald-500" />
            Dữ liệu video được xử lý 100% offline tại trình duyệt bằng jsQR, không gửi lên bất kỳ
            máy chủ nào.
          </p>
        </div>
      </motion.div>
    </div>
  );
};
