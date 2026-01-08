/**
 * Voice Input - Speech-to-Text using Web Speech API
 * Provides browser-native STT with intent decomposition for TaskQueue
 */

import { callLLM, MODELS } from '@/lib/llm';

// ============ Types ============

export interface VoiceInputConfig {
    lang?: string;
    continuous?: boolean;
    interimResults?: boolean;
    maxAlternatives?: number;
}

export interface VoiceResult {
    transcript: string;
    confidence: number;
    isFinal: boolean;
}

export interface DecomposedIntent {
    originalTranscript: string;
    subtasks: string[];
    reasoning: string;
}

type VoiceCallback = (result: VoiceResult) => void;
type ErrorCallback = (error: Error) => void;

// ============ Web Speech API Types ============

// TypeScript types for Web Speech API (not always included in lib.dom.d.ts)
interface SpeechRecognitionEvent extends Event {
    results: SpeechRecognitionResultList;
    resultIndex: number;
}

interface SpeechRecognitionResultList {
    length: number;
    item(index: number): SpeechRecognitionResult;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
    length: number;
    item(index: number): SpeechRecognitionAlternative;
    [index: number]: SpeechRecognitionAlternative;
    isFinal: boolean;
}

interface SpeechRecognitionAlternative {
    transcript: string;
    confidence: number;
}

interface SpeechRecognitionErrorEvent extends Event {
    error: string;
    message: string;
}

// ============ Voice Input Manager Class ============

/**
 * VoiceInputManager - Wrapper for Web Speech API
 * Handles speech recognition with callbacks for results and errors
 */
export class VoiceInputManager {
    private recognition: any;
    private isListening: boolean = false;
    private onResultCallback: VoiceCallback | null = null;
    private onErrorCallback: ErrorCallback | null = null;
    private config: VoiceInputConfig;

    constructor(config: VoiceInputConfig = {}) {
        this.config = {
            lang: config.lang || 'en-US',
            continuous: config.continuous ?? false,
            interimResults: config.interimResults ?? true,
            maxAlternatives: config.maxAlternatives || 1,
        };

        this.initRecognition();
    }

