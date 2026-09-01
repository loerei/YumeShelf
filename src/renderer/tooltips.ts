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

    let currentDelegatedTarget = null;

    function hide() {
        currentDelegatedTarget = null;
        tooltip.classList.remove('show');
    }

    function setContent(content) {
        if (typeof content === 'string') {
            content = { title: content };
        }
        const nextTitle = content?.title || '';
        const nextEngine = content?.engine || '';
        const nextSize = content?.size || '';
        const nextSubtitle = content?.subtitle || '';

        const isCompact = Boolean(nextTitle && !nextEngine && !nextSize && !nextSubtitle);
        if (isCompact) {
            tooltip.classList.add('compact');
        } else {
            tooltip.classList.remove('compact');
        }

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
        element.__hasCustomTooltip = true;
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

    // --- Global Delegated Tooltips ([data-tooltip] and [title] auto-interception) ---
    document.addEventListener('mouseover', (event) => {
        const el = event.target?.closest?.('[data-tooltip], [title]');
        if (!el || el.__hasCustomTooltip) return;

        const dropdown = el.closest?.('.dropdown-menu');
        if (dropdown?.classList.contains('show') && !el.dataset.tooltipInsideDropdown) {
            hide();
            return;
        }

        // Migrate native title to data-tooltip to completely suppress browser native OS tooltip
        if (el.hasAttribute('title')) {
            const rawTitle = el.getAttribute('title');
            if (rawTitle) {
                el.setAttribute('data-tooltip', rawTitle);
            }
            el.removeAttribute('title');
        }

        const tipText = el.getAttribute('data-tooltip');
        if (!tipText) {
            hide();
            return;
        }

        currentDelegatedTarget = el;
        const subtitle = el.getAttribute('data-tooltip-subtitle') || '';
        const engine = el.getAttribute('data-tooltip-engine') || '';
        const size = el.getAttribute('data-tooltip-size') || '';

        show({ title: tipText, subtitle, engine, size }, event, el);
    });

    document.addEventListener('mousemove', (event) => {
        if (!currentDelegatedTarget || !tooltip.classList.contains('show')) return;
        position(event.clientX, event.clientY);
    });

    document.addEventListener('mouseout', (event) => {
        if (!currentDelegatedTarget) return;
        const related = event.relatedTarget;
        if (related && currentDelegatedTarget.contains(related)) {
            return;
        }
        currentDelegatedTarget = null;
        hide();
    });

    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('blur', hide);
    window.addEventListener('resize', hide);

    return {
        attachTooltip,
        hide
    };
}
