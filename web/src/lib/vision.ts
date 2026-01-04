// Vision Fallback - Layer 4
// Qwen 2.5 VL integration for when DOM context is insufficient

import type { BrowserContext, VisionRequest, VisionResult } from '@/types/context'

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'
const VISION_MODEL = 'nvidia/nemotron-nano-12b-v2-vl:free'

type VisionMessage = {
    role: 'system' | 'user' | 'assistant'
    content: string | Array<{
        type: 'text' | 'image_url'
        text?: string
        image_url?: { url: string }
    }>
}

/**
 * Call the vision LLM with screenshot and context
 */
export async function callVisionLLM(messages: VisionMessage[]): Promise<string> {
    const response = await fetch(OPENROUTER_API_URL, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://opero.app',
            'X-Title': 'Opero Vision',
        },
        body: JSON.stringify({
            model: VISION_MODEL,
            messages,
            max_tokens: 1024,
        }),
    })

    if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Vision LLM request failed: ${response.statusText} - ${errorText}`)
    }

    const data = await response.json()
    return data.choices[0]?.message?.content || ''
}

/**
 * Build the vision analysis prompt
 * IMPORTANT: We only ask for description, never for actions
 */
function buildVisionPrompt(context: VisionRequest['context']): string {
    return `You are analyzing a screenshot of a webpage to help identify form elements and page structure.

Current URL: ${context.url}
DOM Summary: ${context.domSummary}
User Intent: ${context.userIntent}

Analyze the screenshot and return a JSON object with:
- "visible_text": array of important text visible on screen
- "layout_notes": brief description of the page layout
- "possible_inputs": array of {label, type, approximate_position} for any form fields you can see
- "captcha_detected": boolean if you see a CAPTCHA or verification challenge
- "page_type": one of "form", "document", "dashboard", "other"

IMPORTANT: 
- Only describe what you see, do NOT suggest actions
- Focus on identifying form fields that might not be in the DOM
- Note any visual elements that could be interactive

