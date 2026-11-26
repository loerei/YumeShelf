import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { PlatformInput } from '../../../shared/path-subsumption';
import type { LocaleStrings } from '../../i18n/locale-strings';
import { normalizeLibraryPath } from '../../library/library-sections';

export interface PathRowBaseProps {
  readonly dirPath: string;
  readonly canRemove: boolean;
  readonly disabled: boolean;
  readonly strings: LocaleStrings;
  readonly folderAliases?: Readonly<Record<string, string>>;
  readonly targetPlatform?: PlatformInput;
  readonly onOpenPath: (dirPath: string) => void;
  readonly onChangePath: (dirPath: string) => void;
  readonly onRemovePath: (dirPath: string) => void;
}

export interface SortablePathRowProps extends PathRowBaseProps {
  readonly pathItemRefs: React.MutableRefObject<Map<string, HTMLElement>>;
}

export function resolvePathAlias(
  dirPath: string,
  folderAliases?: Readonly<Record<string, string>>,
  targetPlatform?: PlatformInput
): string | null {
  if (!folderAliases) return null;

  if (Object.prototype.hasOwnProperty.call(folderAliases, dirPath)) {
    const direct = folderAliases[dirPath];
    if (typeof direct === 'string' && direct.trim() !== '') {
      return direct.trim();
    }
    return null;
  }

  const normDir = normalizeLibraryPath(dirPath, targetPlatform);
  for (const [key, alias] of Object.entries(folderAliases)) {
    if (normalizeLibraryPath(key, targetPlatform) === normDir) {
      if (typeof alias === 'string' && alias.trim() !== '') {
        return alias.trim();
      }
      return null;
    }
  }

  return null;
}

function GripIcon(): React.JSX.Element {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="9" cy="5" r="1.5" />
      <circle cx="15" cy="5" r="1.5" />
      <circle cx="9" cy="12" r="1.5" />
      <circle cx="15" cy="12" r="1.5" />
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="15" cy="19" r="1.5" />
    </svg>
  );
}

function FolderIcon(): React.JSX.Element {
  return (
    <span className="library-path-icon" aria-hidden="true">
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
      >
        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
      </svg>
    </span>
  );
}

export function PathRowOverlay({
  dirPath,
  canRemove,
  disabled,
  strings,
  folderAliases,
  targetPlatform,
  onOpenPath,
  onChangePath,
  onRemovePath,
}: PathRowBaseProps): React.JSX.Element {
  const alias = resolvePathAlias(dirPath, folderAliases, targetPlatform);

  return (
    <div className="library-path-entry is-drag-overlay">
      <button
        type="button"
        className="grip-handle"
        aria-label={strings.reorder_library_path}
        data-tooltip={strings.drag_to_reorder}
        aria-disabled={disabled}
        style={disabled ? { pointerEvents: 'none' } : undefined}
        tabIndex={-1}
      >
        <GripIcon />
      </button>
      <FolderIcon />
      <button
        type="button"
        className="library-path-link"
        title={dirPath}
        onClick={() => onOpenPath(dirPath)}
        tabIndex={-1}
      >
        {dirPath}
      </button>
      {alias && (
        <span className="library-path-alias" data-tooltip={alias}>
          {alias}
        </span>
      )}
      <div className="library-path-actions">
        <button
          type="button"
          className="library-path-action-btn change-btn"
          aria-label={`Change path ${dirPath}`}
          aria-disabled={disabled}
          style={disabled ? { pointerEvents: 'none' } : undefined}
          onClick={() => onChangePath(dirPath)}
          tabIndex={-1}
        >
          {strings.change || 'Change'}
        </button>
        <button
          type="button"
          className="library-path-action-btn remove-btn"
          aria-label={`Remove path ${dirPath}`}
          disabled={!canRemove}
          aria-disabled={!canRemove || disabled}
          style={!canRemove || disabled ? { pointerEvents: 'none' } : undefined}
          onClick={() => {
            if (canRemove) onRemovePath(dirPath);
          }}
          tabIndex={-1}
        >
          {strings.btn_remove || 'Remove'}
        </button>
      </div>
    </div>
  );
}

export function SortablePathRow({
  dirPath,
  canRemove,
  disabled,
  strings,
  folderAliases,
  targetPlatform,
  pathItemRefs,
  onOpenPath,
  onChangePath,
  onRemovePath,
}: SortablePathRowProps): React.JSX.Element {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: dirPath,
    disabled,
  });

  const alias = resolvePathAlias(dirPath, folderAliases, targetPlatform);

  const rowStyle: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : undefined,
  };

  const handleRef = (el: HTMLDivElement | null) => {
    setNodeRef(el);
    if (el) {
      pathItemRefs.current.set(dirPath, el);
    } else {
      pathItemRefs.current.delete(dirPath);
    }
  };

  return (
    <div
      ref={handleRef}
      tabIndex={-1}
      className="library-path-entry"
      style={rowStyle}
    >
      <button
        type="button"
        className="grip-handle"
        {...attributes}
        {...listeners}
        aria-label={strings.reorder_library_path}
        data-tooltip={strings.drag_to_reorder}
        aria-disabled={disabled}
        style={disabled ? { pointerEvents: 'none' } : undefined}
      >
        <GripIcon />
      </button>
      <FolderIcon />
      <button
        type="button"
        className="library-path-link"
        title={dirPath}
        onClick={() => onOpenPath(dirPath)}
      >
        {dirPath}
      </button>
      {alias && (
        <span className="library-path-alias" data-tooltip={alias}>
          {alias}
        </span>
      )}
      <div className="library-path-actions">
        <button
          type="button"
          className="library-path-action-btn change-btn"
          aria-label={`Change path ${dirPath}`}
          aria-disabled={disabled}
          style={disabled ? { pointerEvents: 'none' } : undefined}
          onClick={() => onChangePath(dirPath)}
        >
          {strings.change || 'Change'}
        </button>
        <button
          type="button"
          className="library-path-action-btn remove-btn"
          aria-label={`Remove path ${dirPath}`}
          disabled={!canRemove}
          aria-disabled={!canRemove || disabled}
          style={!canRemove || disabled ? { pointerEvents: 'none' } : undefined}
          onClick={() => {
            if (canRemove) onRemovePath(dirPath);
          }}
        >
          {strings.btn_remove || 'Remove'}
        </button>
      </div>
    </div>
  );
}
