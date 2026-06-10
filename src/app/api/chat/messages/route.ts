import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET - Get messages for a channel
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const channelId = searchParams.get('channelId')
    const limit = parseInt(searchParams.get('limit') || '50')
    const cursor = searchParams.get('cursor')

    if (!channelId) {
      return NextResponse.json({ error: 'channelId is required' }, { status: 400 })
    }

    const messages = await db.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      ...(cursor ? {
        skip: 1,
        cursor: { id: cursor }
      } : {}),
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        }
      }
    })

    // Reverse to show oldest first
    const reversed = messages.reverse()

    return NextResponse.json({
      messages: reversed,
      nextCursor: messages.length === limit ? messages[messages.length - 1]?.id : null
    })
  } catch (error) {
    console.error('Failed to fetch messages:', error)
    return NextResponse.json({ error: 'Failed to fetch messages' }, { status: 500 })
  }
}

// POST - Save a message
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { content, type, userId, channelId } = body

    if (!content || !userId || !channelId) {
      return NextResponse.json({ error: 'content, userId, and channelId are required' }, { status: 400 })
    }

    const message = await db.message.create({
      data: {
        content,
        type: type || 'text',
        userId,
        channelId
      },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            avatar: true
          }
        }
      }
    })

    return NextResponse.json(message)
  } catch (error) {
    console.error('Failed to save message:', error)
    return NextResponse.json({ error: 'Failed to save message' }, { status: 500 })
  }
}
