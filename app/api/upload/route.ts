import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { parseConversationText, extractMetadata, generateTitle } from '@/lib/parser'

export const runtime = 'nodejs'
export const maxDuration = 30

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File
    const manualText = formData.get('text') as string | null

    let rawText = ''
    let filename = ''

    if (file) {
      filename = file.name
      // Read file as ArrayBuffer then convert to text
      const arrayBuffer = await file.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Try to parse as PDF using pdf-parse
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse')
        const pdfData = await pdfParse(buffer)
        rawText = pdfData.text
      } catch {
        // Fallback: treat as plain text
        rawText = buffer.toString('utf-8')
      }
    } else if (manualText) {
      rawText = manualText
      filename = 'manual-entry'
    } else {
      return NextResponse.json({ error: 'No file or text provided' }, { status: 400 })
    }

    if (!rawText.trim()) {
      return NextResponse.json({ error: 'Could not extract text from file' }, { status: 400 })
    }

    // Parse messages
    const messages = parseConversationText(rawText)

    if (messages.length === 0) {
      return NextResponse.json({ error: 'No messages could be parsed from the text' }, { status: 400 })
    }

    // Extract metadata
    const { category, tags } = extractMetadata(messages)
    const title = generateTitle(messages, filename)

    // Store in Supabase
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
