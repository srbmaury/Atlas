'use client';

import type { ReactNode, Ref } from 'react';
import { TextField } from '@mui/material';

interface ResearchQuestionBoxProps {
    ariaLabel?: string;
    className?: string;
    query: string;
    onQueryChange: (value: string) => void;
    onRequestSubmit: () => void;
    canSubmit: boolean;
    busy: boolean;
    inputRef?: Ref<HTMLTextAreaElement>;
    inputLabel: string;
    placeholder: string;
    maxRows?: number;
    sourceSelector: ReactNode;
    context?: ReactNode;
    leadingActions: ReactNode;
    trailingActions: ReactNode;
    footer?: ReactNode;
}

export function ResearchQuestionBox({
    ariaLabel,
    className = '',
    query,
    onQueryChange,
    onRequestSubmit,
    canSubmit,
    busy,
    inputRef,
    inputLabel,
    placeholder,
    maxRows = 8,
    sourceSelector,
    context,
    leadingActions,
    trailingActions,
    footer,
}: ResearchQuestionBoxProps) {
    return (
        <form
            aria-label={ariaLabel}
            className={`atlas-question-box ${className}`.trim()}
            onSubmit={(event) => {
                event.preventDefault();
                if (canSubmit) onRequestSubmit();
            }}
        >
            {context}
            <div className="atlas-ref-composer-toolbar">
                <span className="atlas-ref-composer-label">Research question</span>
                <div className="atlas-ref-composer-source">{sourceSelector}</div>
            </div>
            <div className="atlas-question-box-input">
                <TextField
                    inputRef={inputRef}
                    variant="standard"
                    placeholder={placeholder}
                    value={query}
                    onChange={(event) => onQueryChange(event.target.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                            event.preventDefault();
                            if (canSubmit) onRequestSubmit();
                        }
                    }}
                    multiline
                    minRows={1}
                    maxRows={maxRows}
                    fullWidth
                    disabled={busy}
                    slotProps={{ input: { disableUnderline: true }, htmlInput: { maxLength: 4000, 'aria-label': inputLabel } }}
                    sx={{ minWidth: 0, '& .MuiInputBase-root': { alignItems: 'flex-start' }, '& textarea': { fontSize: 15, lineHeight: 1.65 } }}
                />
            </div>
            <div className="atlas-ref-composer-bottom">
                <div className="atlas-ref-pills">{leadingActions}</div>
                <div className="atlas-question-box-trailing">{trailingActions}</div>
            </div>
            {footer}
        </form>
    );
}
