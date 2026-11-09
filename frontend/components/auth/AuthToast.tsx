import { useState } from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export function AuthToast({ message, error = false }: { message: string; error?: boolean }) {
    const [dismissed, setDismissed] = useState(false);
    const Icon = error ? AlertCircle : CheckCircle2;

    if (dismissed) return null;

    return (
        <div className="toast auth-toast" data-error={error}>
            <Icon className="auth-toast-icon" size={20} aria-hidden="true" />
            <div role={error ? 'alert' : 'status'}>{message}</div>
            <button type="button" className="icon-button" aria-label="Dismiss notification" onClick={() => setDismissed(true)}>
                <X size={16} aria-hidden="true" />
            </button>
        </div>
    );
}
