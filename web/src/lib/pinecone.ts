/**
 * Pinecone Vector Memory - Persistent RAG for Agent Context
 * Free tier compatible implementation
 */

import { Pinecone } from '@pinecone-database/pinecone';

// ============ Configuration ============

const PINECONE_API_KEY = process.env.PINECONE_API_KEY || '';
const PINECONE_INDEX_NAME = process.env.PINECONE_INDEX_NAME || 'opero-memory';

// Embedding dimensions - using a smaller model for free tier
const EMBEDDING_DIMENSIONS = 384;

// ============ Types ============

export interface MemoryEntry {
    observation: string;
    reasoning: string;
    action: string;
    result?: string;
}

export interface MemoryMetadata {
    url: string;
    timestamp: number;
    userId?: string;
    stepNumber: number;
    taskType?: string;
}

export interface StoredMemory extends MemoryEntry, MemoryMetadata {
    id: string;
    score?: number;
}

export interface QueryOptions {
    topK?: number;
    filter?: Record<string, string | number>;
    minScore?: number;
}

// ============ Pinecone Client ============

let pineconeClient: Pinecone | null = null;

/**
 * Initialize Pinecone client
 */
export async function initializePinecone(): Promise<Pinecone> {
    if (pineconeClient) {
        return pineconeClient;
    }

    if (!PINECONE_API_KEY) {
        throw new Error('PINECONE_API_KEY is not configured');
    }

    pineconeClient = new Pinecone({
        apiKey: PINECONE_API_KEY,
    });

    console.log('[Pinecone] Client initialized');
    return pineconeClient;
}

/**
 * Get or create the memory index
 */
export async function getMemoryIndex() {
    const client = await initializePinecone();
    return client.index(PINECONE_INDEX_NAME);
}

// ============ Embedding Function ============

/**
 * Generate embeddings using OpenRouter's free embedding model
 * Falls back to simple hash-based embeddings if API fails
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/embeddings';

    try {
        // Try OpenRouter embeddings first
        const response = await fetch(OPENROUTER_API_URL, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': 'https://opero.app',
                'X-Title': 'Opero Memory',
            },
            body: JSON.stringify({
                model: 'openai/text-embedding-3-small',
                input: text.slice(0, 8000), // Limit text length
            }),
        });

        if (response.ok) {
            const data = await response.json();
            if (data.data?.[0]?.embedding) {
                return data.data[0].embedding;
            }
        }
    } catch (error) {
        console.warn('[Pinecone] Embedding API failed, using fallback:', error);
    }

    // Fallback: Simple hash-based embedding for basic similarity
    return generateFallbackEmbedding(text);
}

/**
 * Fallback embedding using character frequency + positional hashing
 * Not as good as neural embeddings but works offline
 */
function generateFallbackEmbedding(text: string): number[] {
    const embedding = new Array(EMBEDDING_DIMENSIONS).fill(0);
    const normalized = text.toLowerCase();

    for (let i = 0; i < normalized.length; i++) {
        const charCode = normalized.charCodeAt(i);
        const position = i % EMBEDDING_DIMENSIONS;
        const hash = (charCode * (i + 1) * 31) % EMBEDDING_DIMENSIONS;

        embedding[position] += Math.sin(charCode / 255);
        embedding[hash] += Math.cos(charCode / 127);
    }

    // Normalize to unit vector
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
        for (let i = 0; i < embedding.length; i++) {
            embedding[i] /= magnitude;
        }
    }

    return embedding;
}

// ============ Memory Storage ============

/**
 * Store a step in vector memory
 */
export async function storeMemory(
    entry: MemoryEntry,
    metadata: MemoryMetadata
): Promise<string> {
    const index = await getMemoryIndex();

    // Generate ID
    const id = `step_${metadata.timestamp}_${metadata.stepNumber}`;

    // Create text for embedding
    const textContent = [
        `Observation: ${entry.observation}`,
        `Reasoning: ${entry.reasoning}`,
        `Action: ${entry.action}`,
        entry.result ? `Result: ${entry.result}` : '',
    ].filter(Boolean).join('\n');

    // Generate embedding
    const embedding = await generateEmbedding(textContent);

    // Store in Pinecone
    await index.upsert([
        {
            id,
            values: embedding,
            metadata: {
                ...metadata,
                observation: entry.observation.slice(0, 1000),
                reasoning: entry.reasoning.slice(0, 500),
                action: entry.action.slice(0, 200),
                result: entry.result?.slice(0, 500) || '',
            },
        },
    ]);

    console.log(`[Pinecone] Stored memory: ${id}`);
    return id;
}

/**
 * Store multiple steps in batch
 */
