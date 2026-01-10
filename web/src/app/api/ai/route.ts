import { NextRequest, NextResponse } from 'next/server'
import { parseIntent, generateRTIDraft, generatePlan, getAgentResponse, MODELS, callLLM } from '@/lib/llm'
import { orchestrate, orchestrateWithContext, createTaskFromIntent, markVisionUsed } from '@/lib/orchestrator'
import { getPlanForTask } from '@/lib/planner'
import { summarizeContext, contextToPrompt, calculateConfidence } from '@/lib/contextSummarizer'
import { analyzeScreenshot, checkForCaptcha, augmentContextWithVision, solveCaptcha, analyzeUnfillableField } from '@/lib/vision'
import type { BrowserContext, UserState, FullContext } from '@/types/context'
import {
    storeMemory,
    queryMemory,
    formatMemoriesForPrompt,
    isPineconeConfigured,
    getIndexStats,
    type MemoryEntry,
    type MemoryMetadata,
    type QueryOptions,
} from '@/lib/pinecone'
import {
    Agent,
    createBrowserState,
    createActionExecutor,
    type RawElementData,
    type ViewportInfo,
    type TabInfo,
    type AgentAction,
    type BrowserState,
} from '@/lib/agent'

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
                const { message, pageContext, conversationHistory, agentHistory, currentUrl, currentDomain } = data

                const contextPrompt = pageContext ? contextToPrompt(pageContext) : undefined
                const agentResponse = await getAgentResponse(
                    message,
                    contextPrompt,
                    conversationHistory || [],
                    agentHistory || [],
                    currentUrl,
                    currentDomain
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

            // ============ Browser-Use Style Agent Step ============
            case 'agent_step': {
                const {
                    task,
                    elements,
                    viewport,
                    url,
                    title,
                    tabs,
                    screenshot,
                    previousState,
                    history
                } = data as {
                    task: string
                    elements: RawElementData[]
                    viewport: ViewportInfo
                    url: string
                    title: string
                    tabs?: TabInfo[]
                    screenshot?: string
                    previousState?: BrowserState
                    history?: Array<{
                        stepNumber: number
                        evaluation: string
                        memory: string
                        nextGoal: string
                        actionResults: Array<{ action: string; success: boolean; error?: string }>
                    }>
                }

                console.log('[API] Agent step for task:', task.slice(0, 100))
                console.log('[API] Received', elements.length, 'elements')

                // 1. Create browser state from extension data
                const browserState = createBrowserState({
                    url,
                    title,
                    viewport,
                    elements,
                    tabs,
                    screenshot,
                    previousState,
                })

                // 2. Create agent with callbacks
                const agent = new Agent({
                    task,
                    settings: {
                        maxSteps: 1,  // Single step execution
                        maxActionsPerStep: 3,
                        useVision: !!screenshot,
                    },
                    getBrowserState: async () => browserState,
                    executeAction: async (action: AgentAction) => {
                        // Return action for extension to execute
                        // The actual execution happens in the extension
                        return {
                            isDone: 'done' in action,
                            success: 'done' in action ? (action as any).done.success : null,
                            error: null,
                            judgement: null,
                            attachments: null,
                            images: null,
                            longTermMemory: null,
                            extractedContent: 'done' in action ? (action as any).done.text : null,
                            includeExtractedContentOnlyOnce: false,
                            metadata: { action, pendingExecution: true },
                        }
                    },
                    callLLM: async (messages: any[]) => {
                        return await callLLM(messages, MODELS.CONVERSATION)
                    },
                })

                // 3. Execute single step
                const result = await agent.run()

                // 4. Extract actions for extension to execute
                const lastHistory = result.history[result.history.length - 1]
                const actions = lastHistory?.modelOutput?.action || []
                const agentThinking = {
                    thinking: lastHistory?.modelOutput?.thinking,
                    evaluation: lastHistory?.modelOutput?.evaluationPreviousGoal,
                    memory: lastHistory?.modelOutput?.memory,
                    nextGoal: lastHistory?.modelOutput?.nextGoal,
                }

                return NextResponse.json({
                    success: true,
                    actions,
                    agentThinking,
                    browserState: {
                        elementsCount: browserState.interactiveElements.length,
                        url: browserState.url,
                        title: browserState.title,
                    },
                    isDone: result.success && actions.some((a: AgentAction) => 'done' in a),
                    finalMessage: result.finalMessage,
                }, { headers: corsHeaders })
            }

            // ============ Vector Memory - Store ============
            case 'store_memory': {
                const { entry, metadata } = data as {
                    entry: MemoryEntry
                    metadata: MemoryMetadata
                }

                if (!isPineconeConfigured()) {
                    return NextResponse.json({
                        success: false,
                        error: 'Pinecone is not configured. Add PINECONE_API_KEY to .env'
                    }, { status: 400, headers: corsHeaders })
                }

                console.log('[API] Storing memory for step:', metadata.stepNumber)
                const id = await storeMemory(entry, metadata)

                return NextResponse.json({
                    success: true,
                    id,
                    message: 'Memory stored successfully'
                }, { headers: corsHeaders })
            }

            // ============ Vector Memory - Query ============
            case 'query_memory': {
                const { instruction, options } = data as {
                    instruction: string
                    options?: QueryOptions
                }

                if (!isPineconeConfigured()) {
                    return NextResponse.json({
                        success: true,
                        memories: [],
                        formatted: '',
                        message: 'Pinecone not configured - skipping memory lookup'
                    }, { headers: corsHeaders })
                }

                console.log('[API] Querying memory for:', instruction.slice(0, 100))
                const memories = await queryMemory(instruction, options)
                const formatted = formatMemoriesForPrompt(memories)

                return NextResponse.json({
                    success: true,
                    memories,
                    formatted,
                    count: memories.length
                }, { headers: corsHeaders })
            }

            // ============ Vector Memory - Status ============
            case 'memory_status': {
                const configured = isPineconeConfigured()
                let stats = null

                if (configured) {
                    try {
                        stats = await getIndexStats()
                    } catch (error) {
                        console.warn('[API] Failed to get Pinecone stats:', error)
                    }
                }

                return NextResponse.json({
                    success: true,
                    configured,
                    stats
                }, { headers: corsHeaders })
            }

            // ============ TTS - Text to Speech ============
            case 'speak': {
                const { text, voice_id, rate } = data as {
                    text: string
                    voice_id?: string
                    rate?: number
                }

                if (!text || text.trim().length === 0) {
                    return NextResponse.json({
                        success: false,
                        error: 'Text is required'
                    }, { status: 400, headers: corsHeaders })
                }

                // Forward to Python TTS server
                const TTS_SERVER = process.env.TTS_SERVER_URL || 'http://localhost:8765'

                try {
                    const ttsResponse = await fetch(`${TTS_SERVER}/speak/base64`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ text, voice_id, rate })
                    })

                    if (ttsResponse.ok) {
                        const ttsResult = await ttsResponse.json()
                        return NextResponse.json({
                            success: true,
                            audio: ttsResult.audio,
                            text_length: text.length
                        }, { headers: corsHeaders })
                    } else {
                        console.warn('[API] TTS server error:', await ttsResponse.text())
                        return NextResponse.json({
                            success: false,
                            error: 'TTS server unavailable'
                        }, { status: 503, headers: corsHeaders })
                    }
                } catch (error) {
                    console.warn('[API] TTS server not reachable:', error)
                    return NextResponse.json({
                        success: false,
                        error: 'TTS server not running. Start with: cd tts_server && python app.py'
                    }, { status: 503, headers: corsHeaders })
                }
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
