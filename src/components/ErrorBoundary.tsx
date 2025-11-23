import React, { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
    children: ReactNode;
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    public state: State = {
        hasError: false,
        error: null,
    };

    public static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Uncaught error:", error, errorInfo);
    }

    public render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex flex-col items-center justify-center min-h-[400px] p-6 text-center space-y-4">
                    <div className="p-4 bg-red-100 dark:bg-red-900/20 rounded-full">
                        <AlertTriangle className="h-8 w-8 text-red-600 dark:text-red-400" />
                    </div>
                    <h2 className="text-xl font-semibold">Något gick fel</h2>
                    <p className="text-muted-foreground max-w-md">
                        Ett fel uppstod vid visning av denna komponent. Försök att ladda om sidan.
                    </p>
                    {this.state.error && (
                        <pre className="text-xs text-left bg-muted p-2 rounded overflow-auto max-w-full max-h-32">
                            {this.state.error.message}
                        </pre>
                    )}
                    <Button
                        onClick={() => {
                            this.setState({ hasError: false, error: null });
                            window.location.reload();
                        }}
                    >
                        <RefreshCw className="mr-2 h-4 w-4" />
                        Ladda om sidan
                    </Button>
                </div>
            );
        }

        return this.props.children;
    }
}
