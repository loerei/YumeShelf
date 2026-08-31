// @ts-nocheck
export function createTooltipController() {
    const tooltip = document.createElement('div');
    tooltip.className = 'app-tooltip';
    tooltip.setAttribute('role', 'tooltip');

    const title = document.createElement('div');
    title.className = 'app-tooltip-title';
    tooltip.appendChild(title);

    const metaLine = document.createElement('div');
    metaLine.className = 'app-tooltip-meta-line';

    const engineSpan = document.createElement('span');
    engineSpan.className = 'app-tooltip-engine';
    metaLine.appendChild(engineSpan);

    const dotSpan = document.createElement('span');
    dotSpan.className = 'app-tooltip-dot';
    dotSpan.textContent = '•';
    metaLine.appendChild(dotSpan);

    const sizeSpan = document.createElement('span');
    sizeSpan.className = 'app-tooltip-size';
    metaLine.appendChild(sizeSpan);

    tooltip.appendChild(metaLine);

    const subtitle = document.createElement('div');
    subtitle.className = 'app-tooltip-subtitle';
    tooltip.appendChild(subtitle);

    document.body.appendChild(tooltip);

    function hide() {
        tooltip.classList.remove('show');
    }

    function setContent(content) {
        const nextTitle = content?.title || '';
        const nextEngine = content?.engine || '';
        const nextSize = content?.size || '';
        const nextSubtitle = content?.subtitle || '';

        title.textContent = nextTitle;
        title.style.display = nextTitle ? 'block' : 'none';

        engineSpan.textContent = nextEngine;
        engineSpan.style.display = nextEngine ? 'inline' : 'none';

        sizeSpan.textContent = nextSize;
        sizeSpan.style.display = nextSize ? 'inline' : 'none';

        dotSpan.style.display = (nextEngine && nextSize) ? 'inline' : 'none';
        metaLine.style.display = (nextEngine || nextSize) ? 'flex' : 'none';

        subtitle.textContent = nextSubtitle;
        subtitle.style.display = nextSubtitle ? 'block' : 'none';
    }

    function position(pointerX, pointerY) {
        const margin = 12;
        const offset = 16;
        tooltip.style.left = '0px';
        tooltip.style.top = '0px';

        const rect = tooltip.getBoundingClientRect();
        let left = pointerX + offset;
        let top = pointerY + offset;

        if (left + rect.width > window.innerWidth - margin) {
            left = Math.max(margin, pointerX - rect.width - offset);
        }
        if (top + rect.height > window.innerHeight - margin) {
            top = Math.max(margin, pointerY - rect.height - offset);
        }

        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    function show(content, event, element) {
        if (!content || (!content.title && !content.subtitle && !content.engine && !content.size)) {
            hide();
            return;
        }

        setContent(content);
        tooltip.classList.add('show');

        if (event) {
            position(event.clientX, event.clientY);
            return;
        }

        const rect = element.getBoundingClientRect();
        position(rect.left + rect.width / 2, rect.bottom);
    }

    function attachTooltip(element, getContent) {
        element.addEventListener('mouseenter', (event) => {
            const dropdown = element.querySelector('.dropdown-menu');
            if (dropdown?.classList.contains('show')) {
                hide();
                return;
            }
            if (event.target?.closest?.('.dropdown-menu')) {
                hide();
                return;
            }
            show(getContent(), event, element);
        });
        element.addEventListener('mousemove', (event) => {
            const dropdown = element.querySelector('.dropdown-menu');
            if (dropdown?.classList.contains('show')) {
                hide();
                return;
            }
            if (event.target?.closest?.('.dropdown-menu')) {
                hide();
                return;
            }
            if (!tooltip.classList.contains('show')) return;
            position(event.clientX, event.clientY);
        });
        element.addEventListener('mouseleave', hide);
        element.addEventListener('blur', hide, true);
    }

    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);

    return {
        attachTooltip,
        hide
    };
}
