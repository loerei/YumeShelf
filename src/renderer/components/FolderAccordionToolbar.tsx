import React from 'react';
import { useLocaleStrings } from '../i18n/locale-strings';

export interface FolderAccordionToolbarProps {
  readonly onExpandAll: () => void;
  readonly onCollapseAll: () => void;
}

/**
 * Toolbar providing Expand All / Collapse All controls for folder accordions on the 'all' tab.
 */
export const FolderAccordionToolbar: React.FC<FolderAccordionToolbarProps> = ({
  onExpandAll,
  onCollapseAll,
}) => {
  const strings = useLocaleStrings();

  return (
    <div className="folder-accordion-toolbar">
      <button type="button" onClick={onExpandAll}>
        {strings.expand_all}
      </button>
      <button type="button" onClick={onCollapseAll}>
        {strings.collapse_all}
      </button>
    </div>
  );
};
