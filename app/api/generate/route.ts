import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { generateConversation, findSimilarConversations } from '@/lib/generator'

export async function POST(request: NextRequest) {
  try {
    const { topic, length = 'medium' } = await request.json()

    if (!topic || typeof topic !== 'string') {
      return NextResponse.json({ error: 'Topic is required' }, { status: 400 })
    }

    // Fetch all conversations for pattern matching
    const { data: conversations, error } = await supabase
      .from('conversations')
      .select('id, title, category, raw_text, messages')

    if (error) throw error

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ error: 'No stored conversations found. Please upload some first.' }, { status: 400 })
    }

    // Generate conversation using stored patterns
    const messages = generateConversation(topic, conversations as any, length)
    const sourceIds = findSimilarConversations(topic, conversations as any)

    if (messages.length === 0) {
      return NextResponse.json({ error: 'Failed to generate conversation' }, { status: 500 })
    }

    // Save generated conversation
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
    return NextResponse.json({ error: 'Generation failed' }, { status: 500 })
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
