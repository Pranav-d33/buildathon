// OpenRouter LLM Client - Agentic Mode
// AI decides what actions to take based on context and user intent
// Phase 11: Model configuration with benchmarking support

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

// ============ Model Configuration Matrix ============
// Primary models (free tier defaults)
// Check https://openrouter.ai/models for current free models

export const MODELS = {
    // Current defaults (free tier)
    CONVERSATION: 'mistralai/mistral-7b-instruct:free',
    PLANNER: 'mistralai/mistral-7b-instruct:free',
    VISION: 'google/gemini-2.0-flash-exp:free',

    // Alternative models for benchmarking (Phase 11)
    ALTERNATIVES: {
        // Free tier alternatives
        GEMINI_FLASH: 'google/gemini-2.0-flash-exp:free',
        MISTRAL_7B: 'mistralai/mistral-7b-instruct:free',
        LLAMA_3_8B: 'meta-llama/llama-3-8b-instruct:free',
        QWEN_7B: 'qwen/qwen-2-7b-instruct:free',

        // Paid tier (higher capability)
        GPT4_TURBO: 'openai/gpt-4-turbo-preview',
        GPT4O: 'openai/gpt-4o',
        CLAUDE_SONNET: 'anthropic/claude-3.5-sonnet',
        CLAUDE_HAIKU: 'anthropic/claude-3-haiku',
        LLAMA3_70B: 'meta-llama/llama-3-70b-instruct',
        MIXTRAL_8X7B: 'mistralai/mixtral-8x7b-instruct',
        QWEN2_72B: 'qwen/qwen-2-72b-instruct',
        GEMINI_PRO: 'google/gemini-pro-1.5',
    },

    // Vision-capable models
    VISION_ALTERNATIVES: {
        GEMINI_FLASH: 'google/gemini-2.0-flash-exp:free',
        GPT4O: 'openai/gpt-4o',
        CLAUDE_SONNET: 'anthropic/claude-3.5-sonnet',
        GEMINI_PRO: 'google/gemini-pro-1.5',
    }
} as const

// ============ Active Model State (for benchmarking) ============
let _activeConversationModel: string = MODELS.CONVERSATION
let _activePlannerModel: string = MODELS.PLANNER
let _activeVisionModel: string = MODELS.VISION

export type ModelAlternativeKey = keyof typeof MODELS.ALTERNATIVES
export type VisionModelKey = keyof typeof MODELS.VISION_ALTERNATIVES

/**
 * Set the active conversation/planner model for benchmarking
 */
export function setActiveModel(modelKey: ModelAlternativeKey): void {
    const model = MODELS.ALTERNATIVES[modelKey]
    if (model) {
        _activeConversationModel = model
        _activePlannerModel = model
        console.log(`[LLM] Active model set to: ${model}`)
    }
}

/**
 * Set the active vision model for benchmarking
 */
export function setActiveVisionModel(modelKey: VisionModelKey): void {
    const model = MODELS.VISION_ALTERNATIVES[modelKey]
    if (model) {
        _activeVisionModel = model
        console.log(`[LLM] Active vision model set to: ${model}`)
    }
}

/**
 * Get the currently active conversation model
 */
export function getActiveModel(): string {
    return _activeConversationModel
}

/**
 * Get the currently active vision model
 */
export function getActiveVisionModel(): string {
    return _activeVisionModel
}

/**
 * Reset models to defaults
 */
export function resetModels(): void {
    _activeConversationModel = MODELS.CONVERSATION
    _activePlannerModel = MODELS.PLANNER
    _activeVisionModel = MODELS.VISION
    console.log('[LLM] Models reset to defaults')
}

/**
 * Get model info for metrics/logging
 */
export function getModelInfo(): {
    conversation: string
    planner: string
    vision: string
} {
    return {
        conversation: _activeConversationModel,
        planner: _activePlannerModel,
        vision: _activeVisionModel,
    }
}

type Message = {
    role: 'system' | 'user' | 'assistant'
    content: string
}

type LLMResponse = {
    choices: Array<{
        message: {
            content: string
        }
    }>
}

export async function callLLM(
    messages: Message[],
    model: string = MODELS.CONVERSATION
): Promise<string> {
    const apiKey = process.env.OPENROUTER_API_KEY

    // Debug: Check if API key is loaded
    if (!apiKey) {
        console.error('[LLM] ERROR: OPENROUTER_API_KEY is not set in environment!')
        throw new Error('OPENROUTER_API_KEY is not configured. Please add it to .env file.')
    }

    console.log(`[LLM] Calling model: ${model}`)

    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://opero.app',
            'X-Title': 'Opero',
        },
        body: JSON.stringify({
            model,
            messages,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        console.error(`[LLM] API Error: ${response.status} ${response.statusText}`)
        console.error(`[LLM] Response: ${errorText}`)
        throw new Error(`LLM request failed: ${response.status} ${response.statusText} - ${errorText}`)
    }

    const data: LLMResponse = await response.json()
    return data.choices[0]?.message?.content || ''
}

// ============ Agentic Response (AI decides actions) ============

