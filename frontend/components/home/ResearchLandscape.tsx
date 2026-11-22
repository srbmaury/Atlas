import { useId } from 'react';

/** Decorative, resolution-independent mountain artwork for the research landing page. */
export function ResearchLandscape() {
    const id = useId().replace(/:/g, '');
    return (
        <svg className="atlas-reference-landscape" viewBox="0 0 1200 280" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">
            <defs>
                <linearGradient id={`sky-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f5f0ff" />
                    <stop offset="65%" stopColor="#f8f4fb" />
                    <stop offset="100%" stopColor="#eef1ff" />
                </linearGradient>
                <linearGradient id={`back-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#c7c9eb" />
                    <stop offset="100%" stopColor="#e3dff1" />
                </linearGradient>
                <linearGradient id={`front-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#acbce7" />
                    <stop offset="100%" stopColor="#dfe6fb" />
                </linearGradient>
                <linearGradient id={`fade-${id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="white" stopOpacity="0" />
                    <stop offset="100%" stopColor="white" stopOpacity=".9" />
                </linearGradient>
            </defs>
            <path fill={`url(#sky-${id})`} d="M0 0H1200V280H0Z" />
            <path fill={`url(#back-${id})`} d="M0 240 70 196 94 209 148 146 174 171 209 117 248 160 290 149 342 194 391 152 422 174 469 124 516 170 560 135 621 178 673 141 722 177 774 129 830 173 891 90 936 149 985 116 1039 161 1096 102 1153 160 1200 137V280H0Z" />
            <path fill="#f8f5ff" d="M148 146 172 164 179 156 209 117 229 144 218 140 209 129 189 156 174 170ZM462 132 471 123 492 144 517 170 491 153 474 148ZM875 112 891 90 927 139 910 128 900 113 892 123ZM1081 127 1096 102 1128 140 1112 134 1097 121Z" />
            <path fill="#c2c6e9" d="M0 264 45 218 85 248 146 199 195 254 239 206 288 238 345 192 395 231 441 202 493 243 537 197 591 238 637 207 692 239 742 189 796 236 843 193 891 222 943 181 995 229 1044 185 1102 231 1147 205 1200 238V280H0Z" />
            <path fill={`url(#front-${id})`} d="M0 280 0 250 69 202 98 231 160 177 213 251 265 227 325 252 373 212 431 250 486 217 553 260 606 215 660 250 714 221 767 256 819 206 868 244 935 164 996 240 1050 191 1111 248 1162 210 1200 237V280Z" />
            <path fill="#fff" opacity=".9" d="M58 214 69 202 91 228 79 223 70 213 64 222ZM137 204 160 177 183 208 171 199 163 191 154 206ZM354 230 373 212 397 231 379 225 375 221ZM794 228 819 206 844 232 826 224 820 217ZM913 187 935 164 971 212 953 199 939 179 929 191ZM1034 215 1050 191 1073 217 1058 211 1051 202Z" />
            <path fill={`url(#fade-${id})`} d="M0 176H1200V280H0Z" />
        </svg>
    );
}
