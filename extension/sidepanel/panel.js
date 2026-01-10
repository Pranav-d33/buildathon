// Side Panel JavaScript
// With Context Awareness Integration and Memory

// State
let currentTask = null;
let isExecuting = false;
let isPaused = false;
let currentTabId = null;
let currentContext = null; // Stores browser context

// Memory State - Dialogue History & Agent History
let chatHistory = [];      // Array of {role: 'user'|'assistant', content: string}
let agentHistory = [];     // Array of step records for working memory
let currentGoal = null;    // Active goal for continuous execution
let loopRunning = false;   // Whether autonomous loop is active

// DOM Elements
const chatEl = document.getElementById('chat');
const logContainer = document.getElementById('log-container');
const logEl = document.getElementById('log');
const inputEl = document.getElementById('user-input');
const sendBtn = document.getElementById('send-btn');
const voiceBtn = document.getElementById('voice-btn');
const pauseBtn = document.getElementById('pause-btn');
const resumeBtn = document.getElementById('resume-btn');
const takeoverBtn = document.getElementById('takeover-btn');
const controlsEl = document.getElementById('controls');
const statusEl = document.getElementById('status');
const toggleLogBtn = document.getElementById('toggle-log');

// Initialize
async function init() {
    // Get current tab
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTabId = tab?.id;

    // Check if content script is connected by trying to send a message
    if (currentTabId) {
        try {
            await chrome.tabs.sendMessage(currentTabId, { type: 'PING' });
            updateStatus(true);

            // Fetch initial context
            await refreshContext();

        } catch (e) {
            // Content script not loaded on this page
            updateStatus(false);
            addMessage("⚠️ Please navigate to a website first, then click the extension icon again.");
        }
    } else {
        updateStatus(false);
    }

    // Event listeners
    sendBtn.addEventListener('click', handleSend);
    inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    voiceBtn.addEventListener('click', handleVoice);
    pauseBtn.addEventListener('click', handlePause);
    resumeBtn.addEventListener('click', handleResume);
    takeoverBtn.addEventListener('click', handleTakeover);
    toggleLogBtn.addEventListener('click', toggleLog);

    // Refresh context periodically and on tab updates
    setInterval(refreshContext, 5000);
}

// ============ Context Awareness ============

// Fetch full context from content script
async function refreshContext() {
    if (!currentTabId) return null;

    try {
        const response = await chrome.tabs.sendMessage(currentTabId, { type: 'GET_FULL_CONTEXT' });
        if (response.success !== false) {
            currentContext = response;
            console.log('[Panel] Context updated:', summarizeContextForLog(response));
            return response;
        }
    } catch (e) {
        console.log('[Panel] Failed to get context:', e.message);
    }
    return null;
}

// Create a human-readable summary of context
function summarizeContextForLog(ctx) {
    if (!ctx || !ctx.browser) return 'No context';
    const b = ctx.browser;
    return `${b.title} | ${b.visibleInputs?.length || 0} inputs, ${b.buttons?.length || 0} buttons`;
}

// Build context summary for LLM
function buildContextSummary(ctx) {
    if (!ctx || !ctx.browser) return null;

    const b = ctx.browser;
    const u = ctx.user || {};

    // Build visible fields list
    const fields = (b.visibleInputs || []).map(input => ({
        label: input.label || input.name || input.placeholder || 'Unnamed',
        type: input.type,
        filled: Boolean(input.value && input.value.length > 0)
    }));

    // Format last action
    let lastAction = 'None';
    if (u.lastAction?.type) {
        switch (u.lastAction.type) {
            case 'CLICK':
                lastAction = `Clicked element`;
                break;
            case 'INPUT':
                lastAction = `Typing in ${u.focusedLabel || 'field'}`;
                break;
            case 'FOCUS':
                lastAction = `Focused on ${u.focusedLabel || 'field'}`;
                break;
            case 'SCROLL':
                lastAction = `Scrolled ${u.scrollDirection || 'page'}`;
                break;
        }
    }

    return {
        page: b.title,
        url: b.url,
        domain: b.domain,
        visibleFields: fields,
        focusedField: u.focusedLabel || u.focusedElement || null,
        lastUserAction: lastAction,
        confidence: calculateSimpleConfidence(b),
        timestamp: Date.now()
    };
}

