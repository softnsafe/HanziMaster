import React, { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, RefreshCw } from 'lucide-react';

interface ServiceStatus {
    status: 'operational' | 'degraded' | 'failed' | 'unreachable' | 'configured' | 'missing_configuration' | 'unknown';
    message: string;
    count?: number;
}

interface SystemStatusData {
    makemehanzi: ServiceStatus;
    tatoeba: ServiceStatus;
    gemini: ServiceStatus;
}

export const SystemStatus: React.FC = () => {
    const [status, setStatus] = useState<SystemStatusData | null>(null);
    const [loading, setLoading] = useState(false);
    const [hanziWriterStatus, setHanziWriterStatus] = useState<'checking' | 'ok' | 'error'>('checking');

    const checkStatus = async () => {
        setLoading(true);
        try {
            const res = await fetch('/api/system-status');
            if (res.ok) {
                const data = await res.json();
                setStatus(data);
            }
        } catch (e) {
            console.error("Failed to fetch system status", e);
        } finally {
            setLoading(false);
        }

        // Check Hanzi Writer CDN
        setHanziWriterStatus('checking');
        try {
            const hwRes = await fetch('https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0/wo3.json');
            if (hwRes.ok) {
                setHanziWriterStatus('ok');
            } else {
                setHanziWriterStatus('error');
            }
        } catch (e) {
            setHanziWriterStatus('error');
        }
    };

    useEffect(() => {
        checkStatus();
    }, []);

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'operational':
            case 'configured':
            case 'ok':
                return <CheckCircle2 className="w-5 h-5 text-emerald-500" />;
            case 'degraded':
                return <AlertTriangle className="w-5 h-5 text-amber-500" />;
            case 'failed':
            case 'unreachable':
            case 'missing_configuration':
            case 'error':
                return <XCircle className="w-5 h-5 text-rose-500" />;
            default:
                return <div className="w-5 h-5 rounded-full bg-slate-200" />;
        }
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'operational':
            case 'configured':
            case 'ok':
                return 'text-emerald-700 bg-emerald-50 border-emerald-100';
            case 'degraded':
                return 'text-amber-700 bg-amber-50 border-amber-100';
            case 'failed':
            case 'unreachable':
            case 'missing_configuration':
            case 'error':
                return 'text-rose-700 bg-rose-50 border-rose-100';
            default:
                return 'text-slate-700 bg-slate-50 border-slate-100';
        }
    };

    return (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-slate-800">System Health Check</h3>
                <button 
                    onClick={checkStatus}
                    disabled={loading}
                    className="p-2 hover:bg-slate-50 rounded-full transition-colors disabled:opacity-50"
                >
                    <RefreshCw className={`w-5 h-5 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
                </button>
            </div>

            <div className="space-y-4">
                {/* MakeMeHanzi Dictionary */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${getStatusColor(status?.makemehanzi.status || 'unknown')}`}>
                    {getStatusIcon(status?.makemehanzi.status || 'unknown')}
                    <div>
                        <div className="font-semibold">MakeMeHanzi Dictionary</div>
                        <div className="text-sm opacity-90">
                            {status ? status.makemehanzi.message : 'Checking...'}
                        </div>
                        <div className="text-xs mt-1 opacity-75">
                            Source for: Pinyin, Definitions, Radical, Stroke Count
                        </div>
                    </div>
                </div>

                {/* Tatoeba */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${getStatusColor(status?.tatoeba.status || 'unknown')}`}>
                    {getStatusIcon(status?.tatoeba.status || 'unknown')}
                    <div>
                        <div className="font-semibold">Tatoeba API</div>
                        <div className="text-sm opacity-90">
                            {status ? status.tatoeba.message : 'Checking...'}
                        </div>
                        <div className="text-xs mt-1 opacity-75">
                            Source for: Example Sentences (Primary)
                        </div>
                    </div>
                </div>

                {/* Gemini AI */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${getStatusColor(status?.gemini.status || 'unknown')}`}>
                    {getStatusIcon(status?.gemini.status || 'unknown')}
                    <div>
                        <div className="font-semibold">Gemini AI</div>
                        <div className="text-sm opacity-90">
                            {status ? status.gemini.message : 'Checking...'}
                        </div>
                        <div className="text-xs mt-1 opacity-75">
                            Source for: Fallback for all data + Sentence Generation
                        </div>
                    </div>
                </div>

                {/* Hanzi Writer CDN */}
                <div className={`p-4 rounded-xl border flex items-start gap-3 ${getStatusColor(hanziWriterStatus)}`}>
                    {getStatusIcon(hanziWriterStatus)}
                    <div>
                        <div className="font-semibold">Hanzi Writer CDN</div>
                        <div className="text-sm opacity-90">
                            {hanziWriterStatus === 'checking' ? 'Checking connection...' : 
                             hanziWriterStatus === 'ok' ? 'Connected to CDN' : 'Failed to reach CDN'}
                        </div>
                        <div className="text-xs mt-1 opacity-75">
                            Source for: Stroke Animation Data (Client-side)
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
