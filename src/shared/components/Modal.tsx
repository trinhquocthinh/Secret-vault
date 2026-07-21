// src/shared/components/Modal.tsx
import React from "react";
import { motion } from "framer-motion";

interface ModalProps {
  onClose: () => void;
  children: React.ReactNode;
  /** Giới hạn chiều rộng tối đa của khung modal (mặc định max-w-md). */
  maxWidthClassName?: string;
}

/**
 * Khung modal dùng chung cho toàn bộ ứng dụng: nền overlay mờ (click để đóng)
 * + khung kính (glassmorphism) căn giữa màn hình, có animation vào/ra bằng
 * Framer Motion. Nội dung bên trong (form, xác nhận...) do component cha quyết định.
 */
export const Modal: React.FC<ModalProps> = ({
  onClose,
  children,
  maxWidthClassName = "max-w-md",
}) => {
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
        className={`relative w-full ${maxWidthClassName} overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-[0_0_40px_rgba(0,0,0,0.5)]`}
      >
        {children}
      </motion.div>
    </div>
  );
};
