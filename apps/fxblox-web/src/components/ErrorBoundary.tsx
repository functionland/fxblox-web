// Port of apps/box/src/components/ErrorBoundary.tsx — the DEV `Alert.alert` becomes the inline error message.
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { FxBox, FxButton, FxText } from '@functionland/fx-ui';
import i18n from '@/i18n';
import { env } from '@/config/env';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <ErrorFallback
          message={env.DEV && this.state.error ? this.state.error.message : undefined}
          onRetry={this.handleRetry}
          onReload={this.handleReload}
        />
      );
    }
    return this.props.children;
  }
}

export interface ErrorFallbackProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onReload?: () => void;
  extraAction?: ReactNode;
}

/** The default error UI (also used by the router `errorElement`). */
export function ErrorFallback({
  title,
  message,
  onRetry,
  onReload,
  extraAction,
}: ErrorFallbackProps) {
  const t = i18n.t.bind(i18n);
  return (
    <FxBox
      role="alert"
      flex={1}
      justifyContent="center"
      alignItems="center"
      padding="20"
      backgroundColor="backgroundApp"
      minHeight="60dvh"
      data-screen="error"
    >
      <FxText variant="bodyMediumRegular" color="errorBase" textAlign="center" marginBottom="16">
        {title ?? t('shell.error.title')}
      </FxText>
      <FxText
        variant="bodyMediumRegular"
        color="content2"
        textAlign="center"
        marginBottom="24"
        maxWidth={560}
      >
        {message ?? t('shell.error.description')}
      </FxText>
      <FxBox flexDirection="row" gap="12" flexWrap="wrap" justifyContent="center">
        {onRetry && <FxButton onPress={onRetry}>{t('shell.error.retry')}</FxButton>}
        {onReload && (
          <FxButton variant="inverted" onPress={onReload}>
            {t('shell.error.reload')}
          </FxButton>
        )}
        {extraAction}
      </FxBox>
    </FxBox>
  );
}

export const withErrorBoundary = <P extends object>(
  Wrapped: React.ComponentType<P>,
  errorBoundaryProps?: Omit<Props, 'children'>,
) => {
  const WrappedComponent = (props: P) => (
    <ErrorBoundary {...errorBoundaryProps}>
      <Wrapped {...props} />
    </ErrorBoundary>
  );
  WrappedComponent.displayName = `withErrorBoundary(${Wrapped.displayName || Wrapped.name})`;
  return WrappedComponent;
};
