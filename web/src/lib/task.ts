// Shared Task Types - Used by both Web App and Extension

export type TaskStatus =
    | 'idle'
    | 'planning'
    | 'executing'
    | 'paused'
    | 'completed'
    | 'error'

export type TaskType = 'RTI' | 'SCHOLARSHIP' | 'GENERIC'

export type ActionType =
    | 'navigate'
    | 'type'
    | 'click'
    | 'select'
    | 'scroll'
    | 'wait'
    | 'pause'

export type Step = {
    id: string
    action: ActionType
    selector?: string
    label?: string
    value?: string
    url?: string
    description: string
    status: 'pending' | 'executing' | 'completed' | 'error'
}

export type Task = {
    id: string
    type: TaskType
    status: TaskStatus
    steps: Step[]
    currentStep: number
    createdAt: Date
    metadata?: {
        userQuery?: string
        intentSummary?: string
        targetUrl?: string
    }
}

export function createTask(type: TaskType, metadata?: Task['metadata']): Task {
    return {
        id: crypto.randomUUID(),
        type,
        status: 'idle',
        steps: [],
        currentStep: 0,
        createdAt: new Date(),
        metadata,
    }
}

// Message types for Web ↔ Extension communication
export type MessageType =
    | 'CONNECT'
    | 'DISCONNECT'
    | 'EXECUTE_STEP'
    | 'STEP_COMPLETE'
    | 'STEP_ERROR'
    | 'SCAN_DOM'
    | 'DOM_RESULT'
    | 'PAUSE'
    | 'RESUME'
    | 'TAKE_CONTROL'

export type Message = {
    type: MessageType
    step?: Step
    data?: any
    error?: string
}

// RTI Field Mapping
export const RTI_FIELD_MAP: Record<string, string[]> = {
    name: ['name', 'applicant', 'applicant_name', 'fullname', 'full_name'],
    email: ['email', 'mail', 'email_id', 'emailid'],
    phone: ['phone', 'mobile', 'contact', 'phone_number', 'phonenumber'],
    address: ['address', 'addr', 'postal_address', 'correspondence_address'],
    state: ['state', 'state_name'],
    pincode: ['pincode', 'pin', 'postal_code', 'zip'],
    subject: ['subject', 'rti_subject', 'application_subject'],
    description: ['description', 'rti_text', 'application_text', 'query', 'request'],
}
