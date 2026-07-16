// src/features/vault/components/VaultDashboard.tsx
import React, { useState } from 'react';
import { useVault } from '../hooks/useVault';
import { useClipboardWiper } from '../hooks/useClipboardWiper';
import { useAutoLock } from '../../security/hooks/useAutoLock';
import { SecretCard } from './SecretCard';
import { UnlockModal } from '../../auth/components/UnlockModal';

export const VaultDashboard: React.FC = () => {
    const { isUnlocked, isLoading, error, secrets, unlockVault, lockVault, addSecret, getSecretPassword } = useVault();
    const { copiedId, countdown, copyAndWipe } = useClipboardWiper();

    // Tự động khóa app sau 5 phút không có thao tác chuột/bàn phím
    useAutoLock(lockVault, isUnlocked);

    // Form state thêm mật khẩu
    const [title, setTitle] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [isAdding, setIsAdding] = useState(false);

    const handleCopyPassword = async (id: string) => {
        // Giải mã lazy-load đúng mật khẩu của item này và đẩy vào Clipboard Wiper
        const plainPass = await getSecretPassword(id);
        await copyAndWipe(id, plainPass);
    };

    const handleAddSecret = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!title || !password) return;
        setIsAdding(true);
        try {
            await addSecret({ title, username, password });
            setTitle('');
            setUsername('');
            setPassword('');
        } finally {
            setIsAdding(false);
        }
    };

    if (!isUnlocked) {
        return <UnlockModal onUnlock={unlockVault} isLoading={isLoading} error={error} />;
    }

    return (
        <div className="min-h-screen pb-12 text-slate-100 bg-slate-950">
            {/* Top Navbar */}
            <header className="sticky top-0 z-10 border-b bg-slate-950/80 backdrop-blur-md border-slate-800">
                <div className="flex items-center justify-between max-w-4xl px-4 py-3 mx-auto">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        <span className="font-bold tracking-tight text-white">Zero-Knowledge Vault</span>
                        <span className="text-xs px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            AES-GCM 256
                        </span>
                    </div>

                    <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-400">
                            Auto-lock: <strong className="text-slate-200">5 phút</strong>
                        </span>
                        <button
                            onClick={lockVault}
                            className="px-3 py-1.5 text-xs font-semibold text-rose-300 transition-colors bg-rose-950/40 border border-rose-800/60 rounded-md hover:bg-rose-900/50"
                        >
                            Khóa Ngay (Lock)
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Container */}
            <main className="max-w-4xl px-4 mt-8 mx-auto space-y-8">
                {/* Form thêm bản ghi */}
                <div className="p-6 border rounded-xl bg-slate-900 border-slate-800">
                    <h2 className="mb-4 text-base font-semibold text-white">Thêm mật khẩu bí mật mới</h2>
                    <form onSubmit={handleAddSecret} className="grid grid-cols-1 gap-4 md:grid-cols-3">
                        <input
                            type="text"
                            placeholder="Tiêu đề (VD: GitHub, Bank)..."
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            className="px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-emerald-500"
                            required
                        />
                        <input
                            type="text"
                            placeholder="Username / Email..."
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            className="px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-emerald-500"
                        />
                        <div className="flex gap-2">
                            <input
                                type="password"
                                placeholder="Mật khẩu..."
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-lg focus:outline-none focus:border-emerald-500"
                                required
                            />
                            <button
                                type="submit"
                                disabled={isAdding}
                                className="px-4 py-2 text-sm font-medium text-white transition-colors rounded-lg bg-emerald-600 hover:bg-emerald-500 whitespace-nowrap disabled:opacity-50"
                            >
                                {isAdding ? "Đang lưu..." : "Mã Hóa & Lưu"}
                            </button>
                        </div>
                    </form>
                </div>

                {/* Danh sách bản ghi */}
                <div className="space-y-3">
                    <h2 className="text-sm font-semibold tracking-wider uppercase text-slate-400">
                        Danh sách đã lưu ({secrets.length})
                    </h2>
                    {secrets.length === 0 ? (
                        <div className="py-12 text-center border border-dashed rounded-xl border-slate-800 text-slate-500">
                            Chưa có mật khẩu nào trong Két sắt. Hãy thêm bản ghi đầu tiên ở trên!
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-3">
                            {secrets.map((item) => (
                                <SecretCard
                                    key={item.id}
                                    item={item}
                                    onCopyPassword={handleCopyPassword}
                                    isCopyingId={copiedId}
                                    countdown={countdown}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>
        </div>
    );
};