// Simple confidence calculation (mirrors server-side logic)
function calculateSimpleConfidence(browser) {
    let score = 100;

    if (!browser.visibleInputs || browser.visibleInputs.length === 0) {
        score -= 30;
    }

    const inputsWithLabels = (browser.visibleInputs || []).filter(i => i.label && i.label.length > 0);
    const labelRatio = browser.visibleInputs?.length > 0
        ? inputsWithLabels.length / browser.visibleInputs.length
        : 0;

    if (labelRatio < 0.5) {
        score -= 20;
    }

    return Math.max(0, Math.min(100, score));
}

// Format context as text for LLM prompt
function contextToPromptText(summary) {
    if (!summary) return '';

    const fieldsList = summary.visibleFields
        .map(f => `- ${f.label} (${f.type})${f.filled ? ' [filled]' : ''}`)
        .join('\n');

    return `Page: ${summary.page}
URL: ${summary.url}

Visible fields:
${fieldsList || '(no visible fields)'}

Focused field: ${summary.focusedField || 'None'}
User last action: ${summary.lastUserAction}`;
}

// ============ Status & Connection ============

// Update connection status
function updateStatus(connected) {
    statusEl.className = `status ${connected ? 'connected' : 'disconnected'}`;
    statusEl.querySelector('.status-text').textContent = connected ? 'Connected' : 'Disconnected';
}

// ============ Chat UI ============

// Add message to chat and store in history
function addMessage(content, role = 'assistant', storeInHistory = true) {
    const msgEl = document.createElement('div');
    msgEl.className = `message ${role}`;

    let textContent = '';
    if (typeof content === 'string') {
        msgEl.innerHTML = `<p>${content}</p>`;
        // Strip HTML for history storage
        textContent = content.replace(/<[^>]*>/g, '');
    } else {
        content.forEach(p => {
            const pEl = document.createElement('p');
            pEl.textContent = p;
            msgEl.appendChild(pEl);
        });
        textContent = content.join('\n');
    }

    chatEl.appendChild(msgEl);
    chatEl.scrollTop = chatEl.scrollHeight;

    // Store in chat history for context persistence
    if (storeInHistory && textContent) {
        chatHistory.push({ role, content: textContent, timestamp: Date.now() });
        // Keep last 20 messages to avoid memory bloat
        if (chatHistory.length > 20) {
            chatHistory = chatHistory.slice(-20);
        }
        console.log('[Panel] Chat history updated:', chatHistory.length, 'messages');
    }
}

// Add log entry
function addLog(text, type = 'info') {
    const time = new Date().toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });

    const entry = document.createElement('div');
    entry.className = `log-entry ${type}`;
    entry.innerHTML = `<span class="time">${time}</span><span>${text}</span>`;

    logEl.appendChild(entry);
    logEl.scrollTop = logEl.scrollHeight;

    // Show log container
    logContainer.classList.remove('hidden');
}

// ============ Message Handling ============

// Handle send message
async function handleSend() {
    const text = inputEl.value.trim();
    if (!text) return;

    // Show user message and store in history
    addMessage(text, 'user', true);
    inputEl.value = '';

    // Refresh context before processing
    await refreshContext();

    // Process the message
    await processUserMessage(text);
}

