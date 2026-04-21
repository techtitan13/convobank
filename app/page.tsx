'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

type Tab = 'dashboard' | 'upload' | 'conversations' | 'generate' | 'generated'
type Message = { role: 'buyer' | 'seller'; content: string }
type Conversation = {
  id: string; title: string; category: string; tags: string[]
  pdf_filename?: string; created_at: string; metadata?: { messageCount?: number }
}
type GeneratedConvo = {
  id: string; title: string; topic: string; messages: Message[]; created_at: string
}

const CATEGORIES = ['all','web development','graphic design','writing','video','digital marketing','programming','translation','music','general']
const catColor: Record<string,string> = {
  'web development':'#7c6dfa','graphic design':'#fa6d8c','writing':'#f5c842',
  'video':'#fa9b3d','digital marketing':'#5dda7e','programming':'#60cdff',
  'translation':'#c084fc','music':'#fb7185','general':'#8888a8',
}

const IcoGrid = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
const IcoUp = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
const IcoBook = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 19.5A2.5 2.5 0 016.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z"/></svg>
const IcoBolt = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
const IcoBox = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>
const IcoSearch = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
const IcoTrash = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
const IcoDl = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
const IcoX = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>

function MsgBubble({ msg }: { msg: Message }) {
  const isBuyer = msg.role === 'buyer'
  return (
    <div style={{ display:'flex', flexDirection:'column', alignItems: isBuyer ? 'flex-start' : 'flex-end', marginBottom:12 }}>
      <span style={{ fontSize:10, fontFamily:'DM Mono,monospace', color:'var(--text-muted)', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.08em' }}>
        {isBuyer ? '👤 Buyer' : '💼 Seller'}
      </span>
      <div className={isBuyer ? 'message-buyer' : 'message-seller'} style={{ padding:'10px 14px', maxWidth:'80%', fontSize:13.5, lineHeight:1.6 }}>
        {msg.content}
      </div>
    </div>
  )
}

function Modal({ id, onClose }: { id: string; onClose: () => void }) {
  const [data, setData] = useState<any>(null)
  useEffect(() => {
    fetch(`/api/conversations/${id}`).then(r=>r.json()).then(d=>setData(d.conversation))
  }, [id])
  const exportTxt = () => {
    if (!data) return
    const t = data.messages.map((m: Message) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t],{type:'text/plain'})); a.download = `${data.title}.txt`; a.click()
  }
  return (
    <div onClick={onClose} style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.75)', backdropFilter:'blur(4px)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)', border:'1px solid var(--surface-border)', borderRadius:16, width:'100%', maxWidth:660, maxHeight:'85vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--surface-border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <h3 style={{ fontSize:15, fontWeight:700, margin:'0 0 2px' }}>{data?.title || '...'}</h3>
            {data && <span style={{ fontSize:11, color:'var(--text-muted)' }}>{data.messages.length} messages · {new Date(data.created_at).toLocaleDateString()}</span>}
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button className="btn-ghost" onClick={exportTxt} style={{ padding:'6px 12px' }}><IcoDl /> Export</button>
            <button className="btn-ghost" onClick={onClose} style={{ padding:'6px 10px' }}><IcoX /></button>
          </div>
        </div>
        <div style={{ padding:20, overflowY:'auto', flex:1 }}>
          {!data ? [...Array(5)].map((_,i)=><div key={i} className="shimmer" style={{ height:55, borderRadius:12, marginBottom:10 }}/>) :
            data.messages.map((m: Message, i: number) => <MsgBubble key={i} msg={m} />)}
        </div>
      </div>
    </div>
  )
}

