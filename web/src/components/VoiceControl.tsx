'use client';

/**
 * VoiceControl Component - Standalone voice input control
 * Integrates Web Speech API with TaskQueue for voice-driven task automation
 */

import { useState, useCallback, useEffect } from 'react';
import {
    VoiceInputManager,
    decomposeVoiceIntent,
    type VoiceResult,
    type DecomposedIntent,
} from '@/lib/voiceInput';
import { TaskQueue, createTaskQueue } from '@/lib/taskQueue';

// ============ Styles ============

const styles = {
    container: {
        position: 'fixed' as const,
        bottom: '20px',
        right: '20px',
        zIndex: 1000,
    },
    button: {
        width: '64px',
        height: '64px',
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        transition: 'all 0.2s ease',
    },
    buttonIdle: {
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    },
    buttonListening: {
        background: 'linear-gradient(135deg, #f5576c 0%, #f093fb 100%)',
        animation: 'pulse 1.5s infinite',
    },
    buttonProcessing: {
        background: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    },
    icon: {
        width: '28px',
        height: '28px',
        fill: 'white',
    },
    feedback: {
        position: 'absolute' as const,
        bottom: '80px',
        right: '0',
        width: '280px',
        background: 'white',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
    },
    transcript: {
        fontSize: '14px',
        color: '#333',
        marginBottom: '8px',
    },
    subtasks: {
        fontSize: '12px',
        color: '#666',
        paddingLeft: '16px',
        margin: 0,
    },
    error: {
        color: '#e53e3e',
        fontSize: '13px',
    },
    notSupported: {
        fontSize: '12px',
        color: '#999',
        textAlign: 'center' as const,
    },
};

// ============ Icons ============

