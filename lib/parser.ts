import type { Message } from './supabase'

/**
 * Parse raw PDF text into structured messages.
 * Handles common Fiverr conversation export formats.
 */
export function parseConversationText(rawText: string): Message[] {
  const messages: Message[] = []
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean)

  // Patterns for Fiverr-like conversation formats
  const buyerPatterns = [
    /^(buyer|client|customer|user)\s*[:\-]/i,
    /^\[buyer\]/i,
    /^from:\s*buyer/i,
  ]
  const sellerPatterns = [
    /^(seller|freelancer|provider|me|i)\s*[:\-]/i,
    /^\[seller\]/i,
    /^from:\s*seller/i,
  ]

  // Try to detect labeled format first
  let hasLabels = false
  for (const line of lines) {
    if (buyerPatterns.some(p => p.test(line)) || sellerPatterns.some(p => p.test(line))) {
      hasLabels = true
      break
    }
  }

  if (hasLabels) {
    // Parse labeled format
    let currentRole: 'buyer' | 'seller' | null = null
    let currentContent: string[] = []

    const flush = () => {
      if (currentRole && currentContent.length > 0) {
        messages.push({ role: currentRole, content: currentContent.join(' ').trim() })
        currentContent = []
      }
    }

    for (const line of lines) {
      if (buyerPatterns.some(p => p.test(line))) {
        flush()
        currentRole = 'buyer'
        const content = line.replace(/^.*?[:\-]\s*/, '').trim()
        if (content) currentContent.push(content)
      } else if (sellerPatterns.some(p => p.test(line))) {
        flush()
        currentRole = 'seller'
        const content = line.replace(/^.*?[:\-]\s*/, '').trim()
        if (content) currentContent.push(content)
      } else {
        currentContent.push(line)
      }
    }
    flush()
  } else {
    // Fallback: alternate lines as buyer/seller (common in simple exports)
    let role: 'buyer' | 'seller' = 'buyer'
    for (const line of lines) {
      if (line.length > 5) {
        messages.push({ role, content: line })
        role = role === 'buyer' ? 'seller' : 'buyer'
      }
    }
  }

  return messages
}

/**
 * Extract category and tags from conversation content
 */
export function extractMetadata(messages: Message[]): { category: string; tags: string[] } {
  const allText = messages.map(m => m.content).join(' ').toLowerCase()

  const categories: Record<string, string[]> = {
    'web development': ['website', 'wordpress', 'react', 'html', 'css', 'javascript', 'php', 'web', 'landing page'],
    'graphic design': ['logo', 'design', 'banner', 'flyer', 'photoshop', 'illustrator', 'branding', 'graphics'],
    'writing': ['article', 'blog', 'content', 'copywriting', 'seo', 'writing', 'essay', 'proofreading'],
    'video': ['video', 'animation', 'editing', 'youtube', 'thumbnail', 'intro', 'motion'],
    'digital marketing': ['marketing', 'social media', 'instagram', 'facebook', 'ads', 'seo', 'email'],
    'programming': ['python', 'java', 'script', 'api', 'bug', 'code', 'software', 'app', 'mobile'],
    'translation': ['translate', 'translation', 'language', 'spanish', 'french', 'arabic'],
    'music': ['music', 'audio', 'voiceover', 'podcast', 'sound', 'mixing', 'lyrics'],
  }

  let detectedCategory = 'general'
  let maxMatches = 0

  for (const [cat, keywords] of Object.entries(categories)) {
    const matches = keywords.filter(kw => allText.includes(kw)).length
    if (matches > maxMatches) {
      maxMatches = matches
      detectedCategory = cat
    }
  }

  // Extract tags
  const tagKeywords = ['urgent', 'revision', 'deadline', 'budget', 'premium', 'rush', 'bulk', 'long-term', 'recurring']
  const tags = tagKeywords.filter(tag => allText.includes(tag))

  return { category: detectedCategory, tags }
}

/**
 * Generate a title from the first buyer message
 */
export function generateTitle(messages: Message[], filename?: string): string {
  const firstBuyer = messages.find(m => m.role === 'buyer')
  if (firstBuyer) {
    const words = firstBuyer.content.split(' ').slice(0, 8).join(' ')
    return words.length > 5 ? words + '...' : firstBuyer.content
  }
  return filename ? filename.replace('.pdf', '') : 'Conversation ' + new Date().toLocaleDateString()
}
