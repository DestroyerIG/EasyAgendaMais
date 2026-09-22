'use client';

import { useState, createContext, useContext, useCallback } from 'react';
import { X, CheckCircle, AlertCircle, Info } from 'lucide-react';

interface ToastMessage {
    id: number;
    type: 'success' | 'error' | 'info';
    message: string;
}

interface ToastContextType {
    showToast: (message: string, type?: 'success' | 'error' | 'info') => void;
}

const ToastContext = createContext<ToastContextType>({
    showToast: () => { }
});

export const useToast = () => useContext(ToastContext);

let toastId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'info') => {
        const id = ++toastId;
        setToasts(prev => [...prev, { id, type, message }]);
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const removeToast = (id: number) => {
        setToasts(prev => prev.filter(t => t.id !== id));
    };

    const icons = {
        success: <CheckCircle className="text-success" size={20} />,
        error: <AlertCircle className="text-danger" size={20} />,
        info: <Info className="text-status-confirmed" size={20} />
    };

    const borderColors = {
        success: 'border-success/30',
        error: 'border-danger/30',
        info: 'border-status-confirmed/30'
    };

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            <div className="fixed top-4 right-4 z-50 flex flex-col gap-3" aria-live="polite">
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        role="status"
                        className={`relative rounded-control border ${borderColors[toast.type]} bg-surface p-4 pr-10 text-ink shadow-lg min-w-[300px] max-w-[420px] animate-slide-in`}
                    >
                        <div className="flex items-start gap-3">
                            {icons[toast.type]}
                            <p className="text-[15px] leading-relaxed text-ink">{toast.message}</p>
                        </div>
                        <button
                            onClick={() => removeToast(toast.id)}
                            className="absolute top-3 right-3 text-muted transition-colors hover:text-ink"
                            aria-label="Fechar aviso"
                        >
                            <X size={16} />
                        </button>
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
}
