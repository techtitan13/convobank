import type { Message, Conversation } from './supabase'

/**
 * Template-based conversation generator.
 * Analyzes stored conversations and generates new ones by:
 * 1. Finding conversations similar to the given topic
 * 2. Extracting message patterns (openers, responses, closes)
 * 3. Assembling a new conversation using real phrases from stored data
 */

type MessagePool = {
  buyerOpeners: string[]
  sellerResponses: string[]
  buyerFollowups: string[]
  sellerDetails: string[]
  buyerClosings: string[]
  sellerClosings: string[]
}

function buildMessagePool(conversations: Conversation[], topic: string): MessagePool {
  const pool: MessagePool = {
    buyerOpeners: [],
    sellerResponses: [],
    buyerFollowups: [],
    sellerDetails: [],
    buyerClosings: [],
    sellerClosings: [],
  }

  const topicWords = topic.toLowerCase().split(/\s+/)

  // Score conversations by relevance to topic
  const scored = conversations.map(conv => {
    const text = (conv.raw_text + conv.title).toLowerCase()
    const score = topicWords.filter(word => text.includes(word)).length
    return { conv, score }
  }).sort((a, b) => b.score - a.score)

  // Use top 10 most relevant conversations
  const relevant = scored.slice(0, 10).map(s => s.conv)
  // Also add random sample from the rest for variety
  const rest = scored.slice(10)
  const randomSample = rest.sort(() => Math.random() - 0.5).slice(0, 5).map(s => s.conv)
  const selected = [...relevant, ...randomSample]

  for (const conv of selected) {
    const msgs = conv.messages
    if (!msgs || msgs.length === 0) continue

    // Categorize messages by position in conversation
    msgs.forEach((msg, idx) => {
      const isFirst = idx === 0
      const isLast = idx === msgs.length - 1
      const isNearEnd = idx >= msgs.length - 3
      const content = msg.content.trim()
      if (!content || content.length < 10) return

      if (msg.role === 'buyer') {
        if (isFirst) pool.buyerOpeners.push(content)
        else if (isNearEnd) pool.buyerClosings.push(content)
        else pool.buyerFollowups.push(content)
      } else {
        if (isFirst || idx === 1) pool.sellerResponses.push(content)
        else if (isLast) pool.sellerClosings.push(content)
        else pool.sellerDetails.push(content)
      }
    })
  }

  return pool
}

function pickRandom<T>(arr: T[], fallback: T): T {
  if (!arr.length) return fallback
  return arr[Math.floor(Math.random() * arr.length)]
}

function adaptMessage(message: string, topic: string): string {
  // Light adaptation: replace obvious category words with topic context
  // This keeps real phrasing while making it relevant
  return message
}

export function generateConversation(
  topic: string,
  conversations: Conversation[],
  length: 'short' | 'medium' | 'long' = 'medium'
): Message[] {
  if (conversations.length === 0) return []

  const pool = buildMessagePool(conversations, topic)

  const targetLength = length === 'short' ? 6 : length === 'long' ? 16 : 10

  const messages: Message[] = []

  // Opening: buyer starts
  const opener = pickRandom(pool.buyerOpeners, `Hi, I need help with ${topic}. Are you available?`)
  messages.push({ role: 'buyer', content: adaptMessage(opener, topic) })

  // Seller first response
  const sellerResponse = pickRandom(pool.sellerResponses, `Hello! Yes, I can help you with that. Could you share more details?`)
  messages.push({ role: 'seller', content: adaptMessage(sellerResponse, topic) })

  // Middle: alternating follow-ups and details
  const middleCount = targetLength - 4 // Reserve 4 for open/close
  for (let i = 0; i < middleCount; i++) {
    if (i % 2 === 0) {
      const followup = pickRandom(pool.buyerFollowups, `Sure, here's what I need...`)
      messages.push({ role: 'buyer', content: adaptMessage(followup, topic) })
    } else {
      const detail = pickRandom(pool.sellerDetails, `I understand. I can complete this within the timeline.`)
      messages.push({ role: 'seller', content: adaptMessage(detail, topic) })
    }
  }

  // Closing
  const buyerClose = pickRandom(pool.buyerClosings, `Great, that sounds perfect. Please go ahead!`)
  messages.push({ role: 'buyer', content: adaptMessage(buyerClose, topic) })

  const sellerClose = pickRandom(pool.sellerClosings, `Thank you for the order! I'll get started right away and keep you updated.`)
  messages.push({ role: 'seller', content: adaptMessage(sellerClose, topic) })

  return messages
}

export function findSimilarConversations(topic: string, conversations: Conversation[]): string[] {
  const topicWords = topic.toLowerCase().split(/\s+/)
  return conversations
    .map(conv => {
      const text = (conv.raw_text + conv.title).toLowerCase()
      const score = topicWords.filter(w => text.includes(w)).length
      return { id: conv.id, score }
    })
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map(s => s.id)
}
