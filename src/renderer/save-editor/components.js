/**
 * Save Editor UI Components
 * Reusable UI elements for the save editor.
 */

export const UIComponents = {
    /**
     * Creates a data row for variables/switches/items
     */
    createDataRow(id, value, label, onUpdate, originalValue = undefined) {
        const row = document.createElement('div');
        row.className = 'data-row';
        
        const idSpan = document.createElement('span');
        idSpan.className = 'data-id';
        idSpan.textContent = `#${id}`;
        
        const labelSpan = document.createElement('span');
        labelSpan.className = 'data-label';
        labelSpan.textContent = label || '';
        if (label) {
            labelSpan.setAttribute('title', label);
        }
        
        const valueWrapper = document.createElement('div');
        valueWrapper.className = 'data-value-wrapper';
        valueWrapper.style.display = 'flex';
        valueWrapper.style.alignItems = 'center';
        valueWrapper.style.gap = '8px';
        
        const valueInput = document.createElement('input');
        valueInput.type = typeof value === 'number' ? 'number' : 'text';
        valueInput.value = value;
        valueInput.className = 'data-value';
        
        valueWrapper.appendChild(valueInput);

        // Delta indicator
        if (originalValue !== undefined && originalValue !== value) {
            const deltaSpan = document.createElement('span');
            deltaSpan.className = 'data-delta';
            deltaSpan.style.fontSize = '0.85em';
            deltaSpan.style.fontWeight = 'bold';
            
            if (typeof value === 'number' && typeof originalValue === 'number') {
                const diff = value - originalValue;
                if (diff > 0) {
                    deltaSpan.textContent = `+${diff}`;
                    deltaSpan.style.color = '#4ade80'; // green
                } else if (diff < 0) {
                    deltaSpan.textContent = `${diff}`;
                    deltaSpan.style.color = '#f87171'; // red
                }
            } else if (typeof value === 'boolean') {
                deltaSpan.textContent = `(was: ${originalValue})`;
                deltaSpan.style.color = '#fbbf24'; // yellow
            } else {
                deltaSpan.textContent = '(changed)';
                deltaSpan.style.color = '#fbbf24'; // yellow
            }
            valueWrapper.appendChild(deltaSpan);
        }
        
        valueInput.onchange = (e) => {
            let newVal = e.target.value;
            if (typeof value === 'number') newVal = Number(newVal);
            if (typeof value === 'boolean') newVal = e.target.value === 'true';
            onUpdate(newVal);
        };
        
        row.appendChild(idSpan);
        row.appendChild(labelSpan);
        row.appendChild(valueWrapper);
        
        return row;
    },

    /**
     * Creates a checkbox filter toggle
     */
    createFilterToggle(id, label, checked, onChange) {
        const wrapper = document.createElement('label');
        wrapper.className = 'filter-toggle';
        
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.id = id;
        checkbox.checked = checked;
        checkbox.onchange = (e) => onChange(e.target.checked);
        
        const text = document.createTextNode(label);
        
        wrapper.appendChild(checkbox);
        wrapper.appendChild(text);
        
        return wrapper;
    }
};
