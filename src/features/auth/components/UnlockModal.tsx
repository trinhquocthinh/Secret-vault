// src/features/auth/components/UnlockModal.tsx
import React, { useState } from 'react';

interface UnlockModalProps {
    onUnlock: (password: string) => Promise<boolean>;
    isLoading: boolean;
    error: string | null;
}

export const UnlockModal: React.FC<UnlockModalProps> = ({ onUnlock, isLoading, error }) => {
    const [password, setPassword] = useState('');

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password) return;
        const success = await onUnlock(password);
        if (success) setPassword(''); // Xóa RAM state ngay sau khi mở khóa thành công
    };

    return (
        <div className="flex items-center justify-center min-h-screen px-4 bg-slate-950">
            <div className="w-full max-w-md p-8 border shadow-2xl bg-slate-900 border-slate-800 rounded-xl">
                <div className="mb-6 text-center">
                    <div className="inline-flex items-center justify-center w-12 h-12 mb-4 rounded-full bg-emerald-500/10 text-emerald-400">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                    </div>
                    <h1 className="text-2xl font-bold text-white">Zero-Knowledge Vault</h1>
                    <p className="mt-1 text-sm text-slate-400">Nhập Master Password để giải mã bộ nhớ cục bộ</p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                            Master Password
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Nhập mật khẩu chính..."
                            className="w-full px-3.5 py-2.5 text-white bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition-all"
                            autoFocus
                        />
                    </div>

                    {error && (
                        <div className="p-3 text-xs border rounded-md text-rose-400 bg-rose-950/30 border-rose-900/50">
                            {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={isLoading || !password}
                        className="w-full py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 focus:ring-offset-slate-900 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {isLoading ? "Đang dẫn xuất khóa PBKDF2..." : "Mở Khóa Két Sắt"}
                    </button>
                </form>
            </div>
        </div>
    );
};