import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { extractMetadata, generateTitle } from '@/lib/parser'

export const runtime = 'nodejs'
export const maxDuration = 60

type Message = { role: 'buyer' | 'seller'; content: string }

const GEMINI_MODEL = 'gemini-2.5-flash'

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

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const manualText = formData.get('text') as string | null

    let messages: Message[] = []
    let rawText = ''
    let filename = ''

    if (file) {
      filename = file.name
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)
      const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

      if (isPdf) {
        messages = await extractConversationWithGemini(buffer, true)
        rawText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
      } else {
        rawText = buffer.toString('utf-8')
        messages = await extractConversationWithGemini(buffer, false, rawText)
      }
    } else if (manualText) {
      rawText = manualText
      filename = 'manual-entry'
      messages = await extractConversationWithGemini(Buffer.from(rawText), false, rawText)
    } else {
      return NextResponse.json({ error: 'No file or text provided' }, { status: 400 })
    }

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages could be extracted from the content' }, { status: 400 })
    }

    const { category, tags } = extractMetadata(messages)
    const title = generateTitle(messages, filename)

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        title,
        category,
        tags,
        pdf_filename: filename,
        raw_text: rawText,
        messages,
        metadata: { messageCount: messages.length, parsedAt: new Date().toISOString() }
      })
      .select()
      .single()

    if (error) {
      console.error('Supabase error:', error)
      return NextResponse.json({ error: 'Failed to save conversation' }, { status: 500 })
    }

    return NextResponse.json({ success: true, conversation: data })
  } catch (err) {
    console.error('Upload error:', err)
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
