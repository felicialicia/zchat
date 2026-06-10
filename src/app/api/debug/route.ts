import { NextResponse } from 'next/server'

export async function GET() {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN
  const databaseUrl = process.env.DATABASE_URL
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME

  const debug: Record<string, any> = {
    env: {
      TURSO_DATABASE_URL: tursoUrl ? `${tursoUrl.substring(0, 30)}...` : 'NOT SET',
      TURSO_AUTH_TOKEN: tursoToken ? `${tursoToken.substring(0, 20)}...` : 'NOT SET',
      DATABASE_URL: databaseUrl ? `${databaseUrl.substring(0, 30)}...` : 'NOT SET',
      CLOUDINARY_CLOUD_NAME: cloudName || 'NOT SET',
      NODE_ENV: process.env.NODE_ENV,
    },
  }

  // Try to connect to Turso directly
  try {
    const { createClient } = await import('@libsql/client')
    if (tursoUrl && tursoToken) {
      const client = createClient({ url: tursoUrl, authToken: tursoToken })
      const result = await client.execute('SELECT COUNT(*) as count FROM Channel')
      debug.tursoDirect = { success: true, channelCount: result.rows[0]?.count }
    } else {
      debug.tursoDirect = { success: false, error: 'No Turso credentials' }
    }
  } catch (error: any) {
    debug.tursoDirect = { success: false, error: error.message }
  }

  // Try Prisma with adapter
  try {
    const { PrismaClient } = await import('@prisma/client')
    const { PrismaLibSql } = await import('@prisma/adapter-libsql')
    const { createClient } = await import('@libsql/client')
    
    if (tursoUrl && tursoToken) {
      const libsql = createClient({ url: tursoUrl, authToken: tursoToken })
      const adapter = new PrismaLibSql(libsql)
      const prisma = new PrismaClient({ adapter })
      const channels = await prisma.channel.findMany()
      debug.prismaAdapter = { success: true, channelCount: channels.length }
      await prisma.$disconnect()
    } else {
      debug.prismaAdapter = { success: false, error: 'No Turso credentials' }
    }
  } catch (error: any) {
    debug.prismaAdapter = { success: false, error: error.message, stack: error.stack?.substring(0, 200) }
  }

  return NextResponse.json(debug)
}
