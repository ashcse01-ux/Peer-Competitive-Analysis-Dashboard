import React, { useState, useRef, useEffect } from 'react'
import { MessageSquare, X, Send, Sparkles, User, Bot, Loader2 } from 'lucide-react'

interface Message {
  sender: 'user' | 'bot'
  text: string
}

export default function MugChatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      sender: 'bot',
      text: 'Hello! I am **Mug.ai**, your dedicated Peer Analysis Assistant. 🤖\n\nI can answer questions about operator performance across Google Play, Apple App Store, Google Search, and Redbus reviews with 100% data accuracy.\n\nTry asking me:\n- *On what thing is Neugo the best among all operators?*\n- *What are the main weaknesses of Zingbus?*\n- *Compare FreshBus and FlixBus.*'
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isLoading])

  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || isLoading) return

    const userMsg = textToSend.trim()
    setInput('')
    setMessages(prev => [...prev, { sender: 'user', text: userMsg }])
    setIsLoading(true)

    try {
      const response = await fetch(`${import.meta.env.VITE_API_BASE_URL || ''}/api/v1/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: userMsg }),
      })
      if (!response.ok) throw new Error('Failed to get answer')
      const data = await response.json()
      setMessages(prev => [...prev, { sender: 'bot', text: data.response }])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          sender: 'bot',
          text: '⚠️ Sorry, I encountered an error. Please ensure the backend server is running and try again.'
        }
      ])
    } finally {
      setIsLoading(false)
    }
  }

  // A helper function to parse basic markdown (bold, list, table) to JSX
  const formatMessageText = (text: string) => {
    const lines = text.split('\n')
    let inTable = false
    let tableRows: string[][] = []

    return (
      <div className="space-y-2 text-xs leading-relaxed">
        {lines.map((line, idx) => {
          // Check for Table formatting
          if (line.trim().startsWith('|')) {
            inTable = true
            const cells = line.split('|').map(c => c.trim()).filter(c => c !== '')
            if (cells.length > 0 && !cells[0].includes('---')) {
              tableRows.push(cells)
            }
            // If it's the last line, render the table
            if (idx === lines.length - 1 || !lines[idx + 1].trim().startsWith('|')) {
              inTable = false
              const currentTableRows = [...tableRows]
              tableRows = []
              return (
                <div key={idx} className="my-2 overflow-x-auto rounded-lg border border-[var(--border-subtle)] bg-slate-950/45">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-[var(--border-subtle)] bg-slate-900/50">
                        {currentTableRows[0]?.map((header, hIdx) => (
                          <th key={hIdx} className="p-2 font-bold text-slate-300">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {currentTableRows.slice(1).map((row, rIdx) => (
                        <tr key={rIdx} className="border-b border-slate-900/40 last:border-0 hover:bg-slate-900/20">
                          {row.map((cell, cIdx) => (
                            <td key={cIdx} className="p-2 text-slate-300 font-semibold">{cell}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
            return null
          }

          // Headers first
          if (line.trim().startsWith('###')) {
            return <h4 key={idx} className="text-sm font-black text-theme-primary mt-2 flex items-center gap-1.5"><Sparkles size={14} className="text-blue-400" />{line.replace('###', '').trim()}</h4>
          }
          if (line.trim().startsWith('####')) {
            return <h5 key={idx} className="text-xs font-bold text-slate-300 mt-2">{line.replace('####', '').trim()}</h5>
          }

          // Check for bullet points
          let isBullet = false
          let parsedLine = line
          if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
            isBullet = true
            parsedLine = line.trim().substring(2)
          }

          // Bold: **text**
          const boldRegex = /\*\*(.*?)\*\*/g
          const boldMatches = parsedLine.match(boldRegex)
          let elements: React.ReactNode[] = []
          if (boldMatches) {
            let lastIndex = 0
            let match
            while ((match = boldRegex.exec(parsedLine)) !== null) {
              const textBefore = parsedLine.slice(lastIndex, match.index)
              const boldText = match[1]
              elements.push(textBefore)
              elements.push(<strong key={match.index} className="font-extrabold text-blue-400">{boldText}</strong>)
              lastIndex = boldRegex.lastIndex
            }
            elements.push(parsedLine.slice(lastIndex))
          } else {
            // Italic: *text*
            const italicRegex = /\*(.*?)\*/g
            const italicMatches = parsedLine.match(italicRegex)
            if (italicMatches) {
              let lastIndex = 0
              let match
              while ((match = italicRegex.exec(parsedLine)) !== null) {
                const textBefore = parsedLine.slice(lastIndex, match.index)
                const italicText = match[1]
                elements.push(textBefore)
                elements.push(<em key={match.index} className="italic text-slate-300">{italicText}</em>)
                lastIndex = italicRegex.lastIndex
              }
              elements.push(parsedLine.slice(lastIndex))
            } else {
              elements = [parsedLine]
            }
          }

          if (isBullet) {
            return (
              <li key={idx} className="ml-4 list-disc text-slate-200">
                {elements.length > 0 ? elements : parsedLine}
              </li>
            )
          }

          return line.trim() === '' ? <div key={idx} className="h-1.5" /> : (
            <p key={idx} className="text-slate-200">
              {elements.length > 0 ? elements : line}
            </p>
          )
        })}
      </div>
    )
  }

  const quickActions = [
    { label: 'Why is Neugo best?', query: 'On what thing is Neugo the best among all operators?' },
    { label: 'Zingbus weaknesses', query: 'What are the main weaknesses of Zingbus?' },
    { label: 'Compare FreshBus & FlixBus', query: 'Compare FreshBus and FlixBus' },
  ]

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
      {/* Chat Window */}
      {isOpen && (
        <div
          className="mb-4 flex h-[520px] w-[380px] flex-col rounded-3xl border border-slate-900/10 shadow-2xl backdrop-blur-3xl overflow-hidden transition-all duration-350"
          style={{
            background: 'rgba(15, 23, 42, 0.85)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 1px rgba(255, 255, 255, 0.05)',
            borderColor: 'rgba(255, 255, 255, 0.08)'
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{
              background: 'linear-gradient(90deg, rgba(30, 41, 59, 0.8), rgba(15, 23, 42, 0.9))',
              borderColor: 'rgba(255, 255, 255, 0.08)'
            }}
          >
            <div className="flex items-center gap-2.5">
              <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-500/20 text-blue-400">
                <Sparkles size={16} />
              </span>
              <div>
                <h3 className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                  Mug.ai Assistant
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                </h3>
                <p className="text-[10px] font-semibold text-slate-400">Aggregated Insights Platform</p>
              </div>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white transition"
            >
              <X size={16} />
            </button>
          </div>

          {/* Quick Actions Panel */}
          <div className="flex gap-1.5 overflow-x-auto px-4 py-2 border-b border-slate-900/50 no-scrollbar">
            {quickActions.map((act, i) => (
              <button
                key={i}
                onClick={() => handleSend(act.query)}
                className="whitespace-nowrap rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1 text-[10px] font-bold text-blue-300 hover:border-blue-400/40 hover:bg-blue-950/20 hover:text-white transition"
              >
                {act.label}
              </button>
            ))}
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={`flex gap-2.5 ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.sender === 'bot' && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                    <Bot size={14} />
                  </span>
                )}
                <div
                  className={`rounded-2xl px-4 py-3 max-w-[85%] text-xs shadow-sm ${
                    msg.sender === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none'
                      : 'bg-slate-900/80 text-slate-100 rounded-tl-none border border-slate-800'
                  }`}
                >
                  {formatMessageText(msg.text)}
                </div>
                {msg.sender === 'user' && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                    <User size={14} />
                  </span>
                )}
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-2.5 justify-start items-center">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  <Bot size={14} />
                </span>
                <div className="flex items-center gap-2 rounded-2xl px-4 py-3 bg-slate-900/80 text-slate-400 border border-slate-800">
                  <Loader2 size={14} className="animate-spin text-blue-400" />
                  <span className="text-[10px] font-bold tracking-tight">Mug.ai is thinking...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleSend(input)
            }}
            className="p-3 border-t flex gap-2"
            style={{
              borderColor: 'rgba(255, 255, 255, 0.08)',
              background: 'rgba(15, 23, 42, 0.9)'
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Mug.ai something..."
              disabled={isLoading}
              className="flex-1 rounded-xl border border-slate-800 bg-slate-950/60 px-3.5 py-2 text-xs font-semibold text-white placeholder-slate-500 outline-none transition focus:border-blue-500/50"
            />
            <button
              type="submit"
              disabled={isLoading || !input.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40 transition"
            >
              <Send size={14} />
            </button>
          </form>
        </div>
      )}

      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="group relative flex h-14 w-14 items-center justify-center rounded-full text-white shadow-xl hover:scale-105 active:scale-95 transition-all duration-200"
        style={{
          background: 'linear-gradient(135deg, #0055ff, #00d4ff)',
          boxShadow: '0 8px 32px rgba(0, 85, 255, 0.45)'
        }}
      >
        <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[9px] font-black animate-bounce">
          AI
        </span>
        {isOpen ? <X size={24} /> : <MessageSquare size={24} />}
      </button>
    </div>
  )
}
