export function escapeHtml(value: unknown): string {
    const str = typeof value === 'string' ? value : String(value ?? '');
    return str
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderInlineMarkdown(value: string): string {
    let result = escapeHtml(value);

    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^()\s]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

    return result;
}

function renderParagraph(lines: string[]): string {
    const text = lines.map(line => line.trim()).join(' ');
    return text ? `<p>${renderInlineMarkdown(text)}</p>` : '';
}

export function renderMarkdownLite(markdown: string): string {
    const normalized = String(markdown || '').replace(/\r\n?/g, '\n').trim();
    if (!normalized) {
        return '';
    }

    const lines = normalized.split('\n');
    const html: string[] = [];
    let paragraphLines: string[] = [];
    let listItems: string[] = [];

    function flushParagraph(): void {
        if (paragraphLines.length === 0) return;
        html.push(renderParagraph(paragraphLines));
        paragraphLines = [];
    }

    function flushList(): void {
        if (listItems.length === 0) return;
        const itemsHtml = listItems.map(item => `<li>${renderInlineMarkdown(item)}</li>`).join('');
        html.push(`<ul>${itemsHtml}</ul>`);
        listItems = [];
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            flushParagraph();
            flushList();
            continue;
        }

        const headingMatch = line.match(/^#{1,3}\s+(.+)$/);
        if (headingMatch && line.startsWith('#')) {
            flushParagraph();
            flushList();
            const spaceIndex = line.indexOf(' ');
            const hashCount = spaceIndex > 0 ? spaceIndex : 1;
            const level = Math.min(hashCount, 3);
            const titleText = line.slice(spaceIndex + 1).trim();
            html.push(`<h${level}>${renderInlineMarkdown(titleText)}</h${level}>`);
            continue;
        }

        if (/^---+$/.test(line)) {
            flushParagraph();
            flushList();
            html.push('<hr>');
            continue;
        }

        if ((line.startsWith('- ') || line.startsWith('* ')) && line.length > 2) {
            flushParagraph();
            listItems.push(line.slice(2).trim());
            continue;
        }

        flushList();
        paragraphLines.push(line);
    }

    flushParagraph();
    flushList();

    return html.join('');
}
