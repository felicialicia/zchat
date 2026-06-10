import { NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

// Store conversation histories in memory
const conversations = new Map<string, any[]>()

let zaiInstance: any = null

async function getZAI() {
  if (!zaiInstance) {
    zaiInstance = await ZAI.create()
  }
  return zaiInstance
}

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { message, channelId, username } = body

    if (!message || !channelId) {
      return NextResponse.json({ error: 'message and channelId are required' }, { status: 400 })
    }

    const zai = await getZAI()

    // Get or create conversation history for this channel
    const historyKey = `channel-${channelId}`
    if (!conversations.has(historyKey)) {
      conversations.set(historyKey, [
        {
          role: 'assistant',
          content: `Kamu adalah asisten AI yang ramah dan membantu di dalam chat internal. Kamu bisa menjawab pertanyaan, membantu tugas, dan memberikan saran. Jawab dalam bahasa yang sama dengan yang digunakan oleh pengguna. Jika mereka berbahasa Indonesia, jawab dalam bahasa Indonesia. Nama kamu adalah "Z.ai Assistant".`
        }
      ])
    }

    const history = conversations.get(historyKey)
    
    // Add user message
    history.push({
      role: 'user',
      content: `[${username || 'User'}]: ${message}`
    })

    // Keep history manageable (last 20 messages + system prompt)
    if (history.length > 21) {
      conversations.set(historyKey, [
        history[0],
        ...history.slice(-20)
      ])
    }

    const completion = await zai.chat.completions.create({
      messages: history,
      thinking: { type: 'disabled' }
    })

    const aiResponse = completion.choices[0]?.message?.content

    // Add AI response to history
    history.push({
      role: 'assistant',
      content: aiResponse
    })

    return NextResponse.json({
      success: true,
      response: aiResponse
    })
  } catch (error: any) {
    console.error('AI chat error:', error)
    return NextResponse.json({ 
      error: 'Failed to get AI response',
      details: error.message 
    }, { status: 500 })
  }
}

// Clear conversation history for a channel
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')
    
    if (channelId) {
      conversations.delete(`channel-${channelId}`)
    }
    
    return NextResponse.json({ success: true })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to clear history' }, { status: 500 })
  }
}