// Process user message with AI-driven actions
async function processUserMessage(text) {
    addLog('Processing message...', 'info');

    // Build context summary
    const contextSummary = buildContextSummary(currentContext);

    if (contextSummary) {
        addLog(`Page: ${contextSummary.page} (${contextSummary.visibleFields.length} fields)`, 'info');
    }

    // Try to call the agentic chat API
    const API_URL = 'http://localhost:3000/api/ai';

    try {
        // Build conversation history for context (last 10 messages)
        const recentHistory = chatHistory.slice(-10).map(m => ({
            role: m.role,
            content: m.content
        }));

        // Build agent step history for working memory (last 5 steps)
        const recentAgentHistory = agentHistory.slice(-5);

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'agent_chat',
                data: {
                    message: text,
                    pageContext: contextSummary,
                    conversationHistory: recentHistory,
                    agentHistory: recentAgentHistory,
                    currentUrl: contextSummary?.url,
                    currentDomain: contextSummary?.domain
                }
            })
        });

        if (response.ok) {
            const result = await response.json();
            addLog('Got AI response', 'success');
            console.log('[Panel] Agent response:', result);

            // Show the AI's message and store in history
            if (result.message) {
                addMessage(result.message, 'assistant', true);
            }

            // Store agent step in history if action was taken
            if (result.action && result.action.type !== 'respond') {
                agentHistory.push({
                    stepNumber: agentHistory.length + 1,
                    action: result.action,
                    thought: result.thought || 'Executing action',
                    url: contextSummary?.url,
                    timestamp: Date.now()
                });
                // Keep last 20 agent steps
                if (agentHistory.length > 20) {
                    agentHistory = agentHistory.slice(-20);
                }
            }

            // Execute the action if present
            if (result.action && result.action.type !== 'respond') {
                await executeAgentAction(result.action);
            }
        } else {
            // API not available, fall back to local logic
            addLog('API returned error, using fallback', 'info');
            fallbackProcessMessage(text);
        }
    } catch (e) {
        console.log('[Panel] API not available, using fallback:', e.message);
        addLog('Using local processing', 'info');
        fallbackProcessMessage(text);
    }
}

