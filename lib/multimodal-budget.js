/**
 * Multimodal Request Budgeting & Prompt Cache Image Offload (Issue #234)
 *
 * 1. Offloads previously seen images from earlier turns in the conversation history
 *    into stable text placeholders, preserving model KV/prompt cache prefixes.
 * 2. Enforces a strict payload byte ceiling (default 40MB) to prevent upstream HTTP 413
 *    rejections and memory spikes.
 */

const DEFAULT_MAX_PAYLOAD_BYTES = 40 * 1024 * 1024 // 40 MB

function estimateImageBlockBytes(block) {
  if (!block || typeof block !== 'object') return 0
  if (block.type === 'image_url' && typeof block.image_url?.url === 'string') {
    return block.image_url.url.length
  }
  if (block.type === 'image' && typeof block.source?.data === 'string') {
    return block.source.data.length
  }
  if (block.type === 'image' && block.attachment && typeof block.attachment === 'object') {
    const bytes = Number(block.attachment.bytes || block.attachment.size || 0)
    if (bytes > 0) return Math.ceil(bytes * 4 / 3) + 64
  }
  return 0
}

function makeTextPlaceholder(reason = 'analyzed') {
  return {
    type: 'text',
    text: reason === 'cache'
      ? '[Image: previously analyzed visual attachment retained in context]'
      : '[Image: attachment pruned to satisfy request payload budget]',
  }
}

export function optimizePromptCacheAndBudget(messages, options = {}) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: messages || [], offloadedCount: 0, totalImageBytes: 0 }
  }

  const offloadSeen = options.offloadSeenImages !== false
  const maxBytes = Number(options.maxPayloadBytes) || DEFAULT_MAX_PAYLOAD_BYTES

  // Find index of the latest assistant message in the history
  let lastAssistantIdx = -1
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === 'assistant') {
      lastAssistantIdx = i
      break
    }
  }

  let offloadedCount = 0
  const clone = messages.map(m => {
    if (!m || typeof m !== 'object') return m
    if (Array.isArray(m.content)) {
      return { ...m, content: [...m.content] }
    }
    return { ...m }
  })

  // Phase 1: Offload seen images (appear before lastAssistantIdx)
  if (offloadSeen && lastAssistantIdx > 0) {
    for (let i = 0; i < lastAssistantIdx; i++) {
      const msg = clone[i]
      if (Array.isArray(msg?.content)) {
        for (let j = 0; j < msg.content.length; j++) {
          const item = msg.content[j]
          if (item?.type === 'image_url' || item?.type === 'image') {
            msg.content[j] = makeTextPlaceholder('cache')
            offloadedCount += 1
          }
        }
      }
    }
  }

  // Phase 2: Calculate total remaining image bytes
  const remainingImages = []
  let totalBytes = 0

  for (let i = 0; i < clone.length; i++) {
    const msg = clone[i]
    if (Array.isArray(msg?.content)) {
      for (let j = 0; j < msg.content.length; j++) {
        const item = msg.content[j]
        if (item?.type === 'image_url' || item?.type === 'image') {
          const bytes = estimateImageBlockBytes(item)
          totalBytes += bytes
          remainingImages.push({ msgIdx: i, blockIdx: j, bytes })
        }
      }
    }
  }

  // Phase 3: Budget check - if over maxBytes, evict oldest remaining images
  if (totalBytes > maxBytes && remainingImages.length > 0) {
    for (const img of remainingImages) {
      if (totalBytes <= maxBytes) break
      const msg = clone[img.msgIdx]
      msg.content[img.blockIdx] = makeTextPlaceholder('budget')
      totalBytes -= img.bytes
      offloadedCount += 1
    }
  }

  return {
    messages: clone,
    offloadedCount,
    totalImageBytes: totalBytes,
  }
}
