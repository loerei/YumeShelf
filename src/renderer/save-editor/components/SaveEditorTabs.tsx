import React, { useCallback, useContext, useEffect, useRef, useState } from 'react';
import type { SaveTabDto } from '@yumeshelf/engine/types';
import {
  SaveEditorElectronApiContext,
  useSaveFileStatus,
  useActiveSaveTabId,
  useSaveEditorDispatch,
  useSaveElectronAPI,
  useSavePinnedIds,
} from '../store/save-editor-store';
import { useLocaleStrings } from '../../i18n/locale-strings';
import { buildVisibleTabs } from '../domain/save-view-model';

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
  const contextApi = useContext(SaveEditorElectronApiContext) ?? null;
  const strings = useLocaleStrings(undefined, contextApi);
  const safeTabs = tabs ?? [];
  const containerClassName =
    safeTabs.length === 0
      ? 'save-editor-tabs save-editor-tabs--empty'
      : 'save-editor-tabs';

  const tabsRef = useRef<HTMLElement | null>(null);
  const [shadows, setShadows] = useState({ left: false, right: false });

  const updateShadows = useCallback(() => {
    const el = tabsRef.current;
    if (!el) return;
    const left = el.scrollLeft > 2;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
    setShadows((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right }
    );
  }, []);

  useEffect(() => {
    updateShadows();
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', updateShadows);
      return () => window.removeEventListener('resize', updateShadows);
    }
    return undefined;
  }, [safeTabs, updateShadows]);

  return (
    <div className="save-editor-tabs-container">
      <nav
        ref={tabsRef}
        className={containerClassName}
        aria-label={strings.save_editor_categories_aria || 'Save categories'}
        onScroll={updateShadows}
      >
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
      <div
        className={`tabs-shadow tabs-shadow-left${shadows.left ? ' visible' : ''}`}
        aria-hidden="true"
      />
      <div
        className={`tabs-shadow tabs-shadow-right${shadows.right ? ' visible' : ''}`}
        aria-hidden="true"
      />
    </div>
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
  const pinnedIds = useSavePinnedIds();
  const dispatch = useSaveEditorDispatch();
  const contextApi = useSaveElectronAPI();
  const strings = useLocaleStrings(undefined, contextApi ?? null);

  const tabs = propTabs
    ? propTabs.map((tab) => {
        const localized = strings[`save_editor_${tab.id}`];
        return typeof localized === 'string' && localized
          ? { ...tab, label: localized }
          : tab;
      })
    : fileStatus.state === 'loaded'
      ? buildVisibleTabs(
          fileStatus.dto.tabs ?? [],
          fileStatus.dto.fields ?? [],
          pinnedIds,
          strings
        )
      : [];
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
