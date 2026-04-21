import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export type Message = {
  role: 'buyer' | 'seller'
  content: string
  timestamp?: string
}

export type Conversation = {
  id: string
  title: string
  category: string
  tags: string[]
  pdf_filename?: string
  raw_text: string
  messages: Message[]
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export type GeneratedConversation = {
  id: string
  title: string
  topic: string
  messages: Message[]
  source_conversation_ids: string[]
  created_at: string
}