function UploadTab({ onSuccess }: { onSuccess: () => void }) {
  const [drag, setDrag] = useState(false)
  const [file, setFile] = useState<File|null>(null)
  const [text, setText] = useState('')
  const [loading, setLoading] = useState(false)
  const [res, setRes] = useState<any>(null)
  const ref = useRef<HTMLInputElement>(null)

  const upload = async () => {
    if (!file && !text.trim()) return
    setLoading(true); setRes(null)
    const fd = new FormData()
    if (file) fd.append('file', file); else fd.append('text', text)
    try {
      const r = await fetch('/api/upload', { method:'POST', body:fd })
      const d = await r.json()
      if (d.success) { setRes({ ok: true, title: d.conversation.title }); setFile(null); setText(''); onSuccess() }
      else setRes({ ok: false, msg: d.error })
    } catch { setRes({ ok: false, msg: 'Network error' }) }
    setLoading(false)
  }

  return (
    <div style={{ maxWidth:600, margin:'0 auto' }}>
      <h2 style={{ fontSize:24, fontWeight:800, margin:'0 0 6px' }}>Upload Conversation</h2>
      <p style={{ color:'var(--text-secondary)', fontSize:14, margin:'0 0 28px' }}>Upload a PDF or paste raw text. Gemini AI reads and understands the conversation — no rigid format required.</p>
      <div className={`upload-zone${drag?' dragging':''}`} onClick={()=>ref.current?.click()}
        onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)}
        onDrop={e=>{e.preventDefault();setDrag(false);const f=e.dataTransfer.files[0];if(f)setFile(f)}}>
        <input ref={ref} type="file" accept=".pdf,.txt" style={{ display:'none' }} onChange={e=>{const f=e.target.files?.[0];if(f)setFile(f)}}/>
        <div style={{ fontSize:36, marginBottom:10 }}>📄</div>
        {file ? <><p style={{ color:'var(--accent)', fontWeight:600, margin:'0 0 4px' }}>{file.name}</p><p style={{ color:'var(--text-muted)', fontSize:12, margin:0 }}>{(file.size/1024).toFixed(1)} KB</p></>
          : <><p style={{ color:'var(--text-secondary)', fontWeight:500, margin:'0 0 4px' }}>Drop PDF here or click to browse</p><p style={{ color:'var(--text-muted)', fontSize:12, margin:0 }}>.pdf or .txt</p></>}
      </div>
      <div style={{ display:'flex', alignItems:'center', gap:12, margin:'18px 0' }}>
        <div style={{ flex:1, height:1, background:'var(--surface-border)' }}/>
        <span style={{ color:'var(--text-muted)', fontSize:12, fontFamily:'DM Mono,monospace' }}>or paste text</span>
        <div style={{ flex:1, height:1, background:'var(--surface-border)' }}/>
      </div>
      <textarea className="input" rows={7} placeholder={"Paste conversation here...\n\nBest format:\nBuyer: Hi, I need a logo design\nSeller: Hello! I can help with that..."} value={text} onChange={e=>setText(e.target.value)} style={{ resize:'vertical', marginBottom:14 }}/>
      {res && <div style={{ padding:'11px 15px', borderRadius:8, marginBottom:14, background: res.ok?'rgba(93,218,126,0.1)':'rgba(250,109,109,0.1)', border:`1px solid ${res.ok?'rgba(93,218,126,0.3)':'rgba(250,109,109,0.3)'}`, color: res.ok?'var(--success)':'var(--danger)', fontSize:13 }}>{res.ok ? `✓ Saved: "${res.title}"` : `✗ ${res.msg}`}</div>}
      <button className="btn-primary" onClick={upload} disabled={loading||(!file&&!text.trim())} style={{ width:'100%', justifyContent:'center', padding:13 }}>
        {loading ? '🤖 Gemini is reading your PDF...' : 'Upload & Parse with AI'}
      </button>
      <div style={{ marginTop:20, padding:15, background:'var(--surface-raised)', borderRadius:8, border:'1px solid var(--surface-border)' }}>
        <p style={{ fontSize:12, color:'var(--text-secondary)', margin:'0 0 7px', fontWeight:600 }}>📌 Format tips</p>
        <ul style={{ margin:0, paddingLeft:18, fontSize:12, color:'var(--text-muted)', lineHeight:2 }}>
          <li>Label lines with <code style={{ color:'var(--accent)' }}>Buyer:</code> or <code style={{ color:'var(--success)' }}>Seller:</code></li>
          <li>One message per line works best</li>
          <li>Category (design, dev, writing…) is auto-detected</li>
          <li>Timestamps are optional and will be ignored</li>
        </ul>
      </div>
    </div>
  )
}

