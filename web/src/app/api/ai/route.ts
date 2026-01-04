import { NextRequest, NextResponse } from 'next/server'
import { parseIntent, generateRTIDraft, generatePlan, getAgentResponse, MODELS } from '@/lib/llm'
import { orchestrate, orchestrateWithContext, createTaskFromIntent, markVisionUsed } from '@/lib/orchestrator'
import { getPlanForTask } from '@/lib/planner'
import { summarizeContext, contextToPrompt, calculateConfidence } from '@/lib/contextSummarizer'
import { analyzeScreenshot, checkForCaptcha, augmentContextWithVision, solveCaptcha, analyzeUnfillableField } from '@/lib/vision'
import type { BrowserContext, UserState, FullContext } from '@/types/context'

// CORS headers for extension requests
const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
}

// Handle preflight OPTIONS request
export async function OPTIONS() {
    return NextResponse.json({}, { headers: corsHeaders })
}

export async function POST(request: NextRequest) {
    try {
        const body = await request.json()
        const { action, data } = body

        console.log('[API] Received action:', action)

        switch (action) {
            // ============ Intent Parsing ============
            case 'parse_intent': {
                const { message, userContext, pageContext } = data
                console.log('[API] Parsing intent for:', message)

                // Convert page context to prompt text if available
                const contextPrompt = pageContext ? contextToPrompt(pageContext) : undefined

                const intent = await parseIntent(message, userContext, contextPrompt)
                console.log('[API] Intent result:', intent)
                const nextAction = orchestrate(null, intent)

                return NextResponse.json({
                    success: true,
                    intent,
                    nextAction
                }, { headers: corsHeaders })
            }

            // ============ Context Analysis ============
            case 'analyze_context': {
                const { browserContext, userState, userIntent } = data as {
                    browserContext: BrowserContext
                    userState: UserState
                    userIntent?: string
                }

                // Calculate confidence and summarize
                const confidence = calculateConfidence(browserContext)
                const summary = summarizeContext(browserContext, userState, userIntent)
                const promptText = contextToPrompt(summary, userIntent)

                return NextResponse.json({
                    success: true,
                    summary,
                    confidence,
                    promptText,
                    needsVision: confidence.needsVision
                }, { headers: corsHeaders })
            }

            // ============ Vision Fallback ============
            case 'vision_fallback': {
                const { screenshot, browserContext, userIntent } = data as {
                    screenshot: string
                    browserContext: BrowserContext
                    userIntent: string
                }

                console.log('[API] Running vision analysis')
                const visionResult = await analyzeScreenshot(screenshot, browserContext, userIntent)

                // Augment browser context with vision findings
                const augmentedContext = augmentContextWithVision(browserContext, visionResult)

                // Mark vision as used in orchestrator
                markVisionUsed()

                return NextResponse.json({
                    success: true,
                    visionResult,
                    augmentedContext,
                    captchaDetected: visionResult.captchaDetected
                }, { headers: corsHeaders })
            }

            // ============ CAPTCHA Check ============
            case 'check_captcha': {
                const { screenshot, browserContext } = data

                const result = await checkForCaptcha(screenshot, browserContext)

                return NextResponse.json({
                    success: true,
                    ...result
                }, { headers: corsHeaders })
            }

            // ============ CAPTCHA Solve ============
            case 'solve_captcha': {
                const { captchaScreenshot } = data

                console.log('[API] Attempting to solve CAPTCHA')
                const result = await solveCaptcha(captchaScreenshot)
                console.log('[API] CAPTCHA solve result:', result)

                return NextResponse.json({
                    success: true,
                    ...result
                }, { headers: corsHeaders })
            }

            // ============ Analyze Unfillable Field (Vision Fallback) ============
            case 'analyze_unfillable_field': {
                const { screenshot, fieldLabel, fieldType, pageContext } = data as {
                    screenshot: string
                    fieldLabel: string
                    fieldType: string
                    pageContext?: string
                }

                console.log('[API] Analyzing unfillable field:', fieldLabel)
                const result = await analyzeUnfillableField(screenshot, fieldLabel, fieldType, pageContext)
                console.log('[API] Unfillable field analysis result:', result)

                return NextResponse.json({
                    success: true,
                    ...result
                }, { headers: corsHeaders })
            }


            // ============ Agentic Chat (AI decides actions) ============
            case 'agent_chat': {
                const { message, pageContext, conversationHistory } = data

                const contextPrompt = pageContext ? contextToPrompt(pageContext) : undefined
                const agentResponse = await getAgentResponse(
                    message,
                    contextPrompt,
                    conversationHistory || []
                )

                console.log('[API] Agent response:', JSON.stringify(agentResponse).slice(0, 200))

                return NextResponse.json({
                    success: true,
                    ...agentResponse
                }, { headers: corsHeaders })
            }

            // ============ RTI Draft ============
            case 'generate_rti_draft': {
                const draft = await generateRTIDraft(data)
                return NextResponse.json({
                    success: true,
                    draft
                }, { headers: corsHeaders })
            }

            // ============ Planning ============
            case 'create_plan': {
                const { taskType, userContext, pageContext } = data

                // Use hardcoded plan for RTI (demo reliability)
                if (taskType === 'RTI') {
                    const steps = getPlanForTask(taskType, userContext)
                    return NextResponse.json({
                        success: true,
                        steps,
                        source: 'hardcoded'
                    }, { headers: corsHeaders })
                }

                // Use LLM for dynamic planning
                const contextPrompt = pageContext ? contextToPrompt(pageContext) : ''
                const steps = await generatePlan(taskType, contextPrompt, userContext)

                return NextResponse.json({
                    success: true,
                    steps,
                    source: 'llm'
                }, { headers: corsHeaders })
            }

            // ============ Orchestration ============
            case 'orchestrate': {
                const { task, intent, browserContext, userState } = data

                let nextAction
                if (browserContext && userState) {
                    nextAction = orchestrateWithContext(task, browserContext, userState)
                } else if (intent) {
                    nextAction = orchestrate(task, intent, browserContext)
                } else {
                    return NextResponse.json({
                        success: false,
                        error: 'Either intent or browserContext+userState required'
                    }, { status: 400, headers: corsHeaders })
                }

                return NextResponse.json({
                    success: true,
                    nextAction
                }, { headers: corsHeaders })
            }

            // ============ Model Info ============
            case 'get_models': {
                return NextResponse.json({
                    success: true,
                    models: MODELS
                }, { headers: corsHeaders })
            }

            default:
                return NextResponse.json(
                    { success: false, error: 'Unknown action' },
                    { status: 400, headers: corsHeaders }
                )
        }
    } catch (error) {
        console.error('[API] Error:', error)
        return NextResponse.json(
            { success: false, error: String(error) },
            { status: 500, headers: corsHeaders }
        )
    }
}
