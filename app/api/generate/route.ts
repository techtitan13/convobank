import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

type Message = { role: 'buyer' | 'seller'; content: string }
type Conversation = { id: string; title: string; category: string; messages: Message[] }

const MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-4-26b-a4b-it:free',
  'mistralai/mistral-small-3.1-24b-instruct:free',
  'google/gemma-3-27b-it:free',
]

async function callOpenRouter(messages: object[], modelIndex = 0): Promise<string> {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')

  const model = MODELS[modelIndex]
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://convobank.app',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.8,
      max_tokens: 3000,
    })
  })

  if (!res.ok) {
    const errText = await res.text()
    const isOverloaded = res.status === 503 || res.status === 429 || errText.includes('overloaded') || errText.includes('rate limit')
    if (isOverloaded && modelIndex < MODELS.length - 1) {
      console.log(`Model ${model} busy, trying fallback...`)
      return callOpenRouter(messages, modelIndex + 1)
    }
    throw new Error(`OpenRouter error: ${errText}`)
  }

  const data = await res.json()
  const text: string = data.choices?.[0]?.message?.content ?? ''
  if (!text) throw new Error('Empty response from OpenRouter')
  return text
}

async function generateConversation(topic: string, length: 'short' | 'medium' | 'long', refs: Conversation[]): Promise<Message[]> {
  const targetLength = length === 'short' ? 6 : length === 'long' ? 16 : 10

  const examples = refs.slice(0, 5).map(conv => {
    const sample = (conv.messages || []).slice(0, 6).map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n')
    return `[From "${conv.title}" — ${conv.category}]\n${sample}`
  }).join('\n\n---\n\n')

  const systemPrompt = `You are an expert at writing realistic freelance platform conversations between buyers and sellers on Fiverr/Upwork.
${examples ? `\nHere are example conversations to match in style and tone:\n\n${examples}\n` : ''}
Generate a realistic ${targetLength}-message conversation about the given topic.
The conversation should cover natural negotiation, requirements, pricing, and agreement.
Start with the buyer, then alternate buyer/seller.
Return ONLY a valid JSON array of exactly ${targetLength} messages:
[
  { "role": "buyer", "content": "..." },
  { "role": "seller", "content": "..." }
]
Return ONLY the JSON array, no explanation, no markdown fences.`

  const text = await callOpenRouter([
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Generate a conversation about: "${topic}"` }
  ])

  const clean = text.replace(/```json\n?|\n?```/g, '').trim()
  const messages: Message[] = JSON.parse(clean)
  if (!Array.isArray(messages)) throw new Error('Did not return a valid array')
  return messages
}

export async function POST(request: NextRequest) {
  try {
    const { topic, length = 'medium' } = await request.json()
    if (!topic || typeof topic !== 'string') return NextResponse.json({ error: 'Topic is required' }, { status: 400 })

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, title, category, messages')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    const topicWords = topic.toLowerCase().split(/\s+/)
    const sorted = (conversations || [])
      .map((conv: Conversation) => {
        const text = (conv.title + ' ' + (conv.messages || []).map(m => m.content).join(' ')).toLowerCase()
        const score = topicWords.filter(w => text.includes(w)).length
        return { conv, score }
      })
      .sort((a: { score: number }, b: { score: number }) => b.score - a.score)
      .map((s: { conv: Conversation }) => s.conv)

    const messages = await generateConversation(topic, length, sorted)
    const sourceIds = sorted.slice(0, 5).map((c: Conversation) => c.id)

    const { data: saved, error: saveError } = await supabase
      .from('generated_conversations')
      .insert({ title: `[Generated] ${topic.slice(0, 60)}`, topic, messages, source_conversation_ids: sourceIds })
      .select().single()

    if (saveError) throw saveError
    return NextResponse.json({ success: true, conversation: saved })
  } catch (err) {
    console.error('Generate error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Generation failed' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '20')
  const offset = (page - 1) * limit

  const { data, error, count } = await supabase
    .from('generated_conversations')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: 'Fetch failed' }, { status: 500 })
  return NextResponse.json({ conversations: data, total: count })
}