function ConversationsTab({ refreshKey }: { refreshKey: number }) {
  const [convos, setConvos] = useState<Conversation[]>([])
  const [search, setSearch] = useState('')
  const [cat, setCat] = useState('all')
  const [loading, setLoading] = useState(true)
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState<string|null>(null)

  const fetch_ = useCallback(async () => {
    setLoading(true)
    const p = new URLSearchParams({ search, category:cat, page:String(page), limit:'15' })
    const r = await fetch(`/api/conversations?${p}`)
    const d = await r.json()
    setConvos(d.conversations||[]); setTotal(d.total||0); setLoading(false)
  }, [search, cat, page, refreshKey])

  useEffect(() => { fetch_() }, [fetch_])
  useEffect(() => { setPage(1) }, [search, cat])

  const del = async (id: string) => {
    if (!confirm('Delete?')) return
    await fetch(`/api/conversations?id=${id}`, { method:'DELETE' })
    fetch_()
  }

  return (
    <div>
      <h2 style={{ fontSize:24, fontWeight:800, margin:'0 0 4px' }}>Conversation Library</h2>
      <p style={{ color:'var(--text-secondary)', fontSize:14, margin:'0 0 22px' }}>{total} stored</p>
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        <div style={{ position:'relative', flex:1, minWidth:180 }}>
          <span style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'var(--text-muted)' }}><IcoSearch/></span>
          <input className="input" placeholder="Search..." value={search} onChange={e=>setSearch(e.target.value)} style={{ paddingLeft:34 }}/>
        </div>
        <select className="input" value={cat} onChange={e=>setCat(e.target.value)} style={{ width:'auto', minWidth:150 }}>
          {CATEGORIES.map(c=><option key={c} value={c}>{c==='all'?'All Categories':c}</option>)}
        </select>
      </div>
      {loading ? [...Array(6)].map((_,i)=><div key={i} className="shimmer" style={{ height:68, borderRadius:10, marginBottom:6 }}/>) :
        convos.length===0 ? <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}><div style={{ fontSize:40, marginBottom:10 }}>📭</div><p>No conversations. Upload PDFs to get started.</p></div> :
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {convos.map(c=>(
            <div key={c.id} className="card" style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', gap:10, cursor:'pointer' }} onClick={()=>setSelectedId(c.id)}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:14, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', marginBottom:4 }}>{c.title}</div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <span className="tag" style={{ background:`${catColor[c.category]||'#8888a8'}22`, color:catColor[c.category]||'#8888a8', border:`1px solid ${catColor[c.category]||'#8888a8'}44` }}>{c.category}</span>
                  {c.metadata?.messageCount && <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'DM Mono,monospace' }}>{c.metadata.messageCount} msgs</span>}
                  <span style={{ fontSize:11, color:'var(--text-muted)' }}>{new Date(c.created_at).toLocaleDateString()}</span>
                </div>
              </div>
              <button className="btn-ghost" onClick={e=>{e.stopPropagation();del(c.id)}} style={{ padding:'5px 10px', color:'var(--danger)', borderColor:'transparent' }}><IcoTrash/></button>
            </div>
          ))}
        </div>}
      {total>15 && <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:18 }}>
        <button className="btn-ghost" onClick={()=>setPage(p=>Math.max(1,p-1))} disabled={page===1} style={{ padding:'6px 14px' }}>← Prev</button>
        <span style={{ padding:'6px 14px', fontSize:13, color:'var(--text-muted)' }}>Page {page} of {Math.ceil(total/15)}</span>
        <button className="btn-ghost" onClick={()=>setPage(p=>p+1)} disabled={page>=Math.ceil(total/15)} style={{ padding:'6px 14px' }}>Next →</button>
      </div>}
      {selectedId && <Modal id={selectedId} onClose={()=>setSelectedId(null)}/>}
    </div>
  )
}