const MicIcon = () => (
    <svg style={styles.icon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
        <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
    </svg>
);

const StopIcon = () => (
    <svg style={styles.icon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
);

const LoadingIcon = () => (
    <svg style={{ ...styles.icon, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <circle cx="12" cy="12" r="10" fill="none" stroke="white" strokeWidth="2" strokeDasharray="30 70" />
    </svg>
);

// ============ Props ============

interface VoiceControlProps {
    onSubtasksGenerated?: (intent: DecomposedIntent) => void;
    onTranscript?: (transcript: string) => void;
    onError?: (error: Error) => void;
    taskQueue?: TaskQueue;
    autoAddToQueue?: boolean;
}

// ============ Component ============

export function VoiceControl({
    onSubtasksGenerated,
    onTranscript,
    onError,
    taskQueue,
    autoAddToQueue = true,
}: VoiceControlProps) {
    const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'error'>('idle');
    const [transcript, setTranscript] = useState<string>('');
    const [subtasks, setSubtasks] = useState<string[]>([]);
    const [error, setError] = useState<string>('');
    const [isSupported, setIsSupported] = useState(true);
    const [manager, setManager] = useState<VoiceInputManager | null>(null);

    // Initialize voice manager on mount
    useEffect(() => {
        if (!VoiceInputManager.isSupported()) {
            setIsSupported(false);
            return;
        }

        const voiceManager = new VoiceInputManager({
            lang: 'en-US',
            continuous: false,
            interimResults: true,
        });

        voiceManager.onResult(handleVoiceResult);
        voiceManager.onError(handleVoiceError);

        setManager(voiceManager);

        return () => {
            voiceManager.abort();
        };
    }, []);

    // Handle voice recognition result
    const handleVoiceResult = useCallback(async (result: VoiceResult) => {
        setTranscript(result.transcript);

        if (result.isFinal) {
            setStatus('processing');
            onTranscript?.(result.transcript);

            // Decompose into subtasks
            try {
                const intent = await decomposeVoiceIntent(result.transcript);
                setSubtasks(intent.subtasks);
                onSubtasksGenerated?.(intent);

                // Add to TaskQueue if provided and auto-add is enabled
                if (taskQueue && autoAddToQueue) {
                    // Create root task from the original command
                    const rootTask = taskQueue.createRootTask(result.transcript);

                    // Add subtasks
                    taskQueue.addSubtasks(rootTask.id, intent.subtasks);

                    console.log('[VoiceControl] Added subtasks to queue:', intent.subtasks);
                }

                setStatus('idle');
            } catch (err) {
                setError('Failed to process command');
                setStatus('error');
                onError?.(err as Error);
            }
        }
    }, [onTranscript, onSubtasksGenerated, onError, taskQueue, autoAddToQueue]);

    // Handle voice error
    const handleVoiceError = useCallback((err: Error) => {
        setError(err.message);
        setStatus('error');
        onError?.(err);
    }, [onError]);

    // Toggle listening
    const toggleListening = useCallback(() => {
        if (!manager) return;

        if (status === 'listening') {
            manager.stopListening();
            setStatus('idle');
        } else {
            setTranscript('');
            setSubtasks([]);
            setError('');
            manager.startListening();
            setStatus('listening');
        }
    }, [manager, status]);

    // Not supported message
    if (!isSupported) {
        return (
            <div style={styles.container}>
                <div style={{ ...styles.feedback, width: '200px' }}>
                    <p style={styles.notSupported}>
                        🎤 Voice input not supported in this browser.
                        Try Chrome or Edge.
                    </p>
                </div>
            </div>
        );
    }

    // Get button style based on status
    const getButtonStyle = () => {
        switch (status) {
            case 'listening':
                return { ...styles.button, ...styles.buttonListening };
            case 'processing':
                return { ...styles.button, ...styles.buttonProcessing };
            default:
                return { ...styles.button, ...styles.buttonIdle };
        }
    };

    // Get button icon based on status
    const getIcon = () => {
        switch (status) {
            case 'listening':
                return <StopIcon />;
            case 'processing':
                return <LoadingIcon />;
            default:
                return <MicIcon />;
        }
    };

    return (
        <div style={styles.container}>
            {/* CSS for animations */}
            <style>{`
                @keyframes pulse {
                    0%, 100% { transform: scale(1); box-shadow: 0 4px 12px rgba(245, 87, 108, 0.4); }
                    50% { transform: scale(1.05); box-shadow: 0 8px 24px rgba(245, 87, 108, 0.6); }
                }
                @keyframes spin {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
            `}</style>

            {/* Feedback panel */}
            {(transcript || subtasks.length > 0 || error) && (
                <div style={styles.feedback}>
                    {error ? (
                        <p style={styles.error}>⚠️ {error}</p>
                    ) : (
                        <>
                            {transcript && (
                                <p style={styles.transcript}>
                                    🎤 "{transcript}"
                                </p>
                            )}
                            {subtasks.length > 0 && (
                                <ul style={styles.subtasks}>
                                    {subtasks.map((task, i) => (
                                        <li key={i}>{task}</li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            )}

            {/* Voice button */}
            <button
                style={getButtonStyle()}
                onClick={toggleListening}
                disabled={status === 'processing'}
                title={status === 'listening' ? 'Stop listening' : 'Start voice command'}
            >
                {getIcon()}
            </button>
        </div>
    );
}

// ============ Hook for Custom Integration ============

/**
 * Hook for voice input with TaskQueue integration
 * Use this for custom UI implementations
 */
export function useVoiceToTask(taskQueue?: TaskQueue) {
    const [isListening, setIsListening] = useState(false);
    const [transcript, setTranscript] = useState('');
    const [subtasks, setSubtasks] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const startListening = useCallback(async () => {
        if (!VoiceInputManager.isSupported()) {
            setError('Voice not supported');
            return;
        }

        setIsListening(true);
        setTranscript('');
        setSubtasks([]);
        setError(null);

        const manager = new VoiceInputManager({ continuous: false });

        manager.onResult(async (result) => {
            setTranscript(result.transcript);

            if (result.isFinal) {
                setIsListening(false);
                setIsProcessing(true);

                try {
                    const intent = await decomposeVoiceIntent(result.transcript);
                    setSubtasks(intent.subtasks);

                    if (taskQueue) {
                        const rootTask = taskQueue.createRootTask(result.transcript);
                        taskQueue.addSubtasks(rootTask.id, intent.subtasks);
                    }
                } catch (err) {
                    setError((err as Error).message);
                } finally {
                    setIsProcessing(false);
                }
            }
        });

        manager.onError((err) => {
            setError(err.message);
            setIsListening(false);
        });

        manager.startListening();
    }, [taskQueue]);

    const stopListening = useCallback(() => {
        setIsListening(false);
    }, []);

    return {
        isListening,
        transcript,
        subtasks,
        isProcessing,
        error,
        startListening,
        stopListening,
        isSupported: VoiceInputManager.isSupported(),
    };
}

export default VoiceControl;
