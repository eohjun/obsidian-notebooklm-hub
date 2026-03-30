import type { INotebookLMClient } from '../../domain/interfaces';
import type { QueryResponse } from '../../domain/entities';

/**
 * Callback interface for LLM text generation.
 * This decouples the use case from any specific LLM provider.
 * In Phase 4+, wire to obsidian-llm-shared's AIService.
 */
export interface LLMGenerateFunc {
  (prompt: string, systemPrompt: string): Promise<string>;
}

export interface DelegatedQueryResult {
  /** The user's original high-level request */
  originalRequest: string;
  /** Questions the LLM generated */
  generatedQuestions: string[];
  /** Raw responses from NotebookLM for each question */
  responses: QueryResponse[];
  /** LLM's synthesized summary */
  synthesis: string;
}

/**
 * Use case: AI-delegated query.
 * An LLM formulates questions for NotebookLM, queries it, then synthesizes the answers.
 *
 * Flow:
 * 1. User gives high-level request ("Summarize key insights")
 * 2. LLM generates 3-5 targeted questions
 * 3. Each question is sent to NotebookLM
 * 4. LLM synthesizes all responses into a coherent answer
 */
export class AIDelegatedQuery {
  constructor(private client: INotebookLMClient) {}

  async execute(
    notebookId: string,
    userRequest: string,
    llmGenerate: LLMGenerateFunc,
    onProgress?: (step: string) => void,
  ): Promise<DelegatedQueryResult> {
    // Step 1: Generate questions
    onProgress?.('Generating questions...');
    const questionsRaw = await llmGenerate(
      `The user wants to learn about their NotebookLM notebook. Their request: "${userRequest}"

Generate 3-5 specific, targeted questions that would help fulfill this request. Each question should focus on a different aspect.

Output ONLY the questions, one per line, with no numbering or bullets.`,
      'You are a research assistant helping extract insights from a knowledge base. Generate focused questions that will collectively address the user\'s request.',
    );

    const generatedQuestions = questionsRaw
      .split('\n')
      .map((q) => q.trim())
      .filter((q) => q.length > 5 && q.endsWith('?'));

    if (generatedQuestions.length === 0) {
      throw new Error('LLM failed to generate valid questions');
    }

    // Step 2: Query NotebookLM for each question
    const responses: QueryResponse[] = [];
    for (let i = 0; i < generatedQuestions.length; i++) {
      onProgress?.(`Querying (${i + 1}/${generatedQuestions.length})...`);
      const response = await this.client.queryNotebook(notebookId, generatedQuestions[i]);
      responses.push(response);
    }

    // Step 3: Synthesize
    onProgress?.('Synthesizing...');
    const qaContext = generatedQuestions.map((q, i) => {
      return `Q: ${q}\nA: ${responses[i].response}`;
    }).join('\n\n---\n\n');

    const synthesis = await llmGenerate(
      `The user's original request: "${userRequest}"

Here are the Q&A pairs from querying a NotebookLM notebook:

${qaContext}

Based on these responses, provide a comprehensive, well-organized answer to the user's original request. Include key insights, cite relevant information, and highlight any patterns or themes across the answers.`,
      'You are a research synthesizer. Create a clear, comprehensive response that addresses the user\'s original request by combining the information from multiple Q&A pairs.',
    );

    return {
      originalRequest: userRequest,
      generatedQuestions,
      responses,
      synthesis,
    };
  }
}
