/**
 * Translate DSH request messages and tools into ClinePass's OpenAI-compatible
 * wire shape. Files are projected to text handles; images are resolved through
 * the attachment seam into request-sized bytes.
 */

const IMAGE_MAX_EDGE = 1568
const IMAGE_MAX_BYTES = 1024 * 1024

/**
 * Concatenate text blocks.
 * @param {readonly Record<string, unknown>[]} blocks
 * @returns {string}
 */
function textOf(blocks) {
  if (!Array.isArray(blocks)) return ''
  return blocks
    .filter((block) => block && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

/**
 * Stable placeholder for one file block.
 * @param {Record<string, unknown>} block
 * @returns {string}
 */
function fileText(block) {
  const ref = block?.attachment && typeof block.attachment === 'object' ? block.attachment : null
  if (!ref) return '[File omitted]'
  const name = typeof ref.name === 'string' && ref.name ? ref.name : 'attachment'
  const bytes = Number.isFinite(Number(ref.bytes)) ? Number(ref.bytes) : null
  return `[File: ${name}${bytes === null ? '' : `, ${bytes} bytes`}]`
}

/**
 * Placeholder for an image that cannot be resolved or was deliberately offloaded.
 * @param {Record<string, unknown>} block
 * @returns {string}
 */
function imagePlaceholder(block) {
  const ref = block?.attachment && typeof block.attachment === 'object' ? block.attachment : null
  const name = typeof ref?.name === 'string' && ref.name ? ref.name : 'image'
  const mediaType = typeof ref?.mediaType === 'string' ? ref.mediaType : 'image'
  if (block?.offloaded === true) {
    return `[Image: ${name} (${mediaType}) — previously analyzed and omitted from this request]`
  }
  return `[Image: ${name} (${mediaType})]`
}

/**
 * Request-image target for ClinePass's gateway.
 * @param {Record<string, unknown>} ref
 * @returns {{ width: number, height: number, maxBytes: number }}
 */
function imageTarget(ref) {
  const width = Math.max(1, Number(ref?.width) || IMAGE_MAX_EDGE)
  const height = Math.max(1, Number(ref?.height) || IMAGE_MAX_EDGE)
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
    maxBytes: IMAGE_MAX_BYTES,
  }
}

/**
 * Resolve one image block to a data URL.
 * @param {Record<string, unknown>} block
 * @param {unknown} attachments
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<string>}
 */
async function imageToUrl(block, attachments, signal) {
  if (block?.offloaded === true) return imagePlaceholder(block)
  const ref = block?.attachment && typeof block.attachment === 'object' ? block.attachment : null
  if (!ref) return imagePlaceholder(block)
  if (!attachments || typeof attachments.readImageRequest !== 'function') {
    return imagePlaceholder(block)
  }
  try {
    const requestImage = await attachments.readImageRequest(ref, imageTarget(ref), signal)
    if (!requestImage?.data) return imagePlaceholder(block)
    const base64 = Buffer.from(requestImage.data).toString('base64')
    return `data:${requestImage.mediaType || ref.mediaType || 'image/png'};base64,${base64}`
  } catch {
    return imagePlaceholder(block)
  }
}

/**
 * Build OpenAI-compatible content for one user/developer message.
 * @param {readonly Record<string, unknown>[]} blocks
 * @param {unknown} attachments
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<string | Record<string, unknown>[]>}
 */
async function userContent(blocks, attachments, signal) {
  const content = []
  let hasImage = false
  for (const block of Array.isArray(blocks) ? blocks : []) {
    if (!block || typeof block !== 'object') continue
    if (block.type === 'text' && typeof block.text === 'string' && block.text !== '') {
      content.push({ type: 'text', text: block.text })
    } else if (block.type === 'image') {
      const url = await imageToUrl(block, attachments, signal)
      if (url.startsWith('data:image/')) {
        hasImage = true
        content.push({ type: 'image_url', image_url: { url } })
      } else {
        content.push({ type: 'text', text: url })
      }
    } else if (block.type === 'file') {
      content.push({ type: 'text', text: fileText(block) })
    } else if (block.type === 'tool-result') {
      const resultText = textOf(block.content)
      if (resultText) content.push({ type: 'text', text: resultText })
    }
  }
  if (!hasImage) {
    return content.filter((part) => part.type === 'text').map((part) => part.text).join('\n')
  }
  return content
}

/**
 * Build an assistant message with text, reasoning replay, and tool calls.
 * @param {Record<string, unknown>} message
 * @param {unknown} attachments
 * @param {AbortSignal | undefined} signal
 * @returns {Promise<Record<string, unknown>>}
 */
async function assistantMessage(message, attachments, signal) {
  const blocks = Array.isArray(message.content) ? message.content : []
  const text = textOf(blocks)
  const reasoning = blocks
    .filter((block) => block && block.type === 'reasoning' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
  const toolCalls = blocks
    .filter((block) => block && block.type === 'tool-call')
    .map((block) => ({
      id: String(block.id || ''),
      type: 'function',
      function: {
        name: String(block.name || ''),
        arguments: typeof block.arguments === 'string' ? block.arguments : JSON.stringify(block.arguments ?? {}),
      },
    }))

  const out = {
    role: 'assistant',
    content: text === '' ? null : text,
    ...(reasoning ? { reasoning_content: reasoning } : {}),
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  }

  // Some assistant content may include images. ClinePass's chat shape cannot
  // represent assistant-side images, so they become deterministic text.
  for (const block of blocks) {
    if (block?.type === 'image') {
      out.content = `${out.content || ''}${out.content ? '\n' : ''}${imagePlaceholder(block)}`
    }
  }
  return out
}

/**
 * Build the complete OpenAI-compatible payload.
 *
 * @param {{
 *   provider: string,
 *   model: string,
 *   messages: readonly Record<string, unknown>[],
 *   system?: string,
 *   tools?: readonly Record<string, unknown>[],
 *   temperature?: number,
 *   maxTokens?: number,
 *   stop?: readonly string[],
 *   signal?: AbortSignal,
 * }} options
 * @param {{ attachments?: unknown }} [deps]
 * @returns {Promise<{ messages: Record<string, unknown>[], tools: Record<string, unknown>[] }>}
 */
export async function buildOpenAiPayload(options, { attachments } = {}) {
  const messages = []

  if (typeof options.system === 'string' && options.system !== '') {
    messages.push({ role: 'system', content: options.system })
  }

  for (const message of Array.isArray(options.messages) ? options.messages : []) {
    if (!message || typeof message !== 'object') continue
    const role = String(message.role || '')
    const blocks = Array.isArray(message.content) ? message.content : []

    if (role === 'system') {
      const text = textOf(blocks)
      if (text !== '') messages.push({ role: 'system', content: text })
      continue
    }
    if (role === 'developer') {
      const text = textOf(blocks)
      if (text !== '') messages.push({ role: 'system', content: text })
      continue
    }
    if (role === 'assistant') {
      messages.push(await assistantMessage(message, attachments, options.signal))
      continue
    }
    if (role === 'tool') {
      const callId = message.toolCallId
        || message.source?.callId
        || blocks.find((block) => block?.type === 'tool-result')?.toolCallId
        || ''
      messages.push({
        role: 'tool',
        tool_call_id: String(callId),
        content: textOf(blocks) || (message.isError ? '[tool error]' : ''),
      })
      continue
    }
    // `user` and identity-free request inputs.
    const content = await userContent(blocks, attachments, options.signal)
    messages.push({ role: 'user', content })
  }

  const tools = (Array.isArray(options.tools) ? options.tools : [])
    .filter((tool) => tool && typeof tool === 'object')
    .map((tool) => ({
      type: 'function',
      function: {
        name: String(tool.name || ''),
        description: String(tool.description || ''),
        parameters: tool.parameters && typeof tool.parameters === 'object'
          ? tool.parameters
          : { type: 'object', properties: {} },
      },
    }))

  return { messages, tools }
}
