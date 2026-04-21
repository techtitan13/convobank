import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { extractMetadata, generateTitle } from '@/lib/parser'

export const runtime = 'nodejs'
export const maxDuration = 60

type Message = { role: 'buyer' | 'seller'; content: string }

// Free models with PDF support — fallback in order if one is busy
const MODELS = [
  'google/gemma-4-26b-a4b:free',        // newest free vision+PDF model, Apr 2026
  'qwen/qwen2.5-vl-32b-instruct:free',  // strong vision fallback
  'google/gemma-3-27b-it:free',         // text fallback
  'mistralai/mistral-small-3.1-24b-instruct:free', // last resort
]

const SYSTEM_PROMPT = `You are an expert at parsing conversation transcripts from freelance platforms like Fiverr or Upwork.
Extract the conversation and return ONLY a valid JSON array of messages:
[
  { "role": "buyer", "content": "message text" },
  { "role": "seller", "content": "message text" }
]
Rules:
- "buyer" = client/customer asking for services
- "seller" = freelancer/provider offering services
- Preserve original message content accurately
- Ignore timestamps, read receipts, file attachments, UI chrome
- Infer roles from context if not labelled
- Return ONLY the JSON array, no explanation, no markdown fences`

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
      temperature: 0.1,
      max_tokens: 4000,
    })
  })

  if (!res.ok) {
    const errText = await res.text()
    const isOverloaded = res.status === 503 || res.status === 429 || errText.includes('overloaded') || errText.includes('rate limit')
    // Try next model in the fallback list
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

async function extractConversation(fileBuffer: Buffer, isPdf: boolean, rawText?: string): Promise<Message[]> {
  let userContent: object[]

  if (isPdf) {
    const base64Data = fileBuffer.toString('base64')
    userContent = [
      {
        type: 'file',
        file: {
          filename: 'conversation.pdf',
          file_data: `data:application/pdf;base64,${base64Data}`
        }
      },
      { type: 'text', text: 'Parse this PDF conversation into structured buyer/seller messages.' }
    ]
  } else {
    userContent = [{ type: 'text', text: `Parse this conversation transcript:\n\n${rawText}` }]
  }

  const text = await callOpenRouter([
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: userContent }
  ])

  const clean = text.replace(/```json\n?|\n?```/g, '').trim()
  const messages: Message[] = JSON.parse(clean)
  if (!Array.isArray(messages)) throw new Error('Did not return a valid array')
  return messages
}

async function processSingleFile(file: File): Promise<{ success: boolean; title?: string; error?: string }> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

    let messages: Message[]
    let rawText: string

    if (isPdf) {
      messages = await extractConversation(buffer, true)
      rawText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    } else {
      rawText = buffer.toString('utf-8')
      messages = await extractConversation(buffer, false, rawText)
    }

    if (messages.length === 0) return { success: false, error: 'No messages extracted' }

    const { category, tags } = extractMetadata(messages)
    const title = generateTitle(messages, file.name)

    const { error } = await supabase.from('conversations').insert({
      title, category, tags,
      pdf_filename: file.name,
      raw_text: rawText,
      messages,
      metadata: { messageCount: messages.length, parsedAt: new Date().toISOString() }
    })

    if (error) return { success: false, error: 'Failed to save to database' }
    return { success: true, title }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const manualText = formData.get('text') as string | null

    if (manualText && files.length === 0) {
      const messages = await extractConversation(Buffer.from(manualText), false, manualText)
      if (messages.length === 0) return NextResponse.json({ error: 'No messages could be extracted' }, { status: 400 })

      const { category, tags } = extractMetadata(messages)
      const title = generateTitle(messages, 'manual-entry')

      const { data, error } = await supabase.from('conversations')
        .insert({ title, category, tags, pdf_filename: 'manual-entry', raw_text: manualText, messages, metadata: { messageCount: messages.length, parsedAt: new Date().toISOString() } })
        .select().single()

      if (error) return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
      return NextResponse.json({ success: true, results: [{ success: true, title: data.title }] })
    }

    if (files.length === 0) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

    const results = []
    for (const file of files) {
      const result = await processSingleFile(file)
      results.push({ filename: file.name, ...result })
    }

    const succeeded = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length

    return NextResponse.json({ success: true, results, summary: { total: files.length, succeeded, failed } })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Internal server error' }, { status: 500 })
  }
}