Return ONLY valid JSON.`
}

/**
 * Analyze a screenshot using Qwen 2.5 VL
 */
export async function analyzeScreenshot(
    screenshot: string, // base64 data URL
    browserContext: BrowserContext,
    userIntent: string
): Promise<VisionResult> {
    // Build context summary for the prompt
    const domSummary = `Page: ${browserContext.title}, ${browserContext.visibleInputs.length} inputs, ${browserContext.buttons.length} buttons`

    const prompt = buildVisionPrompt({
        url: browserContext.url,
        domSummary,
        userIntent
    })

    // Build multimodal message
    const messages: VisionMessage[] = [
        {
            role: 'system',
            content: 'You are a vision model that analyzes webpage screenshots. Always return valid JSON.'
        },
        {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: prompt
                },
                {
                    type: 'image_url',
                    image_url: { url: screenshot }
                }
            ]
        }
    ]

    try {
        const response = await callVisionLLM(messages)

        // Parse JSON response
        const cleanedResponse = response
            .replace(/```json\n?/g, '')
            .replace(/```\n?/g, '')
            .trim()

        const parsed = JSON.parse(cleanedResponse)

        return {
            visibleText: parsed.visible_text || [],
            layoutNotes: parsed.layout_notes || '',
            possibleInputs: (parsed.possible_inputs || []).map((input: any) => ({
                label: input.label || '',
                type: input.type || 'text',
                approximate_position: input.approximate_position || ''
            })),
            captchaDetected: Boolean(parsed.captcha_detected),
            pageType: parsed.page_type || 'other'
        }
    } catch (error) {
        console.error('[Vision] Analysis failed:', error)

        // Return empty result on failure
        return {
            visibleText: [],
            layoutNotes: 'Vision analysis failed',
            possibleInputs: [],
            captchaDetected: false,
            pageType: 'other'
        }
    }
}

/**
 * Merge vision results with DOM context to create enhanced context
 */
export function augmentContextWithVision(
    browserContext: BrowserContext,
    visionResult: VisionResult
): BrowserContext {
    // If vision detected inputs not in DOM, we note them but can't add selectors
    // This is informational - the planner will need to handle these cases

    const augmentedContext = { ...browserContext }

    // Add vision-detected inputs that might not be in DOM
    // These won't have proper selectors, but can help with context
    const domLabels = new Set(browserContext.visibleInputs.map(i => i.label.toLowerCase()))

    const visionOnlyInputs = visionResult.possibleInputs
        .filter(vi => !domLabels.has(vi.label.toLowerCase()))
        .map(vi => ({
            tag: 'input' as const,
            type: vi.type,
            name: '',
            id: '',
            label: `[Vision] ${vi.label}`,
            selector: '', // No selector available from vision
            value: '',
            placeholder: '',
            disabled: false,
            required: false,
            position: { x: 0, y: 0 } // Unknown position
        }))

    augmentedContext.visibleInputs = [
        ...browserContext.visibleInputs,
        ...visionOnlyInputs
    ]

    return augmentedContext
}

/**
 * Quick check for CAPTCHA using vision
 */
export async function checkForCaptcha(
    screenshot: string,
    browserContext: BrowserContext
): Promise<{ hasCaptcha: boolean; type?: string }> {
    const messages: VisionMessage[] = [
        {
            role: 'system',
            content: 'You detect CAPTCHAs in webpage screenshots. Return only JSON.'
        },
        {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: `Is there a CAPTCHA or verification challenge visible in this screenshot?
                    
Return JSON: {"has_captcha": boolean, "type": "recaptcha" | "hcaptcha" | "image" | "text" | "none"}`
                },
                {
                    type: 'image_url',
                    image_url: { url: screenshot }
                }
            ]
        }
    ]

    try {
        const response = await callVisionLLM(messages)
        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = JSON.parse(cleaned)

        return {
            hasCaptcha: Boolean(parsed.has_captcha),
            type: parsed.type !== 'none' ? parsed.type : undefined
        }
    } catch {
        return { hasCaptcha: false }
    }
}

/**
 * Solve a text-based CAPTCHA using vision
 * Only works for simple text/number CAPTCHAs, not reCAPTCHA/hCaptcha
 */
export async function solveCaptcha(
    captchaScreenshot: string // base64 data URL of just the CAPTCHA image
): Promise<{ solved: boolean; solution?: string; type?: string; reason?: string }> {
    const messages: VisionMessage[] = [
        {
            role: 'system',
            content: `You are a CAPTCHA solver. You can ONLY solve simple text-based CAPTCHAs that show distorted letters, numbers, or simple math problems.

You CANNOT solve:
- reCAPTCHA (Google checkboxes or image selection)
- hCaptcha
- Image selection puzzles ("select all cars")
- Slider/puzzle CAPTCHAs

If you see a simple text CAPTCHA with letters/numbers, read them carefully and return the exact text.
If you see a math problem, solve it and return the answer.
If it's an unsolvable type, say so.`
        },
        {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: `Look at this CAPTCHA image. If it's a simple text/number CAPTCHA, read the characters. If it's a math problem, solve it.

Return JSON:
{
    "solvable": boolean,
    "type": "text" | "math" | "recaptcha" | "hcaptcha" | "image_selection" | "puzzle" | "unknown",
    "solution": "the answer if solvable",
    "confidence": "high" | "medium" | "low"
}

If not solvable, set solution to null.`
                },
                {
                    type: 'image_url',
                    image_url: { url: captchaScreenshot }
                }
            ]
        }
    ]

    try {
        const response = await callVisionLLM(messages)
        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
        const parsed = JSON.parse(cleaned)

        console.log('[Vision] CAPTCHA analysis:', parsed)

        if (parsed.solvable && parsed.solution) {
            // Only return solution if confidence is not low
            if (parsed.confidence === 'low') {
                return {
                    solved: false,
                    type: parsed.type,
                    reason: 'Low confidence in CAPTCHA solution'
                }
            }

            return {
                solved: true,
                solution: String(parsed.solution).trim(),
                type: parsed.type
            }
        }

        return {
            solved: false,
            type: parsed.type || 'unknown',
            reason: `CAPTCHA type "${parsed.type}" cannot be automatically solved`
        }
    } catch (error) {
        console.error('[Vision] CAPTCHA solving failed:', error)
        return {
            solved: false,
            reason: 'Failed to analyze CAPTCHA'
        }
    }
}

