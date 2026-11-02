import os
import re
from pathlib import Path

import pypdfium2 as pdfium
from docx import Document as WordDocument
from docx.table import Table
from docx.text.paragraph import Paragraph

from .ai import embed, embedding_model_id
from .config import DATA
from .db import Chunk, Document, Session
from .structured_text import extract_structured

SUPPORTED = {'.pdf', '.docx', '.txt', '.md', '.csv', '.json', '.html', '.htm'}


def extract(path, name, heartbeat=None, ocr_pages=None):
    ext = Path(name).suffix.lower()
    if ext == '.pdf':
        try:
            pdf = pdfium.PdfDocument(path)
        except pdfium.PdfiumError as exc:
            raise ValueError(
                'PDF could not be opened. Check whether it is corrupt or password-protected.'
            ) from exc
        try:
            if len(pdf) > 2000:
                raise ValueError('PDF exceeds the 2,000-page limit; split it into smaller files.')
            pages = []
            for i in range(len(pdf)):
                if heartbeat and i % 10 == 0 and not heartbeat():
                    raise ValueError('Processing was cancelled or superseded.')
                page = pdf[i]
                try:
                    textpage = page.get_textpage()
                    try:
                        value = textpage.get_text_bounded()
                    finally:
                        textpage.close()
                finally:
                    page.close()
                if not value.strip() and os.getenv('OCR_ENABLED', 'true').lower() == 'true':
                    # OCR only pages without a text layer, keeping searchable pages fast.
                    try:
                        import pytesseract

                        ocr_page = pdf[i]
                        try:
                            bitmap = ocr_page.render(scale=2)
                            try:
                                value = pytesseract.image_to_string(bitmap.to_pil(), timeout=30)
                            finally:
                                bitmap.close()
                        finally:
                            ocr_page.close()
                        if value.strip() and ocr_pages is not None:
                            ocr_pages.append(i + 1)
                    except (ImportError, OSError, RuntimeError, TimeoutError) as exc:
                        raise ValueError(
                            'OCR is unavailable. Install Tesseract and the Python OCR dependencies.'
                        ) from exc
                    except pytesseract.TesseractError as exc:
                        raise ValueError(f'OCR failed for PDF page {i + 1}.') from exc
                if not value.strip():
                    raise ValueError(f'PDF page {i + 1} has no readable text, including OCR.')
                pages.append((i + 1, value.replace('\r\n', '\n')))
            return pages
        finally:
            pdf.close()
    if ext == '.docx':
        doc = WordDocument(path)
        # Keep the document's block order and basic structure so the source viewer
        # can display headings, lists, and tables instead of one flattened string.
        blocks = []
        for item in doc.iter_inner_content():
            if isinstance(item, Paragraph):
                value = item.text.strip()
                if not value:
                    continue
                style = (item.style.name if item.style else '').lower()
                if style.startswith('heading '):
                    try:
                        level = min(6, max(1, int(style.rsplit(' ', 1)[1])))
                    except ValueError:
                        level = 2
                    value = f'{"#" * level} {value}'
                elif 'list bullet' in style or 'bullet' in style:
                    value = f'- {value}'
                elif 'list number' in style or 'number' in style:
                    value = f'1. {value}'
                elif item._p.pPr is not None and item._p.pPr.numPr is not None:
                    # Preserve numbering even when the document uses a custom list style.
                    value = f'- {value}'
                blocks.append(value)
            elif isinstance(item, Table):
                rows = [
                    [cell.text.replace('\n', ' ').strip().replace('|', '\\|') for cell in row.cells]
                    for row in item.rows
                ]
                if rows:
                    width = max(map(len, rows))
                    rows = [row + [''] * (width - len(row)) for row in rows]
                    table = [
                        '| ' + ' | '.join(rows[0]) + ' |',
                        '| ' + ' | '.join(['---'] * width) + ' |',
                    ]
                    table.extend('| ' + ' | '.join(row) + ' |' for row in rows[1:])
                    blocks.append('\n'.join(table))
        return [(1, '\n\n'.join(blocks))]
    if ext in {'.csv', '.json', '.html', '.htm'}:
        return [(1, extract_structured(path, ext))]
    return [(1, Path(path).read_text(encoding='utf-8-sig'))]


def split_text(text, size=1800, overlap=240):
    text = re.sub(r'[ \t]+', ' ', text).strip()
    start = 0
    while start < len(text):
        end = min(start + size, len(text))
        if end < len(text):
            boundary = max(
                text.rfind('\n', start + size // 2, end), text.rfind('. ', start + size // 2, end)
            )
            if boundary > start:
                end = boundary + 1
        value = text[start:end].strip()
        if value:
            yield value
        if end == len(text):
            break
        start = max(start + 1, end - overlap)


def ingest(document_id, generation, heartbeat):
    with Session() as db:
        doc = db.get(Document, document_id)
        if not doc:
            return
        name, workspace_id = doc.name, doc.workspace_id
    ocr_pages = []
    pages = extract(DATA / 'files' / document_id, name, heartbeat, ocr_pages)
    parts = [(page, value) for page, text in pages for value in split_text(text)]
    if not parts:
        raise ValueError('No readable text was found.')
    if len(parts) > 20000:
        raise ValueError('Document exceeds 20,000 chunks; split it into smaller files.')
    chunks = []
    for start in range(0, len(parts), 32):
        if not heartbeat():
            return
        batch = parts[start : start + 32]
        vectors = embed([value for _, value in batch])
        chunks.extend(
            Chunk(
                document_id=document_id,
                workspace_id=workspace_id,
                page=page,
                ordinal=start + i,
                text=value,
                embedding=vector,
                embedding_model=embedding_model_id() if vector is not None else None,
            )
            for i, ((page, value), vector) in enumerate(zip(batch, vectors))
        )
    with Session() as db:
        doc = db.get(Document, document_id)
        if not doc or doc.generation != generation or doc.status != 'processing':
            return
        db.query(Chunk).filter_by(document_id=document_id).delete()
        db.add_all(chunks)
        doc.status, doc.error, doc.pages, doc.chunk_count = 'ready', None, len(pages), len(chunks)
        doc.ocr_pages = ocr_pages
        db.commit()
