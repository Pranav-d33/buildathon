// Background Service Worker - Message Hub
// Routes context, DOM, and execution messages between content script and web app

// Store connected tabs and their states
const tabStates = new Map();

// Listen for extension icon click - open side panel
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

// Set up side panel behavior
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[Background] Received message:', message.type);

    switch (message.type) {
        case 'CONNECT':
            handleConnect(sender.tab?.id, sendResponse);
            break;

        case 'OPEN_PANEL':
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                if (tabs[0]?.id) {
                    chrome.sidePanel.open({ tabId: tabs[0].id });
                }
            });
            sendResponse({ success: true });
            break;

        case 'EXECUTE_STEP':
            handleExecuteStep(message.step, message.tabId, sendResponse);
            break;

        case 'SCAN_DOM':
            handleScanDOM(message.tabId, sendResponse);
            break;

        case 'GET_BROWSER_CONTEXT':
            handleGetBrowserContext(message.tabId, sendResponse);
            break;

        case 'GET_USER_STATE':
            handleGetUserState(message.tabId, sendResponse);
            break;

        case 'GET_FULL_CONTEXT':
            handleGetFullContext(message.tabId, sendResponse);
            break;

        case 'CAPTURE_SCREENSHOT':
            handleCaptureScreenshot(message.tabId, sendResponse);
            break;

        case 'PAUSE':
            handlePause(message.tabId, sendResponse);
            break;

        case 'RESUME':
            handleResume(message.tabId, sendResponse);
            break;

        case 'GET_STATUS':
            sendResponse({ status: 'connected', tabStates: Object.fromEntries(tabStates) });
            break;

        case 'SET_AGENT_STATE':
            handleSetAgentState(message.state, message.tabId, sendResponse);
            break;

        case 'GET_AGENT_STATE':
            handleGetAgentState(message.tabId, sendResponse);
            break;

        case 'HANDLE_CAPTCHA':
            handleCaptchaMessage(message.tabId, 'HANDLE_CAPTCHA', sendResponse);
            break;

        case 'DETECT_CAPTCHA':
            handleCaptchaMessage(message.tabId, 'DETECT_CAPTCHA', sendResponse);
            break;

        default:
            console.warn('[Background] Unknown message type:', message.type);
            sendResponse({ success: false, error: 'Unknown message type' });
    }

    return true; // Keep channel open for async response
});

// Handle connection from content script
function handleConnect(tabId, sendResponse) {
    if (tabId) {
        tabStates.set(tabId, { connected: true, paused: false, lastContextUpdate: null });
        console.log('[Background] Tab connected:', tabId);
        sendResponse({ success: true, tabId });
    } else {
        sendResponse({ success: false, error: 'No tab ID' });
    }
}

// Execute a step on a specific tab
async function handleExecuteStep(step, tabId, sendResponse) {
    try {
        const targetTabId = tabId || await getActiveTabId();
        const response = await chrome.tabs.sendMessage(targetTabId, {
            type: 'EXECUTE_STEP',
            step
        });
        sendResponse(response);
    } catch (error) {
        console.error('[Background] Execute step error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Request DOM scan from content script
async function handleScanDOM(tabId, sendResponse) {
    try {
        const targetTabId = tabId || await getActiveTabId();
        const response = await chrome.tabs.sendMessage(targetTabId, {
            type: 'SCAN_DOM'
        });
        sendResponse(response);
    } catch (error) {
        console.error('[Background] Scan DOM error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Get browser context (Layer 1)
async function handleGetBrowserContext(tabId, sendResponse) {
    try {
        const targetTabId = tabId || await getActiveTabId();
        const response = await chrome.tabs.sendMessage(targetTabId, {
            type: 'GET_BROWSER_CONTEXT'
        });
        sendResponse(response);
    } catch (error) {
        console.error('[Background] Get browser context error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Get user state (Layer 2)
async function handleGetUserState(tabId, sendResponse) {
    try {
        const targetTabId = tabId || await getActiveTabId();
        const response = await chrome.tabs.sendMessage(targetTabId, {
            type: 'GET_USER_STATE'
        });
        sendResponse(response);
    } catch (error) {
        console.error('[Background] Get user state error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Get full context (DOM + User state)
async function handleGetFullContext(tabId, sendResponse) {
    try {
        const targetTabId = tabId || await getActiveTabId();
        const response = await chrome.tabs.sendMessage(targetTabId, {
            type: 'GET_FULL_CONTEXT'
        });

        // Update tab state with last context
        if (tabStates.has(targetTabId)) {
            const state = tabStates.get(targetTabId);
            state.lastContextUpdate = Date.now();
            tabStates.set(targetTabId, state);
        }

        sendResponse(response);
    } catch (error) {
        console.error('[Background] Get full context error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Capture screenshot for vision fallback (Layer 4)
async function handleCaptureScreenshot(tabId, sendResponse) {
    try {
        const targetTabId = tabId || await getActiveTabId();

        // Get the tab's window
        const tab = await chrome.tabs.get(targetTabId);

        // Capture visible tab as PNG
        const dataUrl = await chrome.tabs.captureVisibleTab(tab.windowId, {
            format: 'png',
            quality: 80
        });

        sendResponse({
            success: true,
            screenshot: dataUrl,
            timestamp: Date.now()
        });
    } catch (error) {
        console.error('[Background] Capture screenshot error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Pause execution
function handlePause(tabId, sendResponse) {
    const state = tabStates.get(tabId);
    if (state) {
        state.paused = true;
        tabStates.set(tabId, state);
    }
    sendResponse({ success: true, paused: true });
}

// Resume execution
function handleResume(tabId, sendResponse) {
    const state = tabStates.get(tabId);
    if (state) {
        state.paused = false;
        tabStates.set(tabId, state);
    }
    sendResponse({ success: true, paused: false });
}

// Set agent visual state (forwards to content script)
async function handleSetAgentState(agentState, tabId, sendResponse) {
    try {
        const targetTabId = tabId || await getActiveTabId();
        const response = await chrome.tabs.sendMessage(targetTabId, {
            type: 'SET_AGENT_STATE',
            state: agentState
        });
        sendResponse(response);
    } catch (error) {
        console.error('[Background] Set agent state error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Get agent visual state (forwards to content script)
async function handleGetAgentState(tabId, sendResponse) {
    try {
        const targetTabId = tabId || await getActiveTabId();
        const response = await chrome.tabs.sendMessage(targetTabId, {
            type: 'GET_AGENT_STATE'
        });
        sendResponse(response);
    } catch (error) {
        console.error('[Background] Get agent state error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Handle CAPTCHA messages (forwards to content script)
async function handleCaptchaMessage(tabId, messageType, sendResponse) {
    try {
        const targetTabId = tabId || await getActiveTabId();
        const response = await chrome.tabs.sendMessage(targetTabId, {
            type: messageType
        });
        sendResponse(response);
    } catch (error) {
        console.error('[Background] CAPTCHA message error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

// Helper to get active tab ID
async function getActiveTabId() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    return tab?.id;
}

// Clean up when tab is closed
chrome.tabs.onRemoved.addListener((tabId) => {
    tabStates.delete(tabId);
    console.log('[Background] Tab removed:', tabId);
});

// Track tab updates to re-inject content script if needed
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (changeInfo.status === 'complete' && tabStates.has(tabId)) {
        // Tab reloaded, update state
        const state = tabStates.get(tabId);
        state.lastContextUpdate = null;
        tabStates.set(tabId, state);
        console.log('[Background] Tab updated:', tabId);
    }
});

console.log('[Background] Opero service worker initialized');
