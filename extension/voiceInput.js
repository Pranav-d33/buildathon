/**
 * Voice Input Module - Web Speech API Integration
 * Uses browser-native SpeechRecognition for voice commands
 */

// ============ Types ============

/**
 * Voice recognition state
 */
const VoiceState = {
    IDLE: 'idle',
    LISTENING: 'listening',
    PROCESSING: 'processing',
    ERROR: 'error'
};

/**
 * Voice input event callbacks
 */
let callbacks = {
    onTranscript: null,
    onInterimTranscript: null,
    onStateChange: null,
    onError: null
};

// ============ State ============

let recognition = null;
let currentState = VoiceState.IDLE;
let isInitialized = false;

// ============ Initialization ============

/**
 * Check if Web Speech API is available
 */
function isWebSpeechSupported() {
    return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

/**
 * Initialize the voice recognition system
 */
function initVoiceRecognition(options = {}) {
    if (isInitialized && recognition) {
        return true;
    }

    if (!isWebSpeechSupported()) {
        console.error('[Voice] Web Speech API is not supported in this browser');
        return false;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();

    // Configuration
    recognition.continuous = options.continuous || false;
    recognition.interimResults = options.interimResults !== false;
    recognition.lang = options.lang || 'en-US';
    recognition.maxAlternatives = options.maxAlternatives || 1;

    // Event handlers
    recognition.onstart = () => {
        console.log('[Voice] Recognition started');
        updateState(VoiceState.LISTENING);
    };

    recognition.onresult = (event) => {
        const results = event.results;
        const latest = results[results.length - 1];

        if (latest.isFinal) {
            const transcript = latest[0].transcript.trim();
            const confidence = latest[0].confidence;

            console.log(`[Voice] Final transcript: "${transcript}" (confidence: ${(confidence * 100).toFixed(1)}%)`);

            if (callbacks.onTranscript) {
                callbacks.onTranscript(transcript, confidence);
            }
        } else {
            const interimTranscript = latest[0].transcript.trim();

            if (callbacks.onInterimTranscript) {
                callbacks.onInterimTranscript(interimTranscript);
            }
        }
    };

    recognition.onerror = (event) => {
        console.error('[Voice] Recognition error:', event.error);
        updateState(VoiceState.ERROR);

        if (callbacks.onError) {
            callbacks.onError(event.error, getErrorMessage(event.error));
        }
    };

    recognition.onend = () => {
        console.log('[Voice] Recognition ended');
        if (currentState === VoiceState.LISTENING) {
            updateState(VoiceState.IDLE);
        }
    };

    recognition.onnomatch = () => {
        console.log('[Voice] No match found');
        if (callbacks.onError) {
            callbacks.onError('no-match', 'Could not understand. Please try again.');
        }
    };

    isInitialized = true;
    console.log('[Voice] Recognition initialized');
    return true;
}

// ============ Control Functions ============

/**
 * Start listening for voice input
 */
function startListening() {
    if (!isInitialized) {
        if (!initVoiceRecognition()) {
            if (callbacks.onError) {
                callbacks.onError('not-supported', 'Web Speech API is not supported');
            }
            return false;
        }
    }

    if (currentState === VoiceState.LISTENING) {
        console.log('[Voice] Already listening');
        return true;
    }

    try {
        recognition.start();
        return true;
    } catch (error) {
        console.error('[Voice] Failed to start:', error);
        if (callbacks.onError) {
            callbacks.onError('start-failed', error.message);
        }
        return false;
    }
}

/**
 * Stop listening for voice input
 */
function stopListening() {
    if (!recognition || currentState !== VoiceState.LISTENING) {
        return;
    }

    try {
        recognition.stop();
        updateState(VoiceState.IDLE);
    } catch (error) {
        console.error('[Voice] Failed to stop:', error);
    }
}

/**
 * Abort current recognition (discard results)
 */
function abortListening() {
    if (!recognition) return;

    try {
        recognition.abort();
        updateState(VoiceState.IDLE);
    } catch (error) {
        console.error('[Voice] Failed to abort:', error);
    }
}

// ============ Callback Registration ============

/**
 * Set callback for final transcript
 */
function onTranscript(callback) {
    callbacks.onTranscript = callback;
}

/**
 * Set callback for interim (in-progress) transcript
 */
function onInterimTranscript(callback) {
    callbacks.onInterimTranscript = callback;
}

/**
 * Set callback for state changes
 */
function onStateChange(callback) {
    callbacks.onStateChange = callback;
}

/**
 * Set callback for errors
 */
function onError(callback) {
    callbacks.onError = callback;
}

// ============ State Management ============

/**
 * Update recognition state
 */
function updateState(newState) {
    const oldState = currentState;
    currentState = newState;

    if (callbacks.onStateChange && oldState !== newState) {
        callbacks.onStateChange(newState, oldState);
    }
}

/**
 * Get current state
 */
function getState() {
    return currentState;
}

/**
 * Check if currently listening
 */
function isListening() {
    return currentState === VoiceState.LISTENING;
}

// ============ Utility Functions ============

/**
 * Get human-readable error message
 */
function getErrorMessage(errorCode) {
    const messages = {
        'no-speech': 'No speech was detected. Please try again.',
        'aborted': 'Voice recognition was cancelled.',
        'audio-capture': 'No microphone was found. Please check your settings.',
        'not-allowed': 'Microphone permission was denied. Please allow access.',
        'network': 'Network error occurred. Please check your connection.',
        'service-not-allowed': 'Speech service is not allowed.',
        'bad-grammar': 'Speech grammar error.',
        'language-not-supported': 'Language is not supported.'
    };

    return messages[errorCode] || 'An error occurred with voice recognition.';
}

/**
 * Request microphone permission explicitly
 */
async function requestMicrophonePermission() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (error) {
        console.error('[Voice] Microphone permission denied:', error);
        return false;
    }
}

/**
 * Get supported languages
 */
function getSupportedLanguages() {
    return [
        { code: 'en-US', name: 'English (US)' },
        { code: 'en-GB', name: 'English (UK)' },
        { code: 'en-IN', name: 'English (India)' },
        { code: 'hi-IN', name: 'Hindi' },
        { code: 'ta-IN', name: 'Tamil' },
        { code: 'te-IN', name: 'Telugu' },
        { code: 'mr-IN', name: 'Marathi' },
        { code: 'bn-IN', name: 'Bengali' },
        { code: 'gu-IN', name: 'Gujarati' },
        { code: 'kn-IN', name: 'Kannada' },
        { code: 'ml-IN', name: 'Malayalam' },
        { code: 'pa-IN', name: 'Punjabi' }
    ];
}

/**
 * Set recognition language
 */
function setLanguage(langCode) {
    if (recognition) {
        recognition.lang = langCode;
        console.log('[Voice] Language set to:', langCode);
    }
}

// ============ Export for extension ============

// Make functions globally available for content script
window.OperoVoice = {
    // Initialization
    isSupported: isWebSpeechSupported,
    init: initVoiceRecognition,
    requestPermission: requestMicrophonePermission,

    // Control
    start: startListening,
    stop: stopListening,
    abort: abortListening,

    // Callbacks
    onTranscript,
    onInterimTranscript,
    onStateChange,
    onError,

    // State
    getState,
    isListening,
    VoiceState,

    // Configuration
    setLanguage,
    getSupportedLanguages
};

console.log('[Voice] Module loaded. Access via window.OperoVoice');
