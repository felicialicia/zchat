import { db } from '@/lib/db'
import { NextResponse } from 'next/server'

// GET - List all users
export async function GET() {
  try {
    const users = await db.chatUser.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json(users)
  } catch (error) {
    console.error('Failed to fetch users:', error)
    return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
  }
}

// POST - Create or get user
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { username, avatar } = body

    if (!username || typeof username !== 'string') {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 })
    }

    // Check if user already exists
    let user = await db.chatUser.findUnique({
      where: { username }
    })

    if (!user) {
      const avatarColors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#8b5cf6', '#ec4899']
      const randomAvatar = avatar || avatarColors[Math.floor(Math.random() * avatarColors.length)]
      
      user = await db.chatUser.create({
        data: {
          username,
          avatar: randomAvatar
        }
      })
    }

    return NextResponse.json(user)
  } catch (error) {
    console.error('Failed to create user:', error)
    return NextResponse.json({ error: 'Failed to create user' }, { status: 500 })
  }
}
