'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Maximize2, ZoomIn, ZoomOut } from 'lucide-react';

export function MermaidDiagram({ chart }: { chart: string }) {
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    const [svg, setSvg] = useState('');
    const [error, setError] = useState('');
    const [sourceVisible, setSourceVisible] = useState(false);
    const [scale, setScale] = useState(1);
    const [expanded, setExpanded] = useState(false);
    const root = useRef<HTMLDivElement>(null);

    useEffect(() => {
        let active = true;
        setSvg('');
        setError('');
        import('mermaid').then(async ({ default: mermaid }) => {
            mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' });
            const output = await mermaid.render('atlas-mermaid-' + id, chart);
            if (active) setSvg(output.svg);
        }).catch(() => {
            if (active) setError('Unable to render this diagram. View its source below.');
        });
        return () => { active = false; };
    }, [chart, id]);

    return (
        <div className={expanded ? 'atlas-diagram atlas-diagram-expanded' : 'atlas-diagram'} ref={root}>
            <div className="atlas-diagram-toolbar">
                <strong>Diagram</strong>
                <div>
                    <button type="button" onClick={() => setScale(value => Math.max(0.5, value - 0.2))} aria-label="Zoom out"><ZoomOut size={16} /></button>
                    <button type="button" onClick={() => setScale(1)}>Reset</button>
                    <button type="button" onClick={() => setScale(value => Math.min(3, value + 0.2))} aria-label="Zoom in"><ZoomIn size={16} /></button>
                    <button type="button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Close expanded diagram' : 'Expand diagram'}><Maximize2 size={16} /></button>
                    <button type="button" onClick={() => setSourceVisible(value => !value)}>{sourceVisible ? 'Hide source' : 'View source'}</button>
                </div>
            </div>
            {error && <p role="alert">{error}</p>}
            {svg && !error && <div className="atlas-diagram-viewport"><div className="atlas-diagram-svg" style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }} dangerouslySetInnerHTML={{ __html: svg }} /></div>}
            {!svg && !error && <p role="status">Rendering diagram…</p>}
            {(sourceVisible || error) && <pre><code>{chart}</code></pre>}
        </div>
    );
}
