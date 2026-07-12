// @ts-nocheck
export function escapeHtml(value) {
    return String(value || '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderInlineMarkdown(value) {
    let result = escapeHtml(value);

    result = result.replace(/`([^`]+)`/g, '<code>$1</code>');
    result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    result = result.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    result = result.replace(/\[([^\]]+)\]\((https?:\/\/[^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');

    return result;
}

function renderParagraph(lines) {
    const text = lines.map(line => line.trim()).join(' ');
    return text ? `<p>${renderInlineMarkdown(text)}</p>` : '';
}

export function renderMarkdownLite(markdown) {
    const normalized = String(markdown || '').replace(/\r\n?/g, '\n').trim();
    if (!normalized) {
        return '';
    }

    const lines = normalized.split('\n');
    const html = [];
    let paragraphLines = [];
    let listItems = [];

    function flushParagraph() {
        if (paragraphLines.length === 0) return;
        html.push(renderParagraph(paragraphLines));
        paragraphLines = [];
    }

    function flushList() {
        if (listItems.length === 0) return;
        html.push('<ul>' + listItems.map(item => '<li>' + renderInlineMarkdown(item) + '</li>').join('') + '</ul>');
        listItems = [];
    }

    for (const rawLine of lines) {
        const line = rawLine.trim();

        if (!line) {
            flushParagraph();
            flushList();
            continue;
        }

        let headingMatch = null;
        if (line.startsWith('#')) {
            let hashes = 0;
            while (hashes < line.length && line[hashes] === '#') {
                hashes++;
            }
            if (hashes >= 1 && hashes <= 3 && line[hashes] === ' ') {
                headingMatch = [line, line.slice(0, hashes), line.slice(hashes + 1)];
            }
        }

        if (headingMatch) {
            flushParagraph();
            flushList();
            const level = Math.min(headingMatch[1].length, 3);
            html.push(`<h${level}>${renderInlineMarkdown(headingMatch[2].trim())}</h${level}>`);
            continue;
        }

        if (/^---+$/.test(line)) {
            flushParagraph();
            flushList();
            html.push('<hr>');
            continue;
        }

        let listMatch = null;
        if ((line.startsWith('-') || line.startsWith('*')) && line[1] === ' ') {
            listMatch = [line, line.slice(2)];
        }

        if (listMatch) {
            flushParagraph();
            listItems.push(listMatch[1].trim());
            continue;
        }

        flushList();
        paragraphLines.push(line);
    }

    flushParagraph();
    flushList();

    return html.join('');
}
