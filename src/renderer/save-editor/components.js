/**
 * Save Editor UI Components
 * Reusable UI elements for the save editor.
 */

export const UIComponents = {
    /**
     * Creates a data row for variables/switches/items
     */
    createDataRow(id, value, label, onUpdate) {
        const row = document.createElement('div');
        row.className = 'data-row';
        
        const idSpan = document.createElement('span');
        idSpan.className = 'data-id';
        idSpan.textContent = `#${id}`;
        
        const labelSpan = document.createElement('span');
        labelSpan.className = 'data-label';
        labelSpan.textContent = label || '';
        
        const valueInput = document.createElement('input');
        valueInput.type = typeof value === 'number' ? 'number' : 'text';
        valueInput.value = value;
        valueInput.className = 'data-value';
        
        valueInput.onchange = (e) => {
            let newVal = e.target.value;
            if (typeof value === 'number') newVal = Number(newVal);
            if (typeof value === 'boolean') newVal = e.target.value === 'true';
            onUpdate(newVal);
        };
        
        row.appendChild(idSpan);
        row.appendChild(labelSpan);
        row.appendChild(valueInput);
        
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
