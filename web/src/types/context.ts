// Context & Awareness Types for Opero
// 4-Layer Context Stack: DOM + Events + Summarizer + Vision

// ============ Layer 1: DOM & Browser State ============

export type InputElement = {
    tag: 'input' | 'textarea' | 'select'
    type: string
    name: string
    id: string
    label: string
    selector: string
    value: string
    placeholder: string
    disabled: boolean
    required: boolean
    position: { x: number; y: number }
}

export type ButtonElement = {
    text: string
    selector: string
    type: 'submit' | 'button' | 'reset' | string
    disabled: boolean
    position: { x: number; y: number }
}

export type LinkElement = {
    text: string
    href: string
    selector: string
    position: { x: number; y: number }
}

export type BrowserContext = {
    url: string
    title: string
    domain: string
    viewport: {
        width: number
        height: number
        scrollY: number
        scrollHeight: number
    }
    visibleInputs: InputElement[]
    buttons: ButtonElement[]
    links: LinkElement[]
    formsPresent: boolean
    formCount: number
    timestamp: number
}

// ============ Layer 2: User Events ============

export type UserActionType = 'CLICK' | 'INPUT' | 'SCROLL' | 'FOCUS' | 'HOVER' | null

export type UserState = {
    cursor: { x: number; y: number }
    focusedElement: string | null
    focusedLabel: string | null
    lastAction: {
        type: UserActionType
        selector: string | null
        value?: string
        timestamp: number
    }
    isTyping: boolean
    scrollDirection: 'up' | 'down' | null
}

// ============ Layer 3: Context Summary ============

export type ContextSummary = {
    page: string
    url: string
    domain: string
    visibleFields: Array<{
        label: string
        type: string
        filled: boolean
    }>
    focusedField: string | null
    lastUserAction: string
    userIntent?: string
    confidence: number
    timestamp: number
}

export type ContextConfidence = {
    score: number // 0-100
    reasons: string[]
    needsVision: boolean
}

// ============ Layer 4: Vision ============

export type VisionRequest = {
    screenshot: string // base64
    context: {
        url: string
        domSummary: string
        userIntent: string
    }
}

export type VisionResult = {
    visibleText: string[]
    layoutNotes: string
    possibleInputs: Array<{
        label: string
        type: string
        approximate_position: string
    }>
    captchaDetected: boolean
    pageType: 'form' | 'document' | 'dashboard' | 'other'
}

// ============ Full Context (Combined) ============

export type FullContext = {
    browser: BrowserContext
    user: UserState
    summary?: ContextSummary
    vision?: VisionResult
}

// ============ Message Types for Context ============

export type ContextMessageType =
    | 'GET_FULL_CONTEXT'
    | 'CONTEXT_UPDATE'
    | 'USER_EVENT'
    | 'CAPTURE_SCREENSHOT'
    | 'SCREENSHOT_RESULT'

export type ContextMessage = {
    type: ContextMessageType
    data?: FullContext | UserState | BrowserContext | string
    timestamp: number
}
