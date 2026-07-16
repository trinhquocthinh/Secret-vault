// src/features/totp/components/QrScannerModal.tsx
import React, { useEffect, useRef, useState } from 'react';
import jsQR from 'jsqr';

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
                stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.setAttribute('playsinline', 'true');
                    videoRef.current.play();
                    requestAnimationFrame(tick);
                }
            } catch (err) {
                setError(`Không thể truy cập Camera. Vui lòng cấp quyền hoặc gõ tay Secret Key. Lỗi: ${err}`);
            }
        };

        const tick = () => {
            if (videoRef.current && videoRef.current.readyState === videoRef.current.HAVE_ENOUGH_DATA) {
                const video = videoRef.current;
                const canvas = canvasRef.current;
                if (canvas) {
                    const ctx = canvas.getContext('2d');
                    canvas.height = video.videoHeight;
                    canvas.width = video.videoWidth;
                    ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);

                    const imageData = ctx?.getImageData(0, 0, canvas.width, canvas.height);
                    if (imageData) {
                        const code = jsQR(imageData.data, imageData.width, imageData.height);
                        if (code && code.data.startsWith('otpauth://')) {
                            // Phân tích chuỗi URI chuẩn: otpauth://totp/GitHub:senior_dev?secret=JBSWY...&issuer=GitHub
                            try {
                                const url = new URL(code.data);
                                const secret = url.searchParams.get('secret');
                                const label = decodeURIComponent(url.pathname.replace('//totp/', '').replace('/totp/', ''));

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
            if (stream) stream.getTracks().forEach(track => track.stop());
        };
    }, [onScanSuccess, onClose]);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
            <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-2xl space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="font-bold text-white text-lg">Quét Mã QR 2FA (TOTP)</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-white">✕</button>
                </div>

                {error ? (
                    <div className="p-4 bg-rose-950/40 border border-rose-800 text-rose-300 text-sm rounded-lg">
                        {error}
                    </div>
                ) : (
                    <div className="relative aspect-square bg-black rounded-lg overflow-hidden border border-slate-700">
                        <video ref={videoRef} className="w-full h-full object-cover" />
                        <canvas ref={canvasRef} className="hidden" />
                        {/* UI Khung quét nhắm mục tiêu */}
                        <div className="absolute inset-8 border-2 border-emerald-400/80 rounded-lg pointer-events-none animate-pulse flex items-center justify-center">
                            <span className="text-xs bg-slate-900/80 text-emerald-400 px-2 py-1 rounded">Đưa mã QR vào khung</span>
                        </div>
                    </div>
                )}

                <p className="text-xs text-slate-400 text-center">
                    Dữ liệu video được xử lý 100% offline tại trình duyệt bằng jsQR, không gửi lên bất kỳ máy chủ nào.
                </p>
            </div>
        </div>
    );
};