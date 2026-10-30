export function makeRequestBody({
  model,
  payload,
  maxTokens,
  temperature,
  stop,
  reasoningEffort,
  sessionId,
}) {
  return {
    model,
    messages: payload.messages,
    stream: true,
    stream_options: { include_usage: true },
    ...(payload.tools.length > 0 ? { tools: payload.tools, tool_choice: 'auto' } : {}),
    ...(temperature !== undefined ? { temperature } : {}),
    ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
    ...(Array.isArray(stop) && stop.length > 0 ? { stop } : {}),
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    ...(sessionId ? {
      session_id: sessionId,
      conversation_id: sessionId,
      prompt_cache_key: sessionId,
    } : {}),
  }
}