// Execute an action decided by the AI
async function executeAgentAction(action) {
    console.log('[Panel] Executing action:', action);
    addLog(`Executing: ${action.type}`, 'info');

    switch (action.type) {
        case 'navigate':
            if (action.url) {
                addMessage(`🌐 Navigating to: <strong>${action.url}</strong>`, 'assistant', false);
                displayActionFeedback({ status: 'started', action: 'navigate', message: `Going to ${action.url}` });

                try {
                    await chrome.tabs.sendMessage(currentTabId, {
                        type: 'EXECUTE_STEP',
                        step: {
                            action: 'navigate',
                            url: action.url,
                            description: `Opening ${action.url}`
                        }
                    });

                    // Wait for page to load and verify
                    const loaded = await waitForPageLoad();

                    if (loaded) {
                        await refreshContext();
                        const newContext = buildContextSummary(currentContext);
                        const targetDomain = new URL(action.url).hostname;
                        const actualDomain = newContext?.domain || '';

                        if (actualDomain.includes(targetDomain) || targetDomain.includes(actualDomain)) {
                            displayActionFeedback({ status: 'success', action: 'navigate', message: `Loaded ${newContext?.page || action.url}` });
                            addMessage(`📍 You're now on: <strong>${newContext?.page || action.url}</strong>`, 'assistant', false);
                            return { success: true, message: `Navigated to ${newContext?.url}` };
                        } else {
                            displayActionFeedback({ status: 'observed', action: 'navigate', message: `On ${actualDomain} (expected ${targetDomain})` });
                            return { success: true, message: `On ${actualDomain}` };
                        }
                    } else {
                        displayActionFeedback({ status: 'failed', action: 'navigate', message: 'Page load timeout' });
                        return { success: false, message: 'Navigation timeout' };
                    }
                } catch (e) {
                    displayActionFeedback({ status: 'failed', action: 'navigate', message: e.message });
                    addLog('Navigation failed: ' + e.message, 'error');
                    addMessage(`⚠️ Couldn't navigate automatically. Please visit <a href="${action.url}" target="_blank">${action.url}</a> manually.`, 'assistant', false);
                    return { success: false, message: e.message };
                }
            }
            break;

        case 'fill_form':
            if (action.fields && action.fields.length > 0) {
                addMessage(`📝 Filling ${action.fields.length} fields...`);
                controlsEl.classList.remove('hidden');

                const fieldsNeedingInput = [];

                for (const field of action.fields) {
                    let filled = false;
                    let usedVisionFallback = false;

                    // First, try normal fill if we have a value
                    if (field.value) {
                        try {
                            const result = await chrome.tabs.sendMessage(currentTabId, {
                                type: 'EXECUTE_STEP',
                                step: {
                                    action: 'type',
                                    label: field.label,
                                    value: field.value,
                                    description: `Entering ${field.label}`
                                }
                            });
                            if (result.success) {
                                addLog(`✓ Filled: ${field.label}`, 'success');
                                filled = true;
                            }
                        } catch (e) {
                            console.log(`[Panel] Normal fill failed for ${field.label}:`, e.message);
                        }
                    }

                    // If normal fill failed or no value, try vision fallback
                    if (!filled) {
                        addLog(`🔍 Analyzing field with vision: ${field.label}`, 'info');
                        usedVisionFallback = true;

                        const visionResult = await tryFillWithVisionFallback(field);

                        if (visionResult.canFill && visionResult.suggestedValue) {
                            // Vision found a value, try to fill
                            try {
                                const result = await chrome.tabs.sendMessage(currentTabId, {
                                    type: 'EXECUTE_STEP',
                                    step: {
                                        action: 'type',
                                        label: field.label,
                                        value: visionResult.suggestedValue,
                                        description: `Entering ${field.label} (via vision)`
                                    }
                                });
                                if (result.success) {
                                    addLog(`✓ Filled via vision: ${field.label}`, 'success');
                                    filled = true;
                                }
                            } catch (e) {
                                console.log(`[Panel] Vision fill failed for ${field.label}:`, e.message);
                            }
                        }

                        if (!filled && visionResult.needsUserInput) {
                            fieldsNeedingInput.push({
                                label: field.label,
                                type: visionResult.fieldType || field.type,
                                reason: visionResult.reason
                            });
                        }
                    }

                    await delay(500);
                }

                // Report results
                if (fieldsNeedingInput.length > 0) {
                    // Check if any are sensitive/payment fields
                    const sensitiveTypes = ['payment', 'bank', 'card', 'aadhaar', 'pan', 'passport', 'password', 'pin', 'otp'];
                    const hasSensitive = fieldsNeedingInput.some(f =>
                        sensitiveTypes.some(t =>
                            f.label.toLowerCase().includes(t) ||
                            (f.reason && f.reason.toLowerCase().includes(t))
                        )
                    );

                    const fieldsList = fieldsNeedingInput.map(f =>
                        `• <strong>${f.label}</strong>: ${f.reason}`
                    ).join('<br>');

                    if (hasSensitive) {
                        addMessage(`🔒 <strong>Security handoff:</strong> The following fields contain sensitive information:<br>${fieldsList}`);
                        addMessage('Please fill these manually for your security. Say "done" or "continue" when you\'re ready for me to take control again!');
                    } else {
                        addMessage(`⚠️ I need your help with these fields:<br>${fieldsList}`);
                        addMessage('Please fill them manually, then say "done" so I can continue!');
                    }
                } else {
                    addMessage('✅ Done filling fields!');
                }
            }
            break;

        case 'click':
            if (action.selector) {
                addMessage(`👆 Clicking: <strong>${action.selector}</strong>`);
                try {
                    await chrome.tabs.sendMessage(currentTabId, {
                        type: 'EXECUTE_STEP',
                        step: {
                            action: 'click',
                            selector: action.selector,
                            description: `Clicking ${action.selector}`
                        }
                    });
                    addLog('Click executed', 'success');
                } catch (e) {
                    addLog('Click failed: ' + e.message, 'error');
                }
            }
            break;

        case 'ask_user':
            if (action.questions && action.questions.length > 0) {
                addMessage('I have a few questions:<br>• ' + action.questions.join('<br>• '));
            }
            break;

        case 'search':
            if (action.searchQuery) {
                const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(action.searchQuery)}`;
                addMessage(`🔍 Searching for: <strong>${action.searchQuery}</strong>`);
                try {
                    await chrome.tabs.sendMessage(currentTabId, {
                        type: 'EXECUTE_STEP',
                        step: {
                            action: 'navigate',
                            url: searchUrl,
                            description: `Searching for ${action.searchQuery}`
                        }
                    });
                    addLog('Search started', 'success');
                } catch (e) {
                    addMessage(`⚠️ Couldn't search automatically. <a href="${searchUrl}" target="_blank">Click here to search</a>`);
                }
            }
            break;

        case 'plan':
            addMessage('📋 I need to create a multi-step plan for this task. Let me work on that...');
            controlsEl.classList.remove('hidden');
            // TODO: Fetch plan from API and show steps
            break;

        default:
            console.log('[Panel] Unknown action type:', action.type);
    }
}

