'use client';

import { Component, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Button, Card } from '@/components/ui';

interface Props {
    children: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('ErrorBoundary caught:', error, errorInfo);
    }

    handleRetry = () => {
        this.setState({ hasError: false, error: null });
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="app-theme flex min-h-screen items-center justify-center px-4">
                    <Card className="max-w-md text-center" role="alert" aria-live="assertive">
                        <AlertCircle className="mx-auto mb-4 text-danger" size={48} aria-hidden="true" />
                        <h2 className="mb-2 text-2xl font-bold text-ink">
                            Algo deu errado
                        </h2>
                        <p className="mb-6 text-muted">
                            Ocorreu um erro inesperado. Tente recarregar a página.
                        </p>
                        <Button onClick={this.handleRetry}>
                            <RefreshCw size={18} aria-hidden="true" />
                            Tentar Novamente
                        </Button>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}
