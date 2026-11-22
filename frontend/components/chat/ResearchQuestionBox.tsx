'use client';

import type { FormEventHandler, ReactNode } from 'react';

interface ResearchQuestionBoxProps {
    ariaLabel?: string;
    className?: string;
    onSubmit: FormEventHandler<HTMLFormElement>;
    sourceSelector: ReactNode;
    context?: ReactNode;
    input: ReactNode;
    leadingActions: ReactNode;
    trailingActions: ReactNode;
    footer?: ReactNode;
}

export function ResearchQuestionBox({
    ariaLabel,
    className = '',
    onSubmit,
    sourceSelector,
    context,
    input,
    leadingActions,
    trailingActions,
    footer,
}: ResearchQuestionBoxProps) {
    return (
        <form aria-label={ariaLabel} className={`atlas-question-box ${className}`.trim()} onSubmit={onSubmit}>
            {context}
            <div className="atlas-ref-composer-toolbar">
                <span className="atlas-ref-composer-label">Research question</span>
                <div className="atlas-ref-composer-source">{sourceSelector}</div>
            </div>
            <div className="atlas-question-box-input">{input}</div>
            <div className="atlas-ref-composer-bottom">
                <div className="atlas-ref-pills">{leadingActions}</div>
                <div className="atlas-question-box-trailing">{trailingActions}</div>
            </div>
            {footer}
        </form>
    );
}
