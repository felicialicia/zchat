import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET - List all channels
export async function GET() {
  try {
    const channels = await db.channel.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        _count: {
          select: { messages: true }
        }
      }
    })
    return NextResponse.json(channels)
  } catch (error) {
    console.error('Failed to fetch channels:', error)
    return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
  }
}

// POST - Create a channel
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { name, description, type } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json({ error: 'Channel name is required' }, { status: 400 })
    }

    const channel = await db.channel.create({
      data: {
        name: name.toLowerCase().replace(/\s+/g, '-'),
        description: description || '',
        type: type || 'general'
      }
    })

    return NextResponse.json(channel)
  } catch (error: any) {
    if (error.code === 'P2002') {
      return NextResponse.json({ error: 'Channel name already exists' }, { status: 409 })
    }
    console.error('Failed to create channel:', error)
    return NextResponse.json({ error: 'Failed to create channel' }, { status: 500 })
  }
}
