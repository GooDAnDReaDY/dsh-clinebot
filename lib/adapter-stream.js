/**
 * Convert ClinePass OpenAI-compatible stream events into DSH `StreamChunk`s.
 *
 * The adapter owns the block lifecycle: it opens a block on the first delta,
 * forwards deltas, then closes every open block before the terminal finish.
 * Tool-call arguments remain raw JSON strings, as required by the DSH protocol.
 */

import { LlmError, ToolCallId } from '@deepseek-ai/dsh-llm'
import { extractUsage, isAbortError } from './transport/cline-transport.js'

/**
 * Keep only fields the DSH `TokenUsage` contract accepts.
 * @param {ReturnType<typeof extractUsage>} usage
 * @returns {Record<string, number>}
 */
function wireUsage(usage) {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    ...(usage.totalTokens !== undefined ? { totalTokens: usage.totalTokens } : {}),
    ...(usage.cacheReadTokens !== undefined ? { cacheReadTokens: usage.cacheReadTokens } : {}),
    ...(usage.cacheWriteTokens !== undefined ? { cacheWriteTokens: usage.cacheWriteTokens } : {}),
    ...(usage.reasoningTokens !== undefined ? { reasoningTokens: usage.reasoningTokens } : {}),
  }
}

/**
 * Map a provider finish reason to a DSH finish chunk.
 * @param {string} finishReason
 * @param {boolean} hasToolCalls
 * @returns {{ type: 'finish', reason: Record<string, unknown> }}
 */
function finishChunk(finishReason, hasToolCalls) {
  if (hasToolCalls || finishReason === 'tool_calls') {
    return { type: 'finish', reason: { kind: 'tool-calls' } }
  }
  if (finishReason === 'length' || finishReason === 'max_tokens') {
    return { type: 'finish', reason: { kind: 'max-tokens' } }
  }
  return { type: 'finish', reason: { kind: 'stop' } }
}

/**
 * Stream one OpenAI-compatible SSE response as DSH chunks.
 *
 * @param {AsyncIterable<Record<string, unknown> | { done: true } | { raw: string }>} events
 * @param {{
 *   signal?: AbortSignal,
 *   onUsage?: (usage: ReturnType<typeof extractUsage>) => void,
 *   onFirstToken?: () => void,
 * }} [options]
 * @returns {AsyncGenerator<Record<string, unknown>>}
 */
export async function* streamOpenAiChunks(events, { signal, onUsage, onFirstToken } = {}) {
  let nextIndex = 0
  let textIndex = -1
  let reasoningIndex = -1
  let text = ''
  let reasoning = ''
  const toolBlocks = new Map()
  let finishReason = ''
  let sawContent = false
  let aborted = false

  try {
    for await (const event of events) {
      if (signal?.aborted) {
        aborted = true
        break
      }
      if (!event || typeof event !== 'object') continue
      if (event.done === true) break
      if (event.raw !== undefined) continue
      if (event.error) {
        const error = event.error
        throw new LlmError(
          String(error.message || 'ClinePass stream returned an error'),
          String(error.code || 'PROVIDER_ERROR'),
          {
            ...(Number.isFinite(Number(error.status)) ? { status: Number(error.status) } : {}),
          },
        )
      }

      if (event.usage) {
        const usage = extractUsage(event.usage)
        onUsage?.(usage)
        yield { type: 'usage', usage: wireUsage(usage) }
      }

      const choice = Array.isArray(event.choices) ? event.choices[0] : null
      if (!choice) continue
      const delta = choice.delta && typeof choice.delta === 'object' ? choice.delta : {}

      const reasoningText = typeof delta.reasoning_content === 'string'
        ? delta.reasoning_content
        : (typeof delta.reasoning === 'string' ? delta.reasoning : '')
      if (reasoningText) {
        if (reasoningIndex < 0) {
          reasoningIndex = nextIndex++
          yield { type: 'block-start', index: reasoningIndex, blockType: 'reasoning' }
        }
        reasoning += reasoningText
        if (!sawContent) onFirstToken?.()
        sawContent = true
        yield { type: 'reasoning-delta', index: reasoningIndex, text: reasoningText }
      }

      const contentText = typeof delta.content === 'string' ? delta.content : ''
      if (contentText) {
        if (textIndex < 0) {
          textIndex = nextIndex++
          yield { type: 'block-start', index: textIndex, blockType: 'text' }
        }
        text += contentText
        if (!sawContent) onFirstToken?.()
        sawContent = true
        yield { type: 'text-delta', index: textIndex, text: contentText }
      }

      if (Array.isArray(delta.tool_calls)) {
        for (const call of delta.tool_calls) {
          if (!call || typeof call !== 'object') continue
          const providerIndex = Number.isInteger(call.index) ? call.index : toolBlocks.size
          let block = toolBlocks.get(providerIndex)
          if (!block) {
            block = {
              index: nextIndex++,
              id: typeof call.id === 'string' && call.id ? call.id : `clinebot_call_${providerIndex}`,
              name: '',
              arguments: '',
            }
            toolBlocks.set(providerIndex, block)
            yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
          }
          if (typeof call.id === 'string' && call.id) block.id = call.id
          const name = typeof call.function?.name === 'string' ? call.function.name : ''
          if (name) block.name = name
          const argumentsDelta = typeof call.function?.arguments === 'string' ? call.function.arguments : ''
          block.arguments += argumentsDelta
          if (!sawContent) onFirstToken?.()
          sawContent = true
          yield {
            type: 'tool-call-delta',
            index: block.index,
            id: ToolCallId(block.id),
            ...(name ? { name } : {}),
            argumentsDelta,
          }
        }
      }

      if (typeof choice.finish_reason === 'string' && choice.finish_reason) {
        finishReason = choice.finish_reason
      }
    }
  } catch (error) {
    if (isAbortError(error)) {
      yield { type: 'finish', reason: { kind: 'aborted', failure: { message: 'Request aborted', code: 'ABORTED' } } }
      return
    }
    throw error
  }

  if (aborted || signal?.aborted) {
    yield { type: 'finish', reason: { kind: 'aborted', failure: { message: 'Request aborted', code: 'ABORTED' } } }
    return
  }

  // Close every block that was opened. DSH's assembler consumes block-end as
  // the authoritative final content of that block.
  if (textIndex >= 0) {
    yield { type: 'block-end', index: textIndex, block: { type: 'text', text } }
  }
  if (reasoningIndex >= 0) {
    yield { type: 'block-end', index: reasoningIndex, block: { type: 'reasoning', text: reasoning } }
  }
  for (const block of toolBlocks.values()) {
    yield {
      type: 'block-end',
      index: block.index,
      block: {
        type: 'tool-call',
        id: ToolCallId(block.id),
        name: block.name,
        arguments: block.arguments,
      },
    }
  }

  if (!sawContent) {
    yield {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message: 'ClinePass returned an empty completion', code: 'EMPTY_RESPONSE' },
      },
    }
    return
  }

  yield finishChunk(finishReason, toolBlocks.size > 0)
}