// ============ Vision Fallback for Unfillable Fields ============

/**
 * Try to fill a field using vision analysis
 * Takes a screenshot and asks the vision model to analyze the field
 */
async function tryFillWithVisionFallback(field) {
    const API_URL = 'http://localhost:3000/api/ai';

    try {
        // Request screenshot from background script
        const screenshotResponse = await chrome.runtime.sendMessage({
            type: 'CAPTURE_SCREENSHOT',
            tabId: currentTabId
        });

        if (!screenshotResponse?.success || !screenshotResponse.screenshot) {
            console.log('[Panel] Failed to capture screenshot for vision fallback');
            return {
                canFill: false,
                needsUserInput: true,
                reason: 'Could not capture screenshot'
            };
        }

        // Build context from current page
        const contextSummary = buildContextSummary(currentContext);
        const pageContext = contextSummary ? `${contextSummary.page} - ${contextSummary.url}` : '';

        // Call vision API to analyze the field
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'analyze_unfillable_field',
                data: {
                    screenshot: screenshotResponse.screenshot,
                    fieldLabel: field.label,
                    fieldType: field.type || 'unknown',
                    pageContext
                }
            })
        });

        if (response.ok) {
            const result = await response.json();
            console.log('[Panel] Vision analysis result:', result);

            return {
                canFill: result.canFill || false,
                suggestedValue: result.suggestedValue,
                fieldType: result.fieldType,
                reason: result.reason || 'Vision analysis complete',
                needsUserInput: result.needsUserInput || false,
                confidence: result.confidence
            };
        } else {
            console.log('[Panel] Vision API returned error');
            return {
                canFill: false,
                needsUserInput: true,
                reason: 'Vision analysis unavailable'
            };
        }
    } catch (e) {
        console.error('[Panel] Vision fallback error:', e);
        return {
            canFill: false,
            needsUserInput: true,
            reason: 'Could not analyze field'
        };
    }
}

// Helper delay function
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Fallback when API is not available
function fallbackProcessMessage(text) {
    const lowerText = text.toLowerCase();
    const contextSummary = buildContextSummary(currentContext);

    // First, show context awareness even in fallback mode
    if (contextSummary) {
        addMessage(`📍 I can see you're on: <strong>${contextSummary.page}</strong>`);
        if (contextSummary.visibleFields.length > 0) {
            const fieldNames = contextSummary.visibleFields.slice(0, 5).map(f => f.label).join(', ');
            addMessage(`📝 Visible fields: ${fieldNames}${contextSummary.visibleFields.length > 5 ? '...' : ''}`);
        }
    }

    // Check for RTI keywords
    if (lowerText.includes('rti') || lowerText.includes('right to information') ||
        lowerText.includes('information request')) {
        handleRTIRequest(text);
    }
    // Check for scholarship keywords  
    else if (lowerText.includes('scholarship') || lowerText.includes('education grant')) {
        handleScholarshipRequest(text);
    }
    // Handle "what page" type questions
    else if (lowerText.includes('what page') || lowerText.includes('what website') ||
        lowerText.includes('where am i') || lowerText.includes('what do you see')) {
        if (contextSummary) {
            addMessage(`You're currently on: <strong>${contextSummary.page}</strong><br>URL: ${contextSummary.url}`);
            if (contextSummary.visibleFields.length > 0) {
                addMessage(`I can see ${contextSummary.visibleFields.length} form fields on this page.`);
            }
        } else {
            addMessage("I'm having trouble seeing the page. Please make sure you're on a website and try refreshing the extension.");
        }
    }
    // Generic task
    else {
        addMessage("I understand you want help with a task. Could you tell me more about what you'd like to do?");
        addMessage("For example, you can ask me to:<br>• File an RTI application<br>• Find scholarships<br>• Help fill out a form");
    }
}

