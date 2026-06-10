import { PrismaClient } from '@prisma/client'
import { PrismaLibSql } from '@prisma/adapter-libsql'
import { createClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function createPrismaClient() {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  console.log('[DB] Creating Prisma client...', {
    hasTursoUrl: !!tursoUrl,
    hasTursoToken: !!tursoToken,
    nodeEnv: process.env.NODE_ENV,
  })

  // In production with Turso, use the libsql adapter
  if (tursoUrl && tursoToken) {
    try {
      const libsql = createClient({
        url: tursoUrl,
        authToken: tursoToken,
      })

      const adapter = new PrismaLibSql(libsql)
      console.log('[DB] Using Turso adapter')
      return new PrismaClient({ adapter })
    } catch (error) {
      console.error('[DB] Failed to create Turso adapter, falling back:', error)
    }
  }

  // In development, use local SQLite
  console.log('[DB] Using local SQLite')
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })
}

export const db = globalForPrisma.prisma ?? createPrismaClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db