/**
 * Convert a non-streaming OpenAI-compatible completion into DSH chunks.
 * Used as a fallback when ClinePass ignores `stream: true` or returns JSON.
 *
 * @param {Record<string, unknown>} json
 * @param {{ onUsage?: (usage: ReturnType<typeof extractUsage>) => void, onFirstToken?: () => void }} [options]
 * @returns {AsyncGenerator<Record<string, unknown>>}
 */
export async function* streamJsonCompletion(json, { onUsage, onFirstToken } = {}) {
  if (json?.error) {
    throw new LlmError(
      String(json.error.message || 'ClinePass returned an error'),
      String(json.error.code || 'PROVIDER_ERROR'),
      Number.isFinite(Number(json.error.status)) ? { status: Number(json.error.status) } : {},
    )
  }
  const choice = Array.isArray(json?.choices) ? json.choices[0] : null
  if (!choice) {
    yield {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message: 'ClinePass returned an empty completion', code: 'EMPTY_RESPONSE' },
      },
    }
    return
  }
  const message = choice.message && typeof choice.message === 'object' ? choice.message : {}
  let nextIndex = 0
  let sawContent = false

  if (json.usage) {
    const usage = extractUsage(json.usage)
    onUsage?.(usage)
    yield { type: 'usage', usage: wireUsage(usage) }
  }

  const reasoning = typeof message.reasoning_content === 'string'
    ? message.reasoning_content
    : (typeof message.reasoning === 'string' ? message.reasoning : '')
  if (reasoning) {
    const index = nextIndex++
    yield { type: 'block-start', index, blockType: 'reasoning' }
    yield { type: 'reasoning-delta', index, text: reasoning }
    yield { type: 'block-end', index, block: { type: 'reasoning', text: reasoning } }
    sawContent = true
  }

  const content = typeof message.content === 'string' ? message.content : ''
  if (content) {
    const index = nextIndex++
    yield { type: 'block-start', index, blockType: 'text' }
    yield { type: 'text-delta', index, text: content }
    yield { type: 'block-end', index, block: { type: 'text', text: content } }
    sawContent = true
  }

  let hasToolCalls = false
  if (Array.isArray(message.tool_calls)) {
    for (const call of message.tool_calls) {
      if (!call || typeof call !== 'object') continue
      hasToolCalls = true
      const id = typeof call.id === 'string' && call.id ? call.id : `clinebot_call_${nextIndex}`
      const name = typeof call.function?.name === 'string' ? call.function.name : ''
      const args = typeof call.function?.arguments === 'string' ? call.function.arguments : ''
      const index = nextIndex++
      yield { type: 'block-start', index, blockType: 'tool-call' }
      yield { type: 'tool-call-delta', index, id: ToolCallId(id), ...(name ? { name } : {}), argumentsDelta: args }
      yield { type: 'block-end', index, block: { type: 'tool-call', id: ToolCallId(id), name, arguments: args } }
      sawContent = true
    }
  }

  if (!sawContent) {
    yield {
      type: 'finish',
      reason: {
        kind: 'error',
        failure: { message: 'ClinePass returned an empty completion', code: 'EMPTY_RESPONSE' },
      },
    }
    return
  }

  onFirstToken?.()
  yield finishChunk(String(choice.finish_reason || ''), hasToolCalls)
}
