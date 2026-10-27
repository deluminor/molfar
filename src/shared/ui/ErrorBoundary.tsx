import { Component, type ErrorInfo, type ReactNode } from "react";
import { SecondaryButton } from "./SecondaryButton";

type Props = {
  /** Names the failing area in the log line, e.g. "main window". */
  scope: string;
  /** `reload` restarts the window; `retry` re-mounts only the children. */
  recovery: "reload" | "retry";
  /** Runs before a `retry` re-mount, e.g. to drop a cached failure. */
  onRetry?: () => void;
  children?: ReactNode;
};

type State = { error: unknown };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error ?? new Error("Unknown render error") };
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`${this.props.scope}: render failed`, {
      error,
      componentStack: info.componentStack ?? "",
    });
  }

  private readonly recover = (): void => {
    if (this.props.recovery === "reload") {
      window.location.reload();
      return;
    }
    this.props.onRetry?.();
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    const root = this.props.recovery === "reload";
    return (
      <div
        role="alert"
        className={`flex flex-col items-center justify-center gap-3 p-6 text-center ${root ? "h-screen" : "h-full"}`}
      >
        <p className="text-[13px] text-content/80">
          {root ? "MOLFAR hit an unexpected error." : "This view failed to load."}
        </p>
        <p className="max-w-md break-words text-[12px] text-content/50">{errorMessage(error)}</p>
        <SecondaryButton onClick={this.recover}>{root ? "Reload" : "Try again"}</SecondaryButton>
      </div>
    );
  }
}
