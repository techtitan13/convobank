-- Fiverr Conversation Platform - Supabase Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Conversations table
create table if not exists conversations (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  category text default 'general',
  tags text[] default '{}',
  pdf_filename text,
  raw_text text not null,
  messages jsonb not null default '[]',
  metadata jsonb default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Generated conversations table
create table if not exists generated_conversations (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  topic text not null,
  messages jsonb not null default '[]',
  source_conversation_ids uuid[],
  created_at timestamptz default now()
);

-- Enable Row Level Security (RLS) - optional, adjust for auth
alter table conversations enable row level security;
alter table generated_conversations enable row level security;

-- Allow all for now (public access - lock down later with auth)
create policy "Allow all" on conversations for all using (true) with check (true);
create policy "Allow all" on generated_conversations for all using (true) with check (true);

-- Indexes for fast searching
create index if not exists idx_conversations_category on conversations(category);
create index if not exists idx_conversations_created_at on conversations(created_at desc);
create index if not exists idx_generated_created_at on generated_conversations(created_at desc);
create index if not exists idx_conversations_title on conversations using gin(to_tsvector('english', title));
create index if not exists idx_conversations_raw_text on conversations using gin(to_tsvector('english', raw_text));

-- Function to update updated_at
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger conversations_updated_at
  before update on conversations
  for each row execute function update_updated_at();