// ============ Task Handlers ============

// Handle RTI request
async function handleRTIRequest(text) {
    const contextSummary = buildContextSummary(currentContext);

    // Check if we're already on the RTI website
    if (contextSummary?.url?.includes('rtionline.gov.in')) {
        addMessage("✅ You're already on the RTI Online Portal! I can help you fill out the form.");
        addMessage("Let me scan the form fields...");

        // Show what we found
        if (contextSummary.visibleFields.length > 0) {
            const fields = contextSummary.visibleFields.slice(0, 8).map(f => `• ${f.label}`).join('<br>');
            addMessage(`<strong>Found fields:</strong><br>${fields}`);
        }
    } else {
        addMessage("I'll help you file an RTI application.");
        addMessage("📝 First, let me navigate you to the RTI Online Portal...");
    }

    // Show controls
    controlsEl.classList.remove('hidden');

    // For demo: set up a mock task
    currentTask = {
        type: 'RTI',
        status: 'gathering_info',
        details: {
            topic: text
        }
    };
}

// Handle scholarship request
async function handleScholarshipRequest(text) {
    const contextSummary = buildContextSummary(currentContext);
    const lowerText = text.toLowerCase();

    // Check if user wants to navigate/open the scholarship portal
    const wantsNavigation = lowerText.includes('open') || lowerText.includes('go to') ||
        lowerText.includes('navigate') || lowerText.includes('take me') ||
        lowerText.includes('where can i') || lowerText.includes('website');

    // Check if already on scholarship portal
    if (contextSummary?.url?.includes('scholarships.gov.in')) {
        addMessage("✅ You're already on the National Scholarship Portal!");
        addMessage("I can help you navigate and apply for scholarships here.");

        if (contextSummary.visibleFields.length > 0) {
            const fields = contextSummary.visibleFields.slice(0, 6).map(f => `• ${f.label}`).join('<br>');
            addMessage(`<strong>Visible fields:</strong><br>${fields}`);
        }
        controlsEl.classList.remove('hidden');
        return;
    }

    // If user wants to navigate, open the scholarship portal
    if (wantsNavigation) {
        addMessage("🎓 I'll open the National Scholarship Portal for you!");
        addMessage("Navigating to <strong>scholarships.gov.in</strong>...");
        addLog('Navigating to scholarship portal...', 'info');

        // Execute navigation
        try {
            await chrome.tabs.sendMessage(currentTabId, {
                type: 'EXECUTE_STEP',
                step: {
                    action: 'navigate',
                    url: 'https://scholarships.gov.in/',
                    description: 'Opening National Scholarship Portal'
                }
            });
            addLog('Navigation started', 'success');

            // Wait a bit and refresh context
            setTimeout(async () => {
                await refreshContext();
                addMessage("📚 You're now on the scholarship portal. Let me know if you need help finding or applying for scholarships!");
            }, 3000);
        } catch (e) {
            addLog('Navigation failed: ' + e.message, 'error');
            addMessage("I couldn't navigate automatically. Please open <a href='https://scholarships.gov.in/' target='_blank'>scholarships.gov.in</a> manually.");
        }
        return;
    }

    // Otherwise, show scholarship info and offer to navigate
    addMessage("I can help you find scholarships you might be eligible for.");
    addMessage([
        "Here are some major scholarship portals:",
        "",
        "🎓 <strong>National Scholarship Portal</strong> - scholarships.gov.in",
        "📚 <strong>State Scholarships</strong> - Check your state government portal",
        "🔬 <strong>INSPIRE Scholarship</strong> - For science students"
    ].join('<br>'));

    addMessage("Would you like me to <strong>open the National Scholarship Portal</strong> for you? Just say 'open scholarship website'.");
}

// ============ Voice Input ============