export type AgentAction = {
    type: 'navigate' | 'fill_form' | 'click' | 'search' | 'ask_user' | 'respond' | 'plan'
    url?: string
    selector?: string
    value?: string
    fields?: Array<{ label: string; value: string }>
    questions?: string[]
    searchQuery?: string
}

export type AgentResponse = {
    message: string  // What to say to the user
    action?: AgentAction  // Optional action to execute
    context_understood: boolean
    page_relevant: boolean
}

const AGENT_SYSTEM_PROMPT = `You are Opero, an AI assistant that helps users complete tasks on websites.

You have TWO capabilities:
1. RESPOND - Talk to the user naturally
2. ACT - Execute browser actions when appropriate

AVAILABLE ACTIONS:
- navigate: Go to a URL {"type": "navigate", "url": "https://..."}
- fill_form: Fill form fields {"type": "fill_form", "fields": [{"label": "Name", "value": "..."}]}
- click: Click an element {"type": "click", "selector": "#submit-btn"}
- search: Search the web {"type": "search", "searchQuery": "..."}
- ask_user: Ask clarifying questions {"type": "ask_user", "questions": ["...", "..."]}
- respond: Just respond, no action {"type": "respond"}
- plan: Generate a multi-step plan {"type": "plan"}

KNOWN WEBSITES:
- RTI (Right to Information): https://rtionline.gov.in/
- Scholarships: https://scholarships.gov.in/
- Passport: https://passportindia.gov.in/
- Income Tax: https://incometax.gov.in/

PAGE AWARENESS RULES (CRITICAL):
1. ALWAYS check the current URL/domain BEFORE using "navigate"
2. If user is ALREADY on the target website → DO NOT navigate again, use "respond" instead
3. If user asks about content on the current page → extract info from page context, no navigation
4. Example: If current domain is "scholarships.gov.in" and user asks "what scholarships are available?" → DO NOT navigate, just explore current page

GENERAL RULES:
1. If user asks to go somewhere or open a website → check domain first, then navigate if needed
2. If user asks "what page am I on" → describe the current page context (no action needed)
3. If on a form and user wants to fill it → use "fill_form" action
4. If you need more info → use "ask_user" action with specific questions
5. Never make up information about the user
6. For multi-step tasks (like filing RTI), use "plan" action
7. Remember previous conversation context and actions taken

Always respond with valid JSON:
{
    "message": "What you say to the user",
    "action": { action object or null },
    "context_understood": true/false,
    "page_relevant": true/false,
    "thought": "Brief reasoning about your decision"
}`

export interface AgentHistoryEntry {
    stepNumber: number;
    action: AgentAction;
    thought?: string;
    url?: string;
    timestamp?: number;
}

export function buildAgentPrompt(
    userMessage: string,
    pageContext?: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    agentHistory?: AgentHistoryEntry[],
    currentUrl?: string,
    currentDomain?: string
): Message[] {
    const messages: Message[] = [
        { role: 'system', content: AGENT_SYSTEM_PROMPT }
    ]

    // Add conversation history if provided (as alternating messages)
    if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-10) // Last 5 exchanges
        for (const msg of recentHistory) {
            messages.push({ role: msg.role, content: msg.content })
        }
    }

    // Build agent step history summary for working memory
    let agentHistorySummary = '';
    if (agentHistory && agentHistory.length > 0) {
        const recentSteps = agentHistory.slice(-5);
        const stepLines = recentSteps.map(step => {
            const actionType = step.action?.type || 'unknown';
            return `Step ${step.stepNumber}: ${actionType}${step.url ? ` @ ${step.url}` : ''}`;
        });
        agentHistorySummary = `\n\nAGENT HISTORY (recent actions taken):\n${stepLines.join('\n')}`;
    }

    // Build the current message with context
    let currentMessage = `User says: "${userMessage}"`;

    if (pageContext || currentUrl) {
        currentMessage = `CURRENT PAGE STATE:
URL: ${currentUrl || 'unknown'}
Domain: ${currentDomain || 'unknown'}
${pageContext ? `\nPage Details:\n${pageContext}` : ''}
${agentHistorySummary}

USER MESSAGE: "${userMessage}"

REMEMBER: Check the current domain before deciding to navigate. If already on the target site, explore the page instead.`;
    }

    messages.push({ role: 'user', content: currentMessage });

    return messages;
}

export async function getAgentResponse(
    userMessage: string,
    pageContext?: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
    agentHistory?: AgentHistoryEntry[],
    currentUrl?: string,
    currentDomain?: string
): Promise<AgentResponse> {
    const messages = buildAgentPrompt(
        userMessage,
        pageContext,
        conversationHistory,
        agentHistory,
        currentUrl,
        currentDomain
    )

    const response = await callLLM(messages, MODELS.CONVERSATION)

    try {
        // Clean and parse JSON response
        let cleanedResponse = response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim()

        // Try to extract JSON if there's extra text
        const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            cleanedResponse = jsonMatch[0]
        }

        return JSON.parse(cleanedResponse)
    } catch {
        // If JSON parsing fails, return a simple response
        return {
            message: response.slice(0, 500),
            action: { type: 'respond' },
            context_understood: false,
            page_relevant: false
        }
    }
}