/**
 * Analyze a form field that the AI couldn't fill
 * Uses vision to determine if it's actually fillable and how
 */
export type UnfillableFieldAnalysis = {
    canFill: boolean
    suggestedValue?: string
    fieldType: 'text_captcha' | 'math_captcha' | 'date_picker' | 'file_upload' | 'select' | 'radio' | 'checkbox' | 'recaptcha' | 'hcaptcha' | 'unknown'
    reason: string
    needsUserInput: boolean
    confidence: 'high' | 'medium' | 'low'
}

export async function analyzeUnfillableField(
    screenshot: string, // base64 data URL of the page/field area
    fieldLabel: string,
    fieldType: string,
    pageContext?: string
): Promise<UnfillableFieldAnalysis> {
    const messages: VisionMessage[] = [
        {
            role: 'system',
            content: `You are an AI assistant analyzing form fields that couldn't be automatically filled.
Your job is to VISUALLY analyze the screenshot and determine:
1. What type of field this ACTUALLY is (ignore the DOM label if it's misleading)
2. Whether it CAN be filled automatically (and provide a value if so)
3. Or whether it requires human input

KEY PRINCIPLE: Always look at what you SEE in the screenshot, not just what the label says.
- A field labeled "Security Code" might actually be a CAPTCHA with distorted text
- A field labeled "Enter Code" might be a simple text field
- A field with no clear label might be identifiable by visual context

You CAN automatically fill:
- Text/number CAPTCHAs (distorted text/numbers you can read)
- Math CAPTCHAs (solve equations like "2 + 3 = ?")
- Simple text fields where the expected value is clear from context
- Select dropdowns (if options are visible and appropriate)
- Radio buttons (if one option is clearly correct)
- Checkboxes (like "I agree to terms")

You CANNOT automatically fill (needsUserInput = true):
- reCAPTCHA, hCaptcha (image selection puzzles by Google/Cloudflare)
- Slider puzzles, drag-and-drop, or interactive challenges
- File upload fields
- Personal information (name, address, phone, email, specific dates)
- SENSITIVE IDs: Aadhaar number, PAN number, Voter ID, Passport number, Driving License
- Bank account details, credit/debit card numbers
- Passwords, PINs, OTPs, security questions
- Payment information
- Any field requiring information you cannot see or infer

Always return valid JSON.`
        },
        {
            role: 'user',
            content: [
                {
                    type: 'text',
                    text: `Analyze this form field that couldn't be filled:

Field Label: "${fieldLabel}"
Field Type (from DOM): "${fieldType}"
${pageContext ? `Page Context: ${pageContext}` : ''}

Look at the screenshot and determine:
1. What type of field is this really?
2. Can it be filled automatically? If yes, what value?
3. Or does it require user input?

Return JSON:
{
    "canFill": boolean,
    "suggestedValue": "the value to fill, if canFill is true",
    "fieldType": "text_captcha" | "math_captcha" | "date_picker" | "file_upload" | "select" | "radio" | "checkbox" | "recaptcha" | "hcaptcha" | "unknown",
    "reason": "explanation of your decision",
    "needsUserInput": boolean,
    "confidence": "high" | "medium" | "low"
}`
                },
                {
                    type: 'image_url',
                    image_url: { url: screenshot }
                }
            ]
        }
    ]

    try {
        const response = await callVisionLLM(messages)
        const cleaned = response.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()

        // Extract JSON from response
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('No JSON found in response')
        }

        const parsed = JSON.parse(jsonMatch[0])

        console.log('[Vision] Unfillable field analysis:', parsed)

        return {
            canFill: Boolean(parsed.canFill),
            suggestedValue: parsed.suggestedValue || undefined,
            fieldType: parsed.fieldType || 'unknown',
            reason: parsed.reason || 'Analysis complete',
            needsUserInput: Boolean(parsed.needsUserInput),
            confidence: parsed.confidence || 'low'
        }
    } catch (error) {
        console.error('[Vision] Unfillable field analysis failed:', error)
        return {
            canFill: false,
            fieldType: 'unknown',
            reason: 'Failed to analyze field',
            needsUserInput: true,
            confidence: 'low'
        }
    }
}

