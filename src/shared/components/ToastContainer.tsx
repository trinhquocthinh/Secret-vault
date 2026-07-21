// src/shared/components/ToastContainer.tsx
import React from "react";
import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, AlertCircle, Info } from "lucide-react";
import type { Toast } from "../hooks/useToast";

interface ToastContainerProps {
  toasts: Toast[];
}

export const ToastContainer: React.FC<ToastContainerProps> = ({ toasts }) => (
  <div className="pointer-events-none fixed right-6 bottom-6 z-[100] flex flex-col gap-3">
    <AnimatePresence>
      {toasts.map((toast) => (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, x: 50, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className={`pointer-events-auto flex items-center gap-3 rounded-xl border px-4 py-3 shadow-lg backdrop-blur-md ${
            toast.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : toast.type === "error"
                ? "border-rose-500/30 bg-rose-500/10 text-rose-400"
                : "border-sky-500/30 bg-sky-500/10 text-sky-400"
          }`}
        >
          {toast.type === "success" && <CheckCircle2 size={18} />}
          {toast.type === "error" && <AlertCircle size={18} />}
          {toast.type === "info" && <Info size={18} />}
          <span className="max-w-xs text-sm font-medium">{toast.message}</span>
        </motion.div>
      ))}
    </AnimatePresence>
  </div>
);
