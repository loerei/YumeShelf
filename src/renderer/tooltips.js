export function createTooltipController() {
    const tooltip = document.createElement('div');
    tooltip.className = 'app-tooltip';
    tooltip.setAttribute('role', 'tooltip');

    const title = document.createElement('div');
    title.className = 'app-tooltip-title';
    tooltip.appendChild(title);

    const subtitle = document.createElement('div');
    subtitle.className = 'app-tooltip-subtitle';
    tooltip.appendChild(subtitle);

    document.body.appendChild(tooltip);

    function hide() {
        tooltip.classList.remove('show');
    }

    function setContent(content) {
        const nextTitle = content?.title || '';
        const nextSubtitle = content?.subtitle || '';

        title.textContent = nextTitle;
        title.style.display = nextTitle ? 'block' : 'none';

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
        if (!content || (!content.title && !content.subtitle)) {
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
            show(getContent(), event, element);
        });
        element.addEventListener('mousemove', (event) => {
            if (!tooltip.classList.contains('show')) return;
            position(event.clientX, event.clientY);
        });
        element.addEventListener('mouseleave', hide);
        element.addEventListener('blur', hide, true);
    }

    return {
        attachTooltip,
        hide
    };
}