function GenerateTab({ onDone }: { onDone: () => void }) {
  const [topic, setTopic] = useState('')
  const [len, setLen] = useState<'short'|'medium'|'long'>('medium')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<any>(null)
  const [err, setErr] = useState('')
  const examples = ['Logo design for a coffee shop','WordPress site with 5 pages','Product description copywriting','YouTube video editing','Social media marketing package']

  const generate = async () => {
    if (!topic.trim()) return
    setLoading(true); setErr(''); setResult(null)
    try {
      const r = await fetch('/api/generate', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ topic, length:len }) })
      const d = await r.json()
      if (d.success) { setResult(d.conversation); onDone() }
      else setErr(d.error||'Failed')
    } catch { setErr('Network error') }
    setLoading(false)
  }

  const exportTxt = () => {
    if (!result) return
    const t = result.messages.map((m: Message)=>`${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t],{type:'text/plain'})); a.download = `${topic.slice(0,30)}.txt`; a.click()
  }

  return (
    <div style={{ maxWidth:700, margin:'0 auto' }}>
      <h2 style={{ fontSize:24, fontWeight:800, margin:'0 0 6px' }}>Generate Conversation</h2>
      <p style={{ color:'var(--text-secondary)', fontSize:14, margin:'0 0 24px' }}>Gemini AI generates a realistic conversation inspired by your uploaded library — matching the tone, style, and vocabulary of your real conversations.</p>
      <div className="card" style={{ marginBottom:16 }}>
        <label style={{ display:'block', fontSize:13, fontWeight:600, color:'var(--text-secondary)', marginBottom:8 }}>Topic / Opening Message</label>
        <textarea className="input" rows={3} placeholder="e.g. I need a professional logo for my restaurant brand..." value={topic} onChange={e=>setTopic(e.target.value)} style={{ resize:'vertical', marginBottom:10 }}/>
        <div style={{ display:'flex', gap:7, flexWrap:'wrap', marginBottom:16 }}>
          {examples.map(ex=><button key={ex} className="btn-ghost" onClick={()=>setTopic(ex)} style={{ padding:'4px 11px', fontSize:12 }}>{ex}</button>)}
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          <span style={{ fontSize:13, color:'var(--text-secondary)', fontWeight:600, whiteSpace:'nowrap' }}>Length:</span>
          {(['short','medium','long'] as const).map(l=>(
            <button key={l} onClick={()=>setLen(l)} style={{ padding:'6px 15px', borderRadius:8, border:'1px solid', borderColor:len===l?'var(--accent)':'var(--surface-border)', background:len===l?'var(--accent-glow)':'transparent', color:len===l?'var(--accent)':'var(--text-secondary)', fontSize:13, cursor:'pointer', textTransform:'capitalize', fontFamily:'inherit' }}>
              {l} <span style={{ fontSize:11, opacity:0.65 }}>({l==='short'?'~6':l==='medium'?'~10':'~16'} msgs)</span>
            </button>
          ))}
        </div>
      </div>
      {err && <div style={{ padding:'11px 15px', borderRadius:8, marginBottom:14, background:'rgba(250,109,109,0.1)', border:'1px solid rgba(250,109,109,0.3)', color:'var(--danger)', fontSize:13 }}>✗ {err}</div>}
      <button className="btn-primary" onClick={generate} disabled={loading||!topic.trim()} style={{ width:'100%', justifyContent:'center', padding:13, marginBottom:24 }}>
        {loading ? '🤖 Gemini is writing your conversation...' : '⚡ Generate with AI'}
      </button>
      {result && (
        <div className="animate-fade-in">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
            <h3 style={{ margin:0, fontSize:15, fontWeight:700, color:'var(--accent)' }}>{result.topic}</h3>
            <button className="btn-ghost" onClick={exportTxt} style={{ padding:'6px 12px' }}><IcoDl /> Export .txt</button>
          </div>
          <div className="card" style={{ padding:20 }}>
            {result.messages.map((m: Message, i: number)=><MsgBubble key={i} msg={m}/>)}
          </div>
        </div>
      )}
    </div>
  )
}

function GeneratedTab({ refreshKey }: { refreshKey: number }) {
  const [convos, setConvos] = useState<GeneratedConvo[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState<string|null>(null)

  useEffect(() => {
    fetch('/api/generate').then(r=>r.json()).then(d=>{ setConvos(d.conversations||[]); setLoading(false) })
  }, [refreshKey])

  const exportTxt = (c: GeneratedConvo) => {
    const t = c.messages.map(m=>`${m.role.toUpperCase()}: ${m.content}`).join('\n\n')
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([t],{type:'text/plain'})); a.download = `${c.topic.slice(0,30)}.txt`; a.click()
  }

  return (
    <div>
      <h2 style={{ fontSize:24, fontWeight:800, margin:'0 0 4px' }}>Generated Conversations</h2>
      <p style={{ color:'var(--text-secondary)', fontSize:14, margin:'0 0 22px' }}>{convos.length} generated</p>
      {loading ? [...Array(4)].map((_,i)=><div key={i} className="shimmer" style={{ height:66, borderRadius:10, marginBottom:6 }}/>) :
        convos.length===0 ? <div style={{ textAlign:'center', padding:60, color:'var(--text-muted)' }}><div style={{ fontSize:40, marginBottom:10 }}>✨</div><p>No generated conversations yet. Head to Generate tab.</p></div> :
        convos.map(c=>(
          <div key={c.id} style={{ marginBottom:6 }}>
            <div className="card" style={{ padding:'12px 16px', cursor:'pointer' }} onClick={()=>setOpen(open===c.id?null:c.id)}>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:14, fontWeight:600, color:'var(--accent)', marginBottom:3 }}>{c.topic}</div>
                  <span style={{ fontSize:11, color:'var(--text-muted)', fontFamily:'DM Mono,monospace' }}>{c.messages.length} msgs · {new Date(c.created_at).toLocaleDateString()}</span>
                </div>
                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <button className="btn-ghost" onClick={e=>{e.stopPropagation();exportTxt(c)}} style={{ padding:'5px 9px' }}><IcoDl/></button>
                  <span style={{ color:'var(--text-muted)' }}>{open===c.id?'▲':'▼'}</span>
                </div>
              </div>
            </div>
            {open===c.id && <div className="animate-fade-in" style={{ padding:'14px 18px 18px', background:'var(--surface-raised)', border:'1px solid var(--surface-border)', borderTop:'none', borderRadius:'0 0 12px 12px', marginTop:-6 }}>
              {c.messages.map((m,i)=><MsgBubble key={i} msg={m}/>)}
            </div>}
          </div>
        ))}
    </div>
  )
}

function DashboardTab({ onNav }: { onNav: (t:Tab)=>void }) {
  const [stats, setStats] = useState({ total:0, generated:0, cats:0 })
  const [recent, setRecent] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([fetch('/api/conversations?limit=5').then(r=>r.json()), fetch('/api/generate?limit=1').then(r=>r.json())])
      .then(([cd, gd]) => {
        const cats = new Set((cd.conversations||[]).map((c: Conversation)=>c.category)).size
        setStats({ total: cd.total||0, generated: gd.total||0, cats })
        setRecent(cd.conversations||[])
        setLoading(false)
      })
  }, [])

  const cards = [
    { label:'Stored Conversations', val:stats.total, icon:'💬', color:'var(--accent)' },
    { label:'Generated', val:stats.generated, icon:'⚡', color:'var(--warning)' },
    { label:'Categories', val:stats.cats, icon:'🗂️', color:'var(--success)' },
    { label:'Est. Storage', val:`~${(stats.total*8).toFixed(0)}KB`, icon:'💾', color:'var(--accent-2)' },
  ]

  return (
    <div>
      <h2 style={{ fontSize:24, fontWeight:800, margin:'0 0 4px' }}>Dashboard</h2>
      <p style={{ color:'var(--text-secondary)', fontSize:14, margin:'0 0 28px' }}>Your Fiverr conversation bank overview</p>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:28 }}>
        {cards.map(c=>(
          <div key={c.label} className="stat-card">
            <div style={{ fontSize:22, marginBottom:6 }}>{c.icon}</div>
            <div style={{ fontSize:26, fontWeight:800, fontFamily:'Syne,sans-serif', color:c.color }}>{loading?'—':c.val}</div>
            <div style={{ fontSize:12, color:'var(--text-muted)', marginTop:3 }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:28 }}>
        <button onClick={()=>onNav('upload')} style={{ background:'var(--accent-glow)', border:'1px solid var(--accent)', borderRadius:12, padding:18, textAlign:'left', cursor:'pointer', color:'var(--text-primary)' }}>
          <div style={{ fontSize:22, marginBottom:8 }}>📤</div>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, marginBottom:3 }}>Upload PDF</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)' }}>Add a real conversation</div>
        </button>
        <button onClick={()=>onNav('generate')} style={{ background:'rgba(245,200,66,0.08)', border:'1px solid rgba(245,200,66,0.3)', borderRadius:12, padding:18, textAlign:'left', cursor:'pointer', color:'var(--text-primary)' }}>
          <div style={{ fontSize:22, marginBottom:8 }}>⚡</div>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:700, marginBottom:3 }}>Generate</div>
          <div style={{ fontSize:12, color:'var(--text-secondary)' }}>Create from stored patterns</div>
        </button>
      </div>
      <h3 style={{ fontSize:15, fontWeight:700, marginBottom:10 }}>Recent Uploads</h3>
      {loading ? [...Array(3)].map((_,i)=><div key={i} className="shimmer" style={{ height:52, borderRadius:8, marginBottom:6 }}/>) :
        recent.length===0 ? <div style={{ textAlign:'center', padding:36, color:'var(--text-muted)', background:'var(--surface)', borderRadius:12, border:'1px solid var(--surface-border)' }}>No conversations yet — upload your first PDF!</div> :
        recent.map(c=>(
          <div key={c.id} className="card" style={{ padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
            <span style={{ fontSize:13, fontWeight:500 }}>{c.title}</span>
            <span className="tag" style={{ background:`${catColor[c.category]||'#8888a8'}22`, color:catColor[c.category]||'#8888a8' }}>{c.category}</span>
          </div>
        ))}
    </div>
  )
}

export default function App() {
  const [tab, setTab] = useState<Tab>('dashboard')
  const [rk, setRk] = useState(0)
  const bump = () => setRk(k=>k+1)

  const nav = [
    { id:'dashboard' as Tab, label:'Dashboard', Icon:IcoGrid },
    { id:'upload' as Tab, label:'Upload', Icon:IcoUp },
    { id:'conversations' as Tab, label:'Library', Icon:IcoBook },
    { id:'generate' as Tab, label:'Generate', Icon:IcoBolt },
    { id:'generated' as Tab, label:'Generated', Icon:IcoBox },
  ]

  return (
    <div style={{ display:'flex', minHeight:'100vh' }}>
      <aside style={{ width:210, flexShrink:0, background:'var(--surface)', borderRight:'1px solid var(--surface-border)', padding:'22px 10px', display:'flex', flexDirection:'column' }}>
        <div style={{ padding:'0 8px 24px' }}>
          <div style={{ fontFamily:'Syne,sans-serif', fontWeight:800, fontSize:17 }}><span style={{ color:'var(--accent)' }}>Convo</span>Bank</div>
          <div style={{ fontSize:10, color:'var(--text-muted)', fontFamily:'DM Mono,monospace', marginTop:2 }}>Fiverr · Conversation OS</div>
        </div>
        <nav style={{ flex:1, display:'flex', flexDirection:'column', gap:2 }}>
          {nav.map(n=>(
            <button key={n.id} className={`nav-item${tab===n.id?' active':''}`} onClick={()=>setTab(n.id)} style={{ width:'100%', background:'none', border:'none', textAlign:'left', font:'inherit' }}>
              <n.Icon/>{n.label}
            </button>
          ))}
        </nav>
        <div style={{ padding:'14px 8px 0', borderTop:'1px solid var(--surface-border)' }}>
          <p style={{ fontSize:11, color:'var(--text-muted)', margin:0, lineHeight:1.7 }}>Pattern-based generation.<br/>No AI used for conversations.</p>
        </div>
      </aside>
      <main style={{ flex:1, padding:32, overflowY:'auto', background:'var(--bg)', position:'relative' }}>
        <div style={{ position:'fixed', inset:0, backgroundImage:'radial-gradient(circle at 1px 1px,var(--surface-border) 1px,transparent 0)', backgroundSize:'40px 40px', opacity:0.35, pointerEvents:'none', zIndex:0 }}/>
        <div style={{ position:'relative', zIndex:1 }}>
          {tab==='dashboard' && <DashboardTab key={rk} onNav={setTab}/>}
          {tab==='upload' && <UploadTab onSuccess={bump}/>}
          {tab==='conversations' && <ConversationsTab refreshKey={rk}/>}
          {tab==='generate' && <GenerateTab onDone={bump}/>}
          {tab==='generated' && <GeneratedTab refreshKey={rk}/>}
        </div>
      </main>
    </div>
  )
}