let recognition = null;
function handleVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        addMessage("Sorry, voice input is not supported in this browser.");
        return;
    }

    if (recognition) {
        recognition.stop();
        recognition = null;
        voiceBtn.classList.remove('recording');
        return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-IN';

    recognition.onstart = () => {
        voiceBtn.classList.add('recording');
        addLog('Listening...', 'info');
    };

    recognition.onresult = (event) => {
        const text = event.results[0][0].transcript;
        inputEl.value = text;
        addLog(`Heard: "${text}"`, 'success');
    };

    recognition.onerror = (event) => {
        addLog(`Voice error: ${event.error}`, 'error');
    };

    recognition.onend = () => {
        voiceBtn.classList.remove('recording');
        recognition = null;
    };

    recognition.start();
}

// ============ Task Controls ============

function handlePause() {
    isPaused = true;
    loopRunning = false;  // Stop the autonomous loop
    pauseBtn.classList.add('hidden');
    resumeBtn.classList.remove('hidden');
    addLog('Execution paused', 'info');
    addMessage("⏸️ Paused. Click Resume when you're ready to continue, or Take Control to finish manually.", 'assistant', false);

    chrome.runtime.sendMessage({ type: 'PAUSE', tabId: currentTabId });
}

function handleResume() {
    isPaused = false;
    resumeBtn.classList.add('hidden');
    pauseBtn.classList.remove('hidden');
    addLog('Execution resumed', 'info');
    addMessage("▶️ Resuming...", 'assistant', false);

    chrome.runtime.sendMessage({ type: 'RESUME', tabId: currentTabId });

    // Resume the autonomous loop if we had a goal
    if (currentGoal && !loopRunning) {
        runAgentLoop(currentGoal);
    }
}

function handleTakeover() {
    isExecuting = false;
    isPaused = false;
    loopRunning = false;  // Stop the autonomous loop
    currentGoal = null;   // Clear the goal
    controlsEl.classList.add('hidden');
    addLog('User took control', 'info');
    addMessage("✋ You're now in control. I'll wait here if you need any help.", 'assistant', false);

    chrome.runtime.sendMessage({ type: 'TAKE_CONTROL', tabId: currentTabId });
}

function toggleLog() {
    const isHidden = logEl.style.display === 'none';
    logEl.style.display = isHidden ? 'block' : 'none';
    toggleLogBtn.textContent = isHidden ? 'Hide' : 'Show';
}

// ============ Step Execution ============

async function executeStep(step) {
    if (isPaused) return { paused: true };

    addLog(`${step.description}...`, 'info');

    try {
        const response = await chrome.runtime.sendMessage({
            type: 'EXECUTE_STEP',
            step,
            tabId: currentTabId
        });

        if (response.success) {
            addLog(`✓ ${step.description}`, 'success');
        } else if (response.paused) {
            addLog(`⏸ Paused: ${step.description}`, 'info');
            addMessage(`⏸️ <strong>Paused:</strong> ${step.description}`, 'assistant', false);
        } else {
            addLog(`✗ ${step.description}: ${response.error}`, 'error');
        }

        return response;
    } catch (error) {
        addLog(`✗ Error: ${error.message}`, 'error');
        return { success: false, error: error.message };
    }
}

// ============ Continuous Execution Loop ============

/**
 * Run the autonomous agent loop for a given goal
 * Executes steps continuously until HITL, completion, or pause
 */