    /**
     * Initialize the Web Speech API recognition object
     */
    private initRecognition(): void {
        // Check for browser support
        const SpeechRecognition =
            (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition;

        if (!SpeechRecognition) {
            console.error('[Voice] Web Speech API not supported in this browser');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.lang = this.config.lang;
        this.recognition.continuous = this.config.continuous;
        this.recognition.interimResults = this.config.interimResults;
        this.recognition.maxAlternatives = this.config.maxAlternatives;

        // Handle results
        this.recognition.onresult = (event: SpeechRecognitionEvent) => {
            const result = event.results[event.resultIndex];
            const voiceResult: VoiceResult = {
                transcript: result[0].transcript,
                confidence: result[0].confidence,
                isFinal: result.isFinal,
            };

            console.log(`[Voice] ${voiceResult.isFinal ? 'Final' : 'Interim'}: "${voiceResult.transcript}" (${(voiceResult.confidence * 100).toFixed(0)}%)`);

            this.onResultCallback?.(voiceResult);
        };

        // Handle errors
        this.recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.error('[Voice] Error:', event.error, event.message);
            this.onErrorCallback?.(new Error(`Speech recognition error: ${event.error}`));
        };

        // Handle end of speech
        this.recognition.onend = () => {
            console.log('[Voice] Recognition ended');
            this.isListening = false;
        };

        // Handle start
        this.recognition.onstart = () => {
            console.log('[Voice] Recognition started');
            this.isListening = true;
        };

        console.log('[Voice] Initialized with lang:', this.config.lang);
    }

    /**
     * Check if Web Speech API is available
     */
    static isSupported(): boolean {
        return !!(
            (window as any).SpeechRecognition ||
            (window as any).webkitSpeechRecognition
        );
    }

    /**
     * Start listening for speech input
     */
    startListening(): void {
        if (!this.recognition) {
            console.error('[Voice] Recognition not initialized');
            return;
        }

        if (this.isListening) {
            console.warn('[Voice] Already listening');
            return;
        }

        try {
            this.recognition.start();
        } catch (error) {
            console.error('[Voice] Failed to start:', error);
        }
    }

    /**
     * Stop listening
     */
    stopListening(): void {
        if (!this.recognition) return;

        try {
            this.recognition.stop();
        } catch (error) {
            console.error('[Voice] Failed to stop:', error);
        }
    }

    /**
     * Abort recognition (cancels without firing end event)
     */
    abort(): void {
        if (!this.recognition) return;

        try {
            this.recognition.abort();
            this.isListening = false;
        } catch (error) {
            console.error('[Voice] Failed to abort:', error);
        }
    }

    /**
     * Register callback for speech results
     */
    onResult(callback: VoiceCallback): void {
        this.onResultCallback = callback;
    }

    /**
     * Register callback for errors
     */
    onError(callback: ErrorCallback): void {
        this.onErrorCallback = callback;
    }

    /**
     * Check if currently listening
     */
    getIsListening(): boolean {
        return this.isListening;
    }

    /**
     * Change language
     */
    setLanguage(lang: string): void {
        this.config.lang = lang;
        if (this.recognition) {
            this.recognition.lang = lang;
        }
    }
}

// ============ Intent Decomposition ============

/**
 * Decompose a voice command into subtasks using LLM
 * Converts "Book a flight to Delhi on the 12th" into actionable steps
 */
export async function decomposeVoiceIntent(
    transcript: string
): Promise<DecomposedIntent> {
    const prompt = `You are receiving a voice command from a user who wants to automate a browser task.

VOICE COMMAND:
"${transcript}"

Convert this into a list of specific, actionable subtasks that a browser automation agent can execute.
Each subtask should be a single, clear action.

Examples of good subtasks:
- "Navigate to google.com"
- "Search for flights to Delhi on December 12"
- "Click on the cheapest flight option"
- "Fill in passenger name field with 'John Doe'"

Respond in JSON format:
{
    "subtasks": ["subtask1", "subtask2", "subtask3", ...],
    "reasoning": "Brief explanation of how you broke down the command"
}

Return 1-5 subtasks. Be specific and actionable.`;

    try {
        const response = await callLLM(
            [
                { role: 'system', content: 'You are an intent decomposition system for browser automation. Convert natural language commands into specific, executable subtasks.' },
                { role: 'user', content: prompt }
            ],
            MODELS.CONVERSATION
        );

        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const parsed = JSON.parse(cleaned);

        return {
            originalTranscript: transcript,
            subtasks: parsed.subtasks || [transcript],
            reasoning: parsed.reasoning || 'Direct command',
        };
    } catch (error) {
        console.error('[Voice] Intent decomposition failed:', error);
        // Fallback: use the transcript as a single task
        return {
            originalTranscript: transcript,
            subtasks: [transcript],
            reasoning: 'Fallback: using original command',
        };
    }
}

// ============ Factory Function ============

/**
 * Create a new VoiceInputManager instance
 */
export function createVoiceInput(config?: VoiceInputConfig): VoiceInputManager {
    return new VoiceInputManager(config);
}

/**
 * Quick function to capture a single voice command
 * Returns a promise that resolves with the final transcript
 */
export function captureVoiceCommand(
    timeoutMs: number = 10000
): Promise<string> {
    return new Promise((resolve, reject) => {
        if (!VoiceInputManager.isSupported()) {
            reject(new Error('Web Speech API not supported'));
            return;
        }

        const manager = new VoiceInputManager({ continuous: false });
        let resolved = false;

        // Set timeout
        const timeout = setTimeout(() => {
            if (!resolved) {
                manager.abort();
                reject(new Error('Voice capture timed out'));
            }
        }, timeoutMs);

        // Handle result
        manager.onResult((result) => {
            if (result.isFinal && !resolved) {
                resolved = true;
                clearTimeout(timeout);
                manager.stopListening();
                resolve(result.transcript);
            }
        });

        // Handle error
        manager.onError((error) => {
            if (!resolved) {
                resolved = true;
                clearTimeout(timeout);
                reject(error);
            }
        });

        // Start listening
        manager.startListening();
    });
}
