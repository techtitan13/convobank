import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { extractMetadata, generateTitle } from '@/lib/parser'

export const runtime = 'nodejs'
export const maxDuration = 120 // scanned PDFs need more time

type Message = { role: 'buyer' | 'seller'; content: string }

const GROQ_TEXT_MODEL  = 'llama-3.3-70b-versatile'
const GROQ_VISION_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct'

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

// ── Text-based PDF ─────────────────────────────────────────────────────────
async function extractTextFromPdf(buffer: Buffer): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pdfParse = require('pdf-parse')
  const data = await pdfParse(buffer)
  return data.text?.trim() ?? ''
}

// ── Scanned PDF → images via pdfjs-dist ────────────────────────────────────
async function pdfPagesToImages(buffer: Buffer): Promise<string[]> {
  // pdfjs-dist needs a canvas implementation in Node
  const { createCanvas } = await import('canvas')
  const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string)

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) })
  const pdf = await loadingTask.promise
  const images: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2.0 }) // 2x for better OCR quality
    const canvas = createCanvas(viewport.width, viewport.height)
    const ctx = canvas.getContext('2d') as unknown as CanvasRenderingContext2D
    await page.render({ canvasContext: ctx, viewport }).promise
    // Return as base64 JPEG (smaller than PNG for API transfer)
    const base64 = canvas.toBuffer('image/jpeg', { quality: 0.9 }).toString('base64')
    images.push(base64)
  }

  return images
}

// ── Groq calls ─────────────────────────────────────────────────────────────
async function callGroqText(userText: string): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_TEXT_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Parse this conversation transcript:\n\n${userText}` }
      ],
      temperature: 0.1,
      max_tokens: 4000,
    })
  })
  if (!res.ok) throw new Error(`Groq error: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

async function callGroqVision(imageBase64List: string[]): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY
  if (!apiKey) throw new Error('GROQ_API_KEY is not set')

  // Send all pages in one message — Groq vision supports multiple images
  const imageContent = imageBase64List.map(b64 => ({
    type: 'image_url',
    image_url: { url: `data:image/jpeg;base64,${b64}` }
  }))

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: GROQ_VISION_MODEL,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        {
          role: 'user',
          content: [
            ...imageContent,
            { type: 'text', text: 'Parse the conversation in these PDF page images into structured buyer/seller messages.' }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 4000,
    })
  })
  if (!res.ok) throw new Error(`Groq vision error: ${await res.text()}`)
  const data = await res.json()
  return data.choices?.[0]?.message?.content ?? ''
}

// ── Parse response → Message[] ─────────────────────────────────────────────
function parseJsonResponse(text: string): Message[] {
  const clean = text.replace(/```json\n?|\n?```/g, '').trim()
  const messages: Message[] = JSON.parse(clean)
  if (!Array.isArray(messages)) throw new Error('Did not return a valid array')
  return messages
}

// ── Process one file ───────────────────────────────────────────────────────
async function processSingleFile(file: File): Promise<{ success: boolean; title?: string; error?: string }> {
  try {
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)
    const isPdf = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf'

    let messages: Message[]
    let rawText: string

    if (isPdf) {
      // First try text extraction (fast, free, works for normal PDFs)
      const extractedText = await extractTextFromPdf(buffer)

      if (extractedText.length > 100) {
        // Normal text-based PDF — send text to Groq
        rawText = extractedText
        const response = await callGroqText(rawText)
        messages = parseJsonResponse(response)
      } else {
        // Scanned/image PDF — render pages and use Groq vision
        console.log(`"${file.name}" appears to be a scanned PDF, using vision OCR...`)
        const images = await pdfPagesToImages(buffer)
        if (images.length === 0) throw new Error('Could not render PDF pages')
        const response = await callGroqVision(images)
        messages = parseJsonResponse(response)
        rawText = messages.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
      }
    } else {
      rawText = buffer.toString('utf-8')
      const response = await callGroqText(rawText)
      messages = parseJsonResponse(response)
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

// ── Route handler ──────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const files = formData.getAll('files') as File[]
    const manualText = formData.get('text') as string | null

    if (manualText && files.length === 0) {
      const response = await callGroqText(manualText)
      const messages = parseJsonResponse(response)
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
