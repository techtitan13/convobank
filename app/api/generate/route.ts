import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

type Message = { role: 'buyer' | 'seller'; content: string }
type Conversation = { id: string; title: string; category: string; messages: Message[] }

const GEMINI_MODEL = 'gemini-3-flash-preview'

async function generateWithGemini(
  topic: string,
  length: 'short' | 'medium' | 'long',
  referenceConversations: Conversation[]
): Promise<Message[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables')

  const targetLength = length === 'short' ? 6 : length === 'long' ? 16 : 10

  const examples = referenceConversations.slice(0, 5).map(conv => {
    const sample = (conv.messages || []).slice(0, 6)
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n')
    return `[From "${conv.title}" — ${conv.category}]\n${sample}`
  }).join('\n\n---\n\n')

  const prompt = `You are an expert at writing realistic freelance platform conversations between buyers and sellers on Fiverr/Upwork.

${examples ? `Here are example conversations to match in style and tone:\n\n${examples}\n\n---\n\n` : ''}Generate a realistic ${targetLength}-message conversation about this topic/service: "${topic}"

The conversation should:
- Match the communication style, tone, and vocabulary from the examples above
- Cover natural negotiation, requirements, pricing, and agreement
- Sound like real humans, not scripts
- Start with the buyer, then alternate buyer/seller

Return ONLY a valid JSON array of exactly ${targetLength} messages:
[
  { "role": "buyer", "content": "..." },
  { "role": "seller", "content": "..." }
]

Return ONLY the JSON array, no explanation, no markdown fences.`

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.8,
          maxOutputTokens: 3000,
        }
      })
    }
  )

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini API error: ${errText}`)
  }

  const data = await response.json()
  const text: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!text) throw new Error('Empty response from Gemini')

  const clean = text.replace(/```json\n?|\n?```/g, '').trim()
  const messages: Message[] = JSON.parse(clean)
  if (!Array.isArray(messages)) throw new Error('Gemini did not return a valid array')
  return messages
}

export async function POST(request: NextRequest) {
  try {
    const { topic, length = 'medium' } = await request.json()

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, title, category, messages')
      .order('created_at', { ascending: false })
      .limit(20)

    if (error) throw error

    // Rank by relevance to topic
    const topicWords = topic.toLowerCase().split(/\s+/)
    const sorted = (conversations || [])
      .map((conv: Conversation) => {
        const text = (conv.title + ' ' + (conv.messages || []).map(m => m.content).join(' ')).toLowerCase()
        const score = topicWords.filter(w => text.includes(w)).length
        return { conv, score }
      })
      .sort((a, b) => b.score - a.score)
      .map(s => s.conv)

    const messages = await generateWithGemini(topic, length, sorted)
    const sourceIds = sorted.slice(0, 5).map(c => c.id)

    const { data: saved, error: saveError } = await supabase
      .from('generated_conversations')
      .insert({
        title: `[Generated] ${topic.slice(0, 60)}`,
        topic,
        messages,
        source_conversation_ids: sourceIds,
      })
      .select()
      .single()

    if (saveError) throw saveError

    return NextResponse.json({ success: true, conversation: saved })
  } catch (err) {
    console.error('Generate error:', err)
    const message = err instanceof Error ? err.message : 'Generation failed'
    return NextResponse.json({ error: message }, { status: 500 })
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
