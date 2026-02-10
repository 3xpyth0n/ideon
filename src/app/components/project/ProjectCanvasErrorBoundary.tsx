"use client";

import React, { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
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

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
          <div className="rounded-full bg-destructive/10 p-4 text-destructive">
            <AlertTriangle className="h-8 w-8" />
          </div>
          <div className="max-w-md space-y-2">
            <h2 className="text-xl font-semibold tracking-tight">
              Something went wrong
            </h2>
            <p className="text-sm text-muted-foreground">
              We encountered an error while rendering the canvas. This might be
              due to a temporary glitch or a corrupted block.
            </p>
          </div>
          <div className="rounded-md bg-muted p-4 text-left text-xs font-mono text-muted-foreground max-w-lg w-full overflow-auto max-h-40">
            {this.state.error?.message || "Unknown error"}
          </div>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 py-2 gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
