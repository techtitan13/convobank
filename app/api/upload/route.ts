import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { extractMetadata, generateTitle } from '@/lib/parser'

export const runtime = 'nodejs'
export const maxDuration = 60

type Message = { role: 'buyer' | 'seller'; content: string }

const GEMINI_MODEL = 'gemini-3-flash-preview'

async function extractConversationWithGemini(
  fileBuffer: Buffer,
  isPdf: boolean,
  rawText?: string
): Promise<Message[]> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) throw new Error('GEMINI_API_KEY is not set in environment variables')

  const prompt = `You are an expert at parsing conversation transcripts from freelance platforms like Fiverr or Upwork.

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

  let parts: object[]

  if (isPdf) {
    const base64Data = fileBuffer.toString('base64')
    parts = [
      {
        inline_data: {
          mime_type: 'application/pdf',
          data: base64Data
        }
      },
      {
        text: prompt + '\n\nParse this PDF conversation into structured buyer/seller messages.'
      }
    ]
  } else {
    parts = [
      {
        text: prompt + `\n\nParse this conversation transcript:\n\n${rawText}`
      }
    ]
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4000,
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

async function processSingleFile(file: File): Promise<{ success: boolean; title?: string; error?: string }> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

    let messages: Message[]
    let rawText: string

    if (isPdf) {
      messages = await extractConversationWithGemini(buffer, true)
      rawText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    } else {
      rawText = buffer.toString('utf-8')
      messages = await extractConversationWithGemini(buffer, false, rawText)
    }

    if (messages.length === 0) return { success: false, error: 'No messages extracted' }

    const { category, tags } = extractMetadata(messages)
    const title = generateTitle(messages, file.name)

    const { error } = await supabase
      .from('conversations')
      .insert({
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

    // Handle manual text paste (single)
    if (manualText && files.length === 0) {
      const messages = await extractConversationWithGemini(Buffer.from(manualText), false, manualText)
      if (messages.length === 0) return NextResponse.json({ error: 'No messages could be extracted' }, { status: 400 })

      const { category, tags } = extractMetadata(messages)
      const title = generateTitle(messages, 'manual-entry')

      const { data, error } = await supabase
        .from('conversations')
        .insert({ title, category, tags, pdf_filename: 'manual-entry', raw_text: manualText, messages, metadata: { messageCount: messages.length, parsedAt: new Date().toISOString() } })
        .select().single()

      if (error) return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
      return NextResponse.json({ success: true, results: [{ success: true, title: data.title }] })
    }

    if (files.length === 0) return NextResponse.json({ error: 'No files provided' }, { status: 400 })

    // Process all files — sequentially to avoid rate limiting Gemini
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