export async function storeMemoryBatch(
    entries: Array<{ entry: MemoryEntry; metadata: MemoryMetadata }>
): Promise<string[]> {
    const index = await getMemoryIndex();
    const ids: string[] = [];

    const vectors = await Promise.all(
        entries.map(async ({ entry, metadata }) => {
            const id = `step_${metadata.timestamp}_${metadata.stepNumber}`;
            ids.push(id);

            const textContent = [
                `Observation: ${entry.observation}`,
                `Reasoning: ${entry.reasoning}`,
                `Action: ${entry.action}`,
                entry.result ? `Result: ${entry.result}` : '',
            ].filter(Boolean).join('\n');

            const embedding = await generateEmbedding(textContent);

            return {
                id,
                values: embedding,
                metadata: {
                    ...metadata,
                    observation: entry.observation.slice(0, 1000),
                    reasoning: entry.reasoning.slice(0, 500),
                    action: entry.action.slice(0, 200),
                    result: entry.result?.slice(0, 500) || '',
                },
            };
        })
    );

    await index.upsert(vectors);
    console.log(`[Pinecone] Stored ${vectors.length} memories in batch`);

    return ids;
}

// ============ Memory Retrieval ============

/**
 * Query relevant memories for a given instruction
 */
export async function queryMemory(
    instruction: string,
    options: QueryOptions = {}
): Promise<StoredMemory[]> {
    const { topK = 5, filter, minScore = 0.5 } = options;

    const index = await getMemoryIndex();

    // Generate query embedding
    const queryEmbedding = await generateEmbedding(instruction);

    // Query Pinecone
    const results = await index.query({
        vector: queryEmbedding,
        topK,
        filter: filter as any,
        includeMetadata: true,
    });

    // Transform results
    const memories: StoredMemory[] = [];

    for (const match of results.matches || []) {
        if (match.score && match.score < minScore) continue;

        const metadata = match.metadata as Record<string, any>;

        memories.push({
            id: match.id,
            score: match.score,
            observation: metadata.observation || '',
            reasoning: metadata.reasoning || '',
            action: metadata.action || '',
            result: metadata.result || undefined,
            url: metadata.url || '',
            timestamp: metadata.timestamp || 0,
            userId: metadata.userId,
            stepNumber: metadata.stepNumber || 0,
            taskType: metadata.taskType,
        });
    }

    console.log(`[Pinecone] Retrieved ${memories.length} relevant memories`);
    return memories;
}

/**
 * Query memories for a specific URL
 */
export async function queryMemoriesByUrl(
    url: string,
    topK: number = 10
): Promise<StoredMemory[]> {
    return queryMemory(`Actions performed on ${url}`, {
        topK,
        filter: { url },
    });
}

/**
 * Query memories for a specific task type
 */
export async function queryMemoriesByTask(
    taskType: string,
    instruction: string,
    topK: number = 5
): Promise<StoredMemory[]> {
    return queryMemory(instruction, {
        topK,
        filter: { taskType },
    });
}

// ============ Memory Management ============

/**
 * Delete old memories to stay within free tier limits
 */
export async function pruneOldMemories(
    maxAgeMs: number = 7 * 24 * 60 * 60 * 1000 // Default: 7 days
): Promise<number> {
    const index = await getMemoryIndex();
    const cutoffTime = Date.now() - maxAgeMs;

    // Note: Pinecone free tier has limited filtering
    // For production, implement proper pagination and cleanup
    console.log(`[Pinecone] Pruning memories older than ${new Date(cutoffTime).toISOString()}`);

    // This would require listing and deleting, which is expensive
    // For now, just log - implement proper cleanup in production
    return 0;
}

/**
 * Delete all memories for a user
 */
export async function deleteUserMemories(userId: string): Promise<void> {
    const index = await getMemoryIndex();

    // Use delete by filter (requires metadata)
    await index.deleteMany({
        filter: { userId } as any,
    });

    console.log(`[Pinecone] Deleted memories for user: ${userId}`);
}

// ============ Utility Functions ============

/**
 * Format memories as context for LLM prompt
 */
export function formatMemoriesForPrompt(memories: StoredMemory[]): string {
    if (memories.length === 0) return '';

    const formatted = memories.map((m, i) => {
        const score = m.score ? ` (relevance: ${(m.score * 100).toFixed(0)}%)` : '';
        return `<memory_${i + 1}${score}>
URL: ${m.url}
Observation: ${m.observation}
Reasoning: ${m.reasoning}
Action: ${m.action}
${m.result ? `Result: ${m.result}` : ''}
</memory_${i + 1}>`;
    }).join('\n\n');

    return `<relevant_memories>
${formatted}
</relevant_memories>`;
}

/**
 * Check if Pinecone is configured
 */
export function isPineconeConfigured(): boolean {
    return Boolean(PINECONE_API_KEY);
}

/**
 * Get index stats
 */
export async function getIndexStats(): Promise<{ vectorCount: number; dimension: number } | null> {
    try {
        const index = await getMemoryIndex();
        const stats = await index.describeIndexStats();
        return {
            vectorCount: stats.totalRecordCount || 0,
            dimension: stats.dimension || EMBEDDING_DIMENSIONS,
        };
    } catch (error) {
        console.error('[Pinecone] Failed to get index stats:', error);
        return null;
    }
}
