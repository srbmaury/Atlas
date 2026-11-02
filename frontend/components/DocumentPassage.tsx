import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { parseExtractedText } from '../lib/documentText';

function highlightedText(line: string, search?: string, keyPrefix = 'match'): ReactNode[] {
    if (!search?.trim()) return [line];
    const index = line.toLocaleLowerCase().indexOf(search.toLocaleLowerCase());
    if (index < 0) return [line];
    return [
        line.slice(0, index),
        <mark key={keyPrefix}>{line.slice(index, index + search.length)}</mark>,
        ...highlightedText(line.slice(index + search.length), search, `${keyPrefix}-next`),
    ].filter((part) => part !== '');
}

function highlightNodes(children: ReactNode, search?: string): ReactNode {
    return Children.map(children, (child) => {
        if (typeof child === 'string') return highlightedText(child, search);
        if (isValidElement<{ children?: ReactNode }>(child) && child.props.children)
            return cloneElement(child, {}, highlightNodes(child.props.children, search));
        return child;
    });
}

function linkedLine(line: string, keyPrefix: string, search?: string) {
    const pieces: ReactNode[] = [];
    const pattern = /https?:\/\/[^\s<>"']+/g;
    let cursor = 0;
    let index = 0;

    for (const match of line.matchAll(pattern)) {
        const raw = match[0];
        let url = raw;
        let trailing = '';
        while (/[.,!?;:]$/.test(url)) {
            trailing = url.slice(-1) + trailing;
            url = url.slice(0, -1);
        }
        while (url.endsWith(')') && (url.match(/\)/g)?.length || 0) > (url.match(/\(/g)?.length || 0)) {
            trailing = ')' + trailing;
            url = url.slice(0, -1);
        }
        const start = match.index ?? 0;
        if (start > cursor)
            pieces.push(...highlightedText(line.slice(cursor, start), search, `${keyPrefix}-${index}-text`));
        try {
            const parsed = new URL(url);
            if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
                pieces.push(
                    <a key={`${keyPrefix}-${index++}`} href={url} target="_blank" rel="noopener noreferrer">
                        {highlightNodes(url, search)}
                    </a>,
                );
            } else pieces.push(...highlightedText(url, search, `${keyPrefix}-${index++}-text`));
        } catch {
            pieces.push(...highlightedText(url, search, `${keyPrefix}-${index++}-text`));
        }
        if (trailing) pieces.push(...highlightedText(trailing, search, `${keyPrefix}-${index}-punctuation`));
        cursor = start + raw.length;
    }
    if (cursor < line.length) pieces.push(...highlightedText(line.slice(cursor), search, `${keyPrefix}-tail`));
    return pieces;
}

export function DocumentPassage({ text, name, highlight }: { text: string; name: string; highlight?: string }) {
    if (/\.(md|docx)$/i.test(name))
        return (
            <div className="document-markdown">
                <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                        p: ({ children }) => <p>{highlightNodes(children, highlight)}</p>,
                        li: ({ children }) => <li>{highlightNodes(children, highlight)}</li>,
                        h1: ({ children }) => <h1>{highlightNodes(children, highlight)}</h1>,
                        h2: ({ children }) => <h2>{highlightNodes(children, highlight)}</h2>,
                        h3: ({ children }) => <h3>{highlightNodes(children, highlight)}</h3>,
                        strong: ({ children }) => <strong>{highlightNodes(children, highlight)}</strong>,
                        a: ({ href, children }) => (
                            <a href={href} target="_blank" rel="noopener noreferrer">
                                {highlightNodes(children, highlight)}
                            </a>
                        ),
                    }}
                >
                    {text}
                </ReactMarkdown>
            </div>
        );
    return (
        <div className="document-plain">
            {parseExtractedText(text).map((block, index) => {
                if (block.type === 'kicker')
                    return (
                        <div className="document-kicker" key={index}>
                            {highlightedText(block.text, highlight, `kicker-${index}`)}
                        </div>
                    );
                if (block.type === 'heading')
                    return (
                        <h3 className="document-section-heading" key={index}>
                            {highlightedText(block.text, highlight, `heading-${index}`)}
                        </h3>
                    );
                if (block.type === 'field') {
                    const fieldText = `${block.label}: ${block.value}`;
                    const highlightsField = Boolean(
                        highlight && fieldText.toLocaleLowerCase().includes(highlight.toLocaleLowerCase()),
                    );
                    return (
                        <div className="document-field" key={index}>
                            <strong>
                                {highlightsField ? <mark>{block.label}</mark> : highlightedText(block.label, highlight, `label-${index}`)}
                            </strong>
                            <span>
                                {highlightsField ? <mark>{linkedLine(block.value, `field-${index}`)}</mark> : linkedLine(block.value, `field-${index}`, highlight)}
                            </span>
                        </div>
                    );
                }
                if (block.type === 'list')
                    return (
                        <ul key={index}>
                            {block.items.map((item, itemIndex) => (
                                <li key={itemIndex}>{linkedLine(item, `list-${index}-${itemIndex}`, highlight)}</li>
                            ))}
                        </ul>
                    );
                return <p key={index}>{linkedLine(block.text, `paragraph-${index}`, highlight)}</p>;
            })}
        </div>
    );
}