async function runAgentLoop(goal) {
    currentGoal = goal;
    loopRunning = true;
    isExecuting = true;

    // Show controls
    controlsEl.classList.remove('hidden');
    addLog(`Starting agent loop for goal: ${goal.substring(0, 50)}...`, 'info');

    const maxSteps = 20;  // Safety limit
    let stepCount = 0;

    while (loopRunning && !isPaused && stepCount < maxSteps) {
        stepCount++;

        try {
            // 1. Refresh context
            await refreshContext();
            const contextSummary = buildContextSummary(currentContext);

            // 2. Call agent API for next step
            const result = await callAgentStep(goal, contextSummary);

            if (!result.success) {
                addLog(`Loop error: ${result.error}`, 'error');
                break;
            }

            // 3. Display thought if present
            if (result.thought) {
                addLog(`💭 ${result.thought.substring(0, 100)}...`, 'info');
            }

            // 4. Check for HITL requirement
            if (result.hitl_required) {
                displayHITLRequest(result.hitl_required);
                loopRunning = false;
                break;
            }

            // 5. Execute action if present
            if (result.action && result.action.type !== 'respond') {
                displayActionFeedback({ status: 'started', action: result.action.type, message: 'Executing...' });

                const execResult = await executeAgentAction(result.action);

                // Update agent history
                agentHistory.push({
                    stepNumber: agentHistory.length + 1,
                    action: result.action,
                    thought: result.thought,
                    url: contextSummary?.url,
                    success: execResult?.success !== false,
                    timestamp: Date.now()
                });

                if (agentHistory.length > 20) {
                    agentHistory = agentHistory.slice(-20);
                }

                displayActionFeedback({
                    status: execResult?.success !== false ? 'success' : 'failed',
                    action: result.action.type,
                    message: execResult?.message || 'Action completed'
                });
            }

            // 6. Check for completion
            if (result.isDone || result.action?.type === 'respond') {
                if (result.message) {
                    addMessage(result.message, 'assistant', true);
                }
                addLog('✅ Goal completed', 'success');
                loopRunning = false;
                break;
            }

            // Small delay between steps
            await delay(800);

        } catch (error) {
            addLog(`Loop error: ${error.message}`, 'error');
            loopRunning = false;
            break;
        }
    }

    if (stepCount >= maxSteps) {
        addLog('⚠️ Max steps reached, pausing for safety', 'warning');
        addMessage("I've taken " + maxSteps + " steps. Would you like me to continue?", 'assistant', true);
    }

    isExecuting = false;
}

/**
 * Call the agent API for a single step
 */
async function callAgentStep(goal, contextSummary) {
    const API_URL = 'http://localhost:3000/api/ai';

    try {
        const recentHistory = chatHistory.slice(-10).map(m => ({
            role: m.role,
            content: m.content
        }));

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'agent_chat',
                data: {
                    message: goal,
                    pageContext: contextSummary,
                    conversationHistory: recentHistory,
                    agentHistory: agentHistory.slice(-5),
                    currentUrl: contextSummary?.url,
                    currentDomain: contextSummary?.domain
                }
            })
        });

        if (response.ok) {
            const result = await response.json();
            return {
                success: true,
                thought: result.thought,
                action: result.action,
                message: result.message,
                hitl_required: result.hitl_required,
                isDone: result.action?.type === 'respond' || result.isDone
            };
        } else {
            return { success: false, error: 'API returned error' };
        }
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/**
 * Display action feedback in the log
 */
function displayActionFeedback(result) {
    const statusMap = {
        'started': { icon: '⏳', type: 'info' },
        'success': { icon: '✅', type: 'success' },
        'failed': { icon: '❌', type: 'error' },
        'observed': { icon: '👁', type: 'info' }
    };

    const { icon, type } = statusMap[result.status] || statusMap.started;
    addLog(`${icon} ${result.action}: ${result.message}`, type);
}

/**
 * Display HITL (Human-in-the-Loop) request to user
 */
function displayHITLRequest(hitlRequest) {
    const typeIcons = {
        'confirmation': '⚠️',
        'otp': '🔐',
        'captcha': '🔒',
        'credentials': '🔑',
        'ambiguity': '❓'
    };

    const icon = typeIcons[hitlRequest.type] || '⚠️';

    addMessage(`${icon} <strong>Your input needed:</strong><br>${hitlRequest.reason}`, 'assistant', true);

    if (hitlRequest.options && hitlRequest.options.length > 0) {
        const optionsList = hitlRequest.options.map((opt, i) => `${i + 1}. ${opt}`).join('<br>');
        addMessage(`Options:<br>${optionsList}`, 'assistant', false);
    }

    addLog(`HITL: ${hitlRequest.type} - ${hitlRequest.reason}`, 'info');
}

/**
 * Wait for page to finish loading after navigation
 */
async function waitForPageLoad() {
    await delay(500);

    for (let i = 0; i < 10; i++) {
        await delay(500);
        await refreshContext();
        if (currentContext?.browser?.url) {
            return true;
        }
    }
    return false;
}

// Initialize panel
init();

