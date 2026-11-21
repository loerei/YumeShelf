import React from 'react';
import type { SaveTabDto } from '@yumeshelf/engine/types';
import {
  useSaveFileStatus,
  useActiveSaveTabId,
  useSaveEditorDispatch,
} from '../store/save-editor-store';

export interface SaveEditorTabsViewProps {
  tabs?: readonly SaveTabDto[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
}

export const SaveEditorTabsView: React.FC<SaveEditorTabsViewProps> = ({
  tabs = [],
  activeTabId = '',
  onSelectTab,
}) => {
  const safeTabs = tabs ?? [];
  const containerClassName =
    safeTabs.length === 0
      ? 'save-editor-tabs save-editor-tabs--empty'
      : 'save-editor-tabs';

  return (
    <nav className={containerClassName} aria-label="Save categories">
      {safeTabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        return (
          <button
            key={tab.id}
            type="button"
            className={isActive ? 'save-tab active' : 'save-tab'}
            onClick={() => onSelectTab?.(tab.id)}
            aria-current={isActive ? 'page' : undefined}
          >
            <span className="save-tab-label">{tab.label}</span>
            {typeof tab.count === 'number' && (
              <span className="save-tab-count">({tab.count})</span>
            )}
          </button>
        );
      })}
    </nav>
  );
};

export interface SaveEditorTabsProps {
  tabs?: readonly SaveTabDto[];
  activeTabId?: string;
  onSelectTab?: (tabId: string) => void;
}

export const SaveEditorTabs: React.FC<SaveEditorTabsProps> = ({
  tabs: propTabs,
  activeTabId: propActiveTabId,
  onSelectTab: propOnSelectTab,
}) => {
  const fileStatus = useSaveFileStatus();
  const storeActiveTabId = useActiveSaveTabId();
  const dispatch = useSaveEditorDispatch();

  const tabs =
    propTabs ?? (fileStatus.state === 'loaded' ? fileStatus.dto.tabs ?? [] : []);
  const activeTabId = propActiveTabId ?? storeActiveTabId;
  const onSelectTab =
    propOnSelectTab ?? ((tabId: string) => dispatch.setActiveTab(tabId));

  return (
    <SaveEditorTabsView
      tabs={tabs}
      activeTabId={activeTabId}
      onSelectTab={onSelectTab}
    />
  );
};
