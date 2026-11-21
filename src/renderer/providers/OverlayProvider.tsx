import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export type ModalType = 'settings' | 'about' | 'language-pack' | 'duplicate-stack';

export interface ModalPayloadMap {
  settings: undefined;
  about: undefined;
  'language-pack': undefined;
  'duplicate-stack': { groupKey: string };
}

export type ActiveModalEntry =
  | { readonly type: 'settings'; readonly payload?: undefined }
  | { readonly type: 'about'; readonly payload?: undefined }
  | { readonly type: 'language-pack'; readonly payload?: undefined }
  | { readonly type: 'duplicate-stack'; readonly payload: { groupKey: string } };

export type ActiveModalState =
  | { readonly type: null; readonly payload?: undefined }
  | ActiveModalEntry;

export type OpenModalFn = <T extends ModalType>(
  ...args: ModalPayloadMap[T] extends undefined
    ? [type: T]
    : [type: T, payload: ModalPayloadMap[T]]
) => void;

export interface OverlayContextValue {
  readonly modalStack: readonly ActiveModalEntry[];
  readonly activeModalState: ActiveModalState;
  readonly activeModal: ModalType | null;
  readonly modalPayload: ModalPayloadMap[ModalType];
  isModalOpen(type: ModalType): boolean;
  getModalPayload<T extends ModalType>(type: T): ModalPayloadMap[T] | undefined;
  openModal: OpenModalFn;
  closeModal(type?: ModalType): void;
}

const OverlayContext = createContext<OverlayContextValue | null>(null);

export interface OverlayProviderProps {
  readonly children: React.ReactNode;
}

const EMPTY_MODAL_STATE: ActiveModalState = { type: null };

export function OverlayProvider({ children }: OverlayProviderProps): React.ReactElement {
  const [modalStack, setModalStack] = useState<readonly ActiveModalEntry[]>([]);
  const modalStackLengthRef = useRef(0);
  modalStackLengthRef.current = modalStack.length;

  const openModal: OpenModalFn = useCallback((...args) => {
    const [type, payload] = args as [ModalType, ModalPayloadMap[ModalType]];
    const entry = { type, payload } as ActiveModalEntry;

    setModalStack((prev) => {
      const top = prev[prev.length - 1];
      if (top && top.type === type) {
        if (JSON.stringify(top.payload) === JSON.stringify(payload)) {
          return prev;
        }
        return [...prev.slice(0, -1), entry];
      }
      return [...prev, entry];
    });
  }, []);

  const closeModal = useCallback((type?: ModalType) => {
    setModalStack((prev) => {
      if (prev.length === 0) return prev;
      if (type === undefined) {
        return prev.slice(0, -1);
      }
      const next = prev.filter((entry) => entry.type !== type);
      return next.length === prev.length ? prev : next;
    });
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (modalStackLengthRef.current === 0) return;
      if (event.defaultPrevented) return;
      closeModal();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [closeModal]);

  const activeModalState: ActiveModalState =
    modalStack.length > 0 ? modalStack[modalStack.length - 1] : EMPTY_MODAL_STATE;

  const activeModal: ModalType | null = activeModalState.type;
  const modalPayload: ModalPayloadMap[ModalType] = activeModalState.payload;

  const isModalOpen = useCallback(
    (type: ModalType): boolean => modalStack.some((entry) => entry.type === type),
    [modalStack]
  );

  const getModalPayload = useCallback(
    <T extends ModalType>(type: T): ModalPayloadMap[T] | undefined => {
      const found = modalStack.find((entry) => entry.type === type);
      return found?.payload as ModalPayloadMap[T] | undefined;
    },
    [modalStack]
  );

  const contextValue = useMemo<OverlayContextValue>(
    () => ({
      modalStack,
      activeModalState,
      activeModal,
      modalPayload,
      isModalOpen,
      getModalPayload,
      openModal,
      closeModal,
    }),
    [
      modalStack,
      activeModalState,
      activeModal,
      modalPayload,
      isModalOpen,
      getModalPayload,
      openModal,
      closeModal,
    ]
  );

  return <OverlayContext.Provider value={contextValue}>{children}</OverlayContext.Provider>;
}

export function useOverlay(): OverlayContextValue {
  const ctx = useContext(OverlayContext);
  if (!ctx) {
    throw new Error('useOverlay must be used within an OverlayProvider');
  }
  return ctx;
}
