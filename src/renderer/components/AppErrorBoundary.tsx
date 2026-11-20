import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { sanitizeUserPaths, extractSanitizedCauseChain } from '../../shared/path-sanitizer';
import type { ElectronAPI } from '../../shared/types/ipc';

export interface AppErrorBoundaryProps {
  children: ReactNode;
  appVersion?: string;
  electronAPI?: ElectronAPI;
  fallback?: (error: Error, reset: () => void) => ReactNode;
  onReset?: () => void;
}

export interface AppErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
  isCopied: boolean;
  copyFailed: boolean;
  appVersion: string | null;
}

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    error: null,
    errorInfo: null,
    isCopied: false,
    copyFailed: false,
    appVersion: this.props.appVersion ?? null,
  };
  private isComponentMounted = false;
  private copyTimeoutId: ReturnType<typeof setTimeout> | null = null;

  static getDerivedStateFromError(error: unknown): Partial<AppErrorBoundaryState> {
    const normalizedError =
      error instanceof Error ? error : new Error(String(error || 'Unknown render error'));
    return { hasError: true, error: normalizedError };
  }

  componentDidMount(): void {
    this.isComponentMounted = true;
    const api = this.props.electronAPI ?? (typeof window !== 'undefined' ? window.electronAPI : undefined);
    if (!this.state.appVersion && api?.getAppVersion) {
      api.getAppVersion().then((version) => {
        if (this.isComponentMounted && typeof version === 'string') {
          this.setState({ appVersion: version });
        }
      }).catch((err) => {
        console.warn(
          '[AppErrorBoundary] Failed to resolve app version:',
          sanitizeUserPaths(err instanceof Error ? err.message : String(err))
        );
      });
    }
  }

  componentWillUnmount(): void {
    this.isComponentMounted = false;
    if (this.copyTimeoutId) {
      clearTimeout(this.copyTimeoutId);
      this.copyTimeoutId = null;
    }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    this.setState({ errorInfo });
    console.error('[AppErrorBoundary] Uncaught renderer error:', {
      message: sanitizeUserPaths(error.message),
      stack: sanitizeUserPaths(error.stack || ''),
      causeChain: error.cause ? extractSanitizedCauseChain(error.cause) : undefined,
      componentStack: sanitizeUserPaths(errorInfo.componentStack || ''),
    });
  }

  handleReset = (): void => {
    if (this.copyTimeoutId) {
      clearTimeout(this.copyTimeoutId);
      this.copyTimeoutId = null;
    }
    if (this.isComponentMounted) {
      this.setState({
        hasError: false,
        error: null,
        errorInfo: null,
        isCopied: false,
        copyFailed: false,
      });
    }
    this.props.onReset?.();
    if (typeof document !== 'undefined') {
      const rootEl =
        document.getElementById('react-root') ??
        document.getElementById('save-editor-root');
      if (rootEl && typeof rootEl.focus === 'function') {
        rootEl.focus();
      }
      if (document.activeElement === document.body) {
        const fallbackInteractive = rootEl?.querySelector<HTMLElement>(
          'button, [tabindex="0"], [role="button"], input, select, textarea'
        );
        fallbackInteractive?.focus();
      }
    }
  };

  handleCopyDiagnostic = async (): Promise<void> => {
    try {
      const report = this.formatDiagnosticReport();
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(report);
        if (!this.isComponentMounted) return;
        if (this.copyTimeoutId) {
          clearTimeout(this.copyTimeoutId);
        }
        this.setState({ isCopied: true, copyFailed: false });
        this.copyTimeoutId = setTimeout(() => {
          if (!this.isComponentMounted) return;
          this.setState({ isCopied: false });
          this.copyTimeoutId = null;
        }, 2000);
      }
    } catch (err) {
      console.warn(
        '[AppErrorBoundary] Failed to copy diagnostic report to clipboard:',
        sanitizeUserPaths(err instanceof Error ? err.message : String(err))
      );
      if (this.isComponentMounted) {
        if (this.copyTimeoutId) {
          clearTimeout(this.copyTimeoutId);
        }
        this.setState({ copyFailed: true, isCopied: false });
        this.copyTimeoutId = setTimeout(() => {
          if (!this.isComponentMounted) return;
          this.setState({ copyFailed: false });
          this.copyTimeoutId = null;
        }, 3000);
      }
    }
  };

  formatDiagnosticReport(): string {
    const { error, errorInfo, appVersion } = this.state;
    const causeChain = error?.cause ? extractSanitizedCauseChain(error.cause) : [];
    const raw = JSON.stringify({
      timestamp: new Date().toISOString(),
      appVersion: appVersion ?? this.props.appVersion ?? null,
      message: error?.message || 'Unknown error',
      stack: error?.stack || null,
      causeChain: causeChain.length > 0 ? causeChain : undefined,
      componentStack: errorInfo?.componentStack || null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : null,
    }, null, 2);
    return sanitizeUserPaths(raw);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      const activeError = this.state.error ?? new Error('Unknown render error');
      if (this.props.fallback) {
        return this.props.fallback(activeError, this.handleReset);
      }
      const displayMessage = sanitizeUserPaths(activeError.message);
      const displayDetails = sanitizeUserPaths(activeError.stack || activeError.message);
      return (
        <div className="app-error-boundary-fallback" role="alert">
          <div className="app-error-boundary-content">
            <h2 className="app-error-boundary-title">Something went wrong</h2>
            <p className="app-error-boundary-desc">{displayMessage}</p>
            <pre className="app-error-boundary-details" tabIndex={0} aria-label="Diagnostic error details">
              {displayDetails}
            </pre>
            <div className="app-error-boundary-actions">
              <button
                type="button"
                className="app-error-boundary-btn"
                onClick={this.handleCopyDiagnostic}
                aria-live="polite"
              >
                {this.state.isCopied
                  ? 'Copied to Clipboard!'
                  : this.state.copyFailed
                    ? 'Clipboard Access Denied (Select Text Below)'
                    : 'Copy Error'}
              </button>
              <button
                type="button"
                className="app-error-boundary-btn"
                onClick={this.handleReset}
              >
                Retry
              </button>
              <button
                type="button"
                className="app-error-boundary-btn"
                onClick={() => window.location.reload()}
              >
                Reload Application
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
