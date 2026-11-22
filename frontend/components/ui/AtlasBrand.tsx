'use client';

export function AtlasBrand({ size = 34 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Atlas" style={{ flexShrink: 0 }}>
            <defs>
                <linearGradient id="atlas-brand-purple" x1="0" y1="1" x2="1" y2="0">
                    <stop offset="0" stopColor="#4869fa" />
                    <stop offset=".55" stopColor="#6948f3" />
                    <stop offset="1" stopColor="#c17ae8" />
                </linearGradient>
            </defs>
            <path d="M7 49 28 14c2-4 6-4 9 0l20 35h-12L32 27 19 49H7Z" fill="url(#atlas-brand-purple)" />
            <path d="m28 49 12-18 10 18H38l-4-7-5 7h-1Z" fill="#a770ed" />
        </svg>
    );
}
