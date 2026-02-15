"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw, MessageSquare } from "lucide-react";
import { useI18n } from "@providers/I18nProvider";
import { toast } from "sonner";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

function ErrorBoundaryView({ error }: { error: Error | null }) {
  const { dict } = useI18n();

  const errorMessage = error?.message || dict.common.unknownError;

  const handleCopy = () => {
    navigator.clipboard
      .writeText(errorMessage)
      .then(() => {
        toast.success(dict.common.copiedToClipboard);
      })
      .catch(() => {
        toast.error(dict.common.failedToCopy);
      });
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
      <div className="rounded-full bg-destructive/10 p-4 text-destructive">
        <AlertTriangle className="h-8 w-8" />
      </div>
      <div className="max-w-md space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">
          {dict.common.canvasErrorTitle}
        </h2>
        <p className="text-sm">{dict.common.canvasErrorDescription}</p>
      </div>
      <div className="flex w-full max-w-4xl flex-col gap-2 p-4">
        <span className="error-message-hint">
          {dict.common.clickToCopyError}
        </span>
        <div className="error-message" onClick={handleCopy}>
          {errorMessage}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button
          onClick={() => window.location.reload()}
          className="btn-primary"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          {dict.common.reloadPage}
        </button>
        <a
          href="https://github.com/3xpyth0n/ideon/issues"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary"
        >
          <MessageSquare className="h-4 w-4 mr-2" />
          {dict.common.contactSupport}
        </a>
      </div>
    </div>
  );
}

export class ProjectCanvasErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in ProjectCanvas:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <ErrorBoundaryView error={this.state.error} />;
    }
    return this.props.children;
  }
}
