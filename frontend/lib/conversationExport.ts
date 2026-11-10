import { sourceDisplayName, sourceLocation, visibleEvidence } from './evidence';
import type { Message } from './types';

function inlineText(value: string) {
    return value
        .replace(/\s+/g, ' ')
        .trim()
        .replace(/[\\`*_{}\[\]()<>#+.!|~&]/g, '\\$&');
}

export function conversationMarkdown(title: string, messages: Message[]) {
    const turns = messages.map((message) => {
        const citations = visibleEvidence(message.result).map(({ source, number }) => {
            const label = inlineText(`${sourceDisplayName(source)} · ${sourceLocation(source)}`);
            const url = source.url?.trim();
            const link = url && /^https?:\/\/[^\s<>]+$/i.test(url) ? `[${label}](<${url}>)` : label;
            return `- [${number}] ${link}`;
        });
        return [`## ${message.role === 'user' ? 'You' : 'Atlas'}`, message.content, ...(citations.length ? [`### Sources\n\n${citations.join('\n')}`] : [])].join('\n\n');
    });
    return [`# ${inlineText(title) || 'Atlas conversation'}`, ...turns].join('\n\n') + '\n';
}

export function conversationExportName(title: string) {
    return (
        Array.from(title.replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ').trim())
            .slice(0, 100)
            .join('')
            .replace(/[.\s]+$/g, '') || 'Atlas conversation'
    );
}

export function downloadConversationMarkdown(filename: string, markdown: string) {
    const url = URL.createObjectURL(new Blob([markdown], { type: 'text/markdown;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.md`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