// ============ Legacy Intent Parsing (kept for compatibility) ============

export type IntentResult = {
    task_type: 'RTI' | 'SCHOLARSHIP' | 'GENERIC'
    missing_info: string[]
    intent_summary: string
    clarifying_questions?: string[]
}

export function buildIntentPrompt(
    userMessage: string,
    userContext?: { name?: string; state?: string },
    pageContext?: string
): string {
    return `You are an AI assistant helping users complete tasks on websites.

User Message: "${userMessage}"
User Context: ${JSON.stringify(userContext || {})}
${pageContext ? `Current Page Context:\n${pageContext}` : ''}

Extract the user's intent and return a JSON object with:
- task_type: "RTI" (if related to Right to Information), "SCHOLARSHIP" (if related to scholarships), or "GENERIC" (anything else)
- missing_info: array of missing information needed (e.g., ["department", "specific question"])
- intent_summary: brief summary of what the user wants to do
- clarifying_questions: questions to ask the user if info is missing

Return ONLY valid JSON, no markdown or explanation.`
}

export async function parseIntent(
    userMessage: string,
    userContext?: { name?: string; state?: string },
    pageContext?: string
): Promise<IntentResult> {
    const prompt = buildIntentPrompt(userMessage, userContext, pageContext)

    const response = await callLLM([
        { role: 'system', content: 'You are a JSON-only response bot. Always return valid JSON.' },
        { role: 'user', content: prompt }
    ], MODELS.CONVERSATION)

    try {
        const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        return JSON.parse(cleanedResponse)
    } catch {
        return {
            task_type: 'GENERIC',
            missing_info: ['Could not understand request'],
            intent_summary: userMessage,
            clarifying_questions: ['Could you please rephrase your request?']
        }
    }
}

// ============ Planning (Qwen3-4B) ============

export type PlanStep = {
    action: string
    selector?: string
    label?: string
    value?: string
    url?: string
    description: string
}

export function buildPlanningPrompt(
    taskType: string,
    pageContext: string,
    userContext: Record<string, any>
): string {
    return `You are planning browser automation actions.

Task Type: ${taskType}
Page Context:
${pageContext}

User Data Available:
${JSON.stringify(userContext, null, 2)}

Generate browser automation steps. Each step should be:
{
  "action": "navigate" | "type" | "click" | "select" | "scroll" | "wait",
  "selector": "CSS selector if applicable",
  "label": "human-readable label for the field",
  "value": "value to enter",
  "url": "URL for navigate actions",
  "description": "what this step does"
}

Rules:
1. NEVER include submit/final button clicks
2. NEVER include captcha interactions
3. NEVER include payment steps
4. Match field labels to user data

Return ONLY a JSON array of steps.`
}

export async function generatePlan(
    taskType: string,
    pageContext: string,
    userContext: Record<string, any>
): Promise<PlanStep[]> {
    const prompt = buildPlanningPrompt(taskType, pageContext, userContext)

    const response = await callLLM([
        { role: 'system', content: 'You are a browser automation expert. Return only valid JSON arrays.' },
        { role: 'user', content: prompt }
    ], MODELS.PLANNER)

    try {
        const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        return JSON.parse(cleanedResponse)
    } catch {
        return []
    }
}

// ============ RTI Draft Generation ============

export type RTIDraft = {
    subject: string
    body: string
    department_suggestion?: string
}

export function buildRTIDraftPrompt(details: {
    topic: string
    department?: string
    location?: string
    specificQuestion?: string
}): string {
    return `Generate an RTI (Right to Information) application for India.

Topic: ${details.topic}
Department: ${details.department || 'To be determined'}
Location: ${details.location || 'Not specified'}
Specific Question: ${details.specificQuestion || 'General inquiry'}

Return a JSON object with:
- subject: A clear, concise subject line for the RTI
- body: The formal RTI application text (in English, formal tone)
- department_suggestion: Suggested government department if not specified

Return ONLY valid JSON.`
}

export async function generateRTIDraft(details: {
    topic: string
    department?: string
    location?: string
    specificQuestion?: string
}): Promise<RTIDraft> {
    const prompt = buildRTIDraftPrompt(details)

    const response = await callLLM([
        { role: 'system', content: 'You are an expert in drafting RTI applications for India. Return only valid JSON.' },
        { role: 'user', content: prompt }
    ], MODELS.CONVERSATION)

    try {
        const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        return JSON.parse(cleanedResponse)
    } catch {
        return {
            subject: `RTI regarding ${details.topic}`,
            body: `Subject: Request for information under RTI Act, 2005\n\nDear Sir/Madam,\n\nI would like to request information regarding ${details.topic}${details.location ? ` in ${details.location}` : ''}.\n\n${details.specificQuestion || 'Please provide all relevant documents and information.'}\n\nThank you.`,
            department_suggestion: 'Public Information Officer'
        }
    }
}
