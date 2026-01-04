// Planning Agent - Generates structured browser action steps
import { Step, TaskType, RTI_FIELD_MAP } from './task'
import { callLLM } from './llm'

// Pre-defined RTI portal steps (hardcoded for demo reliability)
const RTI_PORTAL_URL = 'https://rtionline.gov.in/request/request.php'

export function buildPlanPrompt(taskType: TaskType, context: Record<string, any>): string {
    return `You are planning browser automation actions for a user.

Task Type: ${taskType}
User Context: ${JSON.stringify(context)}

Generate a list of steps to complete this task. Each step should be:
{
  "action": "navigate" | "type" | "click" | "select" | "scroll" | "wait",
  "selector": "CSS selector if applicable",
  "label": "human-readable label for the field",
  "value": "value to enter (use {{user.fieldName}} for user data)",
  "url": "URL for navigate actions",
  "description": "what this step does"
}

Important rules:
1. NEVER include submit/final button clicks
2. NEVER include captcha interactions
3. NEVER include payment steps
4. Use clear, descriptive labels

Return ONLY a JSON array of steps.`
}

// Generate hardcoded RTI steps for demo reliability
export function generateRTISteps(userContext: {
    name?: string
    email?: string
    phone?: string
    state?: string
    address?: string
    rtiSubject?: string
    rtiBody?: string
}): Step[] {
    return [
        {
            id: crypto.randomUUID(),
            action: 'navigate',
            url: RTI_PORTAL_URL,
            description: 'Opening RTI Online Portal',
            status: 'pending'
        },
        {
            id: crypto.randomUUID(),
            action: 'wait',
            value: '2000',
            description: 'Waiting for page to load',
            status: 'pending'
        },
        {
            id: crypto.randomUUID(),
            action: 'type',
            label: 'Applicant Name',
            selector: 'input[name="name"], input[id*="name"], input[placeholder*="name" i]',
            value: userContext.name || '',
            description: `Entering name: ${userContext.name}`,
            status: 'pending'
        },
        {
            id: crypto.randomUUID(),
            action: 'type',
            label: 'Email',
            selector: 'input[name="email"], input[id*="email"], input[type="email"]',
            value: userContext.email || '',
            description: `Entering email: ${userContext.email}`,
            status: 'pending'
        },
        {
            id: crypto.randomUUID(),
            action: 'type',
            label: 'Phone Number',
            selector: 'input[name="phone"], input[name="mobile"], input[id*="phone"], input[id*="mobile"]',
            value: userContext.phone || '',
            description: `Entering phone: ${userContext.phone}`,
            status: 'pending'
        },
        {
            id: crypto.randomUUID(),
            action: 'type',
            label: 'Address',
            selector: 'textarea[name="address"], input[name="address"], textarea[id*="address"]',
            value: userContext.address || '',
            description: 'Entering address',
            status: 'pending'
        },
        {
            id: crypto.randomUUID(),
            action: 'select',
            label: 'State',
            selector: 'select[name="state"], select[id*="state"]',
            value: userContext.state || '',
            description: `Selecting state: ${userContext.state}`,
            status: 'pending'
        },
        {
            id: crypto.randomUUID(),
            action: 'type',
            label: 'RTI Subject',
            selector: 'input[name="subject"], input[id*="subject"]',
            value: userContext.rtiSubject || '',
            description: 'Entering RTI subject',
            status: 'pending'
        },
        {
            id: crypto.randomUUID(),
            action: 'type',
            label: 'RTI Application Text',
            selector: 'textarea[name="text"], textarea[name="description"], textarea[id*="text"], textarea[name="rti"]',
            value: userContext.rtiBody || '',
            description: 'Entering RTI application text',
            status: 'pending'
        },
        {
            id: crypto.randomUUID(),
            action: 'pause',
            description: 'Paused before CAPTCHA and submission. Please complete these steps manually.',
            status: 'pending'
        }
    ]
}

// Generate steps dynamically using LLM (fallback)
export async function generateStepsWithLLM(
    taskType: TaskType,
    context: Record<string, any>
): Promise<Step[]> {
    const prompt = buildPlanPrompt(taskType, context)

    const response = await callLLM([
        { role: 'system', content: 'You are a browser automation expert. Return only valid JSON arrays.' },
        { role: 'user', content: prompt }
    ])

    try {
        const cleanedResponse = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const rawSteps = JSON.parse(cleanedResponse)

        // Add IDs and status to each step
        return rawSteps.map((step: any) => ({
            ...step,
            id: crypto.randomUUID(),
            status: 'pending' as const
        }))
    } catch {
        // Return empty array if parsing fails
        return []
    }
}

// Get plan for task type
export function getPlanForTask(
    taskType: TaskType,
    userContext: Record<string, any>
): Step[] {
    switch (taskType) {
        case 'RTI':
            return generateRTISteps(userContext)

        case 'SCHOLARSHIP':
            // Scholarship is eligibility check, not form automation
            return [{
                id: crypto.randomUUID(),
                action: 'navigate',
                url: 'https://scholarships.gov.in/',
                description: 'Opening National Scholarship Portal',
                status: 'pending'
            }]

        case 'GENERIC':
        default:
            return []
    }
}
