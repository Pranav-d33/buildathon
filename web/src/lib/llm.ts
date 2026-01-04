// OpenRouter LLM Client - Agentic Mode
// AI decides what actions to take based on context and user intent

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
//moonshotai/kimi-k2:free
// Model constants
export const MODELS = {
    CONVERSATION: 'meta-llama/llama-3.1-405b-instruct:free',
    PLANNER: 'meta-llama/llama-3.1-405b-instruct:free',
    VISION: 'nvidia/nemotron-nano-12b-v2-vl:free'
} as const

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
    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
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
        throw new Error(`LLM request failed: ${response.statusText}`)
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

RULES:
1. If user asks to go somewhere or open a website → use "navigate" action
2. If user asks "what page am I on" → describe the current page context (no action needed)
3. If on a form and user wants to fill it → use "fill_form" action
4. If you need more info → use "ask_user" action with specific questions
5. Never make up information about the user
6. For multi-step tasks (like filing RTI), use "plan" action

Always respond with valid JSON:
{
    "message": "What you say to the user",
    "action": { action object or null },
    "context_understood": true/false,
    "page_relevant": true/false
}`

export function buildAgentPrompt(
    userMessage: string,
    pageContext?: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Message[] {
    const messages: Message[] = [
        { role: 'system', content: AGENT_SYSTEM_PROMPT }
    ]

    // Add conversation history if provided
    if (conversationHistory && conversationHistory.length > 0) {
        const recentHistory = conversationHistory.slice(-6) // Last 3 exchanges
        for (const msg of recentHistory) {
            messages.push({ role: msg.role, content: msg.content })
        }
    }

    // Build the current message with context
    let currentMessage = `User says: "${userMessage}"`

    if (pageContext) {
        currentMessage = `CURRENT PAGE CONTEXT:
${pageContext}

USER MESSAGE: "${userMessage}"`
    }

    messages.push({ role: 'user', content: currentMessage })

    return messages
}

export async function getAgentResponse(
    userMessage: string,
    pageContext?: string,
    conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>
): Promise<AgentResponse> {
    const messages = buildAgentPrompt(userMessage, pageContext, conversationHistory)

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
