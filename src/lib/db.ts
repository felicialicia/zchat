import { PrismaClient } from '@prisma/client'
import { createClient as createLibsqlClient, Client as LibsqlClient } from '@libsql/client'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
  libsql: LibsqlClient | undefined
}

// Create libsql client for Turso (production) or local dev
function createDbClient(): LibsqlClient {
  const tursoUrl = process.env.TURSO_DATABASE_URL
  const tursoToken = process.env.TURSO_AUTH_TOKEN

  if (tursoUrl && tursoToken) {
    return createLibsqlClient({
      url: tursoUrl,
      authToken: tursoToken,
    })
  }

  // Local development
  return createLibsqlClient({
    url: process.env.DATABASE_URL || 'file:/home/z/my-project/db/custom.db',
  })
}

// Export the libsql client for direct queries
export const libsql = globalForPrisma.libsql ?? createDbClient()

if (process.env.NODE_ENV !== 'production') globalForPrisma.libsql = libsql

// Also export Prisma client for development (when we have local SQLite)
// In production, use libsql directly
let _prisma: PrismaClient | null = null

export function getPrisma(): PrismaClient {
  if (!_prisma) {
    const tursoUrl = process.env.TURSO_DATABASE_URL
    const tursoToken = process.env.TURSO_AUTH_TOKEN

    if (tursoUrl && tursoToken) {
      // In production with Turso, we shouldn't use Prisma directly
      // Use libsql instead
      throw new Error('Use libsql for Turso connections, not Prisma')
    }

    _prisma = globalForPrisma.prisma ?? new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query'] : [],
    })

    if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = _prisma
  }
  return _prisma
}

// For backward compatibility - db object that routes to either Prisma or libsql
export const db = {
  // Channel operations
  channel: {
    findMany: async () => {
      const result = await libsql.execute('SELECT id, name, description, type, createdAt FROM Channel ORDER BY createdAt ASC')
      return result.rows.map(row => ({
        id: row.id as string,
        name: row.name as string,
        description: row.description as string,
        type: row.type as string,
        createdAt: row.createdAt as string,
        _count: { messages: 0 },
      }))
    },
    findUnique: async ({ where }: { where: { id?: string; name?: string } }) => {
      if (where.id) {
        const result = await libsql.execute({ sql: 'SELECT id, name, description, type, createdAt FROM Channel WHERE id = ?', args: [where.id] })
        return result.rows[0] ? {
          id: result.rows[0].id as string,
          name: result.rows[0].name as string,
          description: result.rows[0].description as string,
          type: result.rows[0].type as string,
          createdAt: result.rows[0].createdAt as string,
        } : null
      }
      if (where.name) {
        const result = await libsql.execute({ sql: 'SELECT id, name, description, type, createdAt FROM Channel WHERE name = ?', args: [where.name] })
        return result.rows[0] ? {
          id: result.rows[0].id as string,
          name: result.rows[0].name as string,
          description: result.rows[0].description as string,
          type: result.rows[0].type as string,
          createdAt: result.rows[0].createdAt as string,
        } : null
      }
      return null
    },
    create: async ({ data }: { data: { name: string; description?: string; type?: string } }) => {
      const id = 'ch_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
      const result = await libsql.execute({
        sql: 'INSERT INTO Channel (id, name, description, type) VALUES (?, ?, ?, ?)',
        args: [id, data.name, data.description || '', data.type || 'general'],
      })
      return { id, ...data, createdAt: new Date().toISOString() }
    },
  },

  // ChatUser operations
  chatUser: {
    findMany: async () => {
      const result = await libsql.execute('SELECT id, username, avatar, isOnline, lastSeen, createdAt FROM ChatUser ORDER BY createdAt DESC')
      return result.rows.map(row => ({
        id: row.id as string,
        username: row.username as string,
        avatar: row.avatar as string,
        isOnline: Boolean(row.isOnline),
        lastSeen: row.lastSeen as string,
        createdAt: row.createdAt as string,
      }))
    },
    findUnique: async ({ where }: { where: { username?: string; id?: string } }) => {
      if (where.username) {
        const result = await libsql.execute({ sql: 'SELECT id, username, avatar, isOnline, lastSeen, createdAt FROM ChatUser WHERE username = ?', args: [where.username] })
        return result.rows[0] ? {
          id: result.rows[0].id as string,
          username: result.rows[0].username as string,
          avatar: result.rows[0].avatar as string,
          isOnline: Boolean(result.rows[0].isOnline),
          lastSeen: result.rows[0].lastSeen as string,
          createdAt: result.rows[0].createdAt as string,
        } : null
      }
      if (where.id) {
        const result = await libsql.execute({ sql: 'SELECT id, username, avatar, isOnline, lastSeen, createdAt FROM ChatUser WHERE id = ?', args: [where.id] })
        return result.rows[0] ? {
          id: result.rows[0].id as string,
          username: result.rows[0].username as string,
          avatar: result.rows[0].avatar as string,
          isOnline: Boolean(result.rows[0].isOnline),
          lastSeen: result.rows[0].lastSeen as string,
          createdAt: result.rows[0].createdAt as string,
        } : null
      }
      return null
    },
    create: async ({ data }: { data: { username: string; avatar?: string } }) => {
      const id = 'cu_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
      const avatar = data.avatar || '#6366f1'
      const result = await libsql.execute({
        sql: 'INSERT INTO ChatUser (id, username, avatar) VALUES (?, ?, ?)',
        args: [id, data.username, avatar],
      })
      return { id, username: data.username, avatar, isOnline: false, lastSeen: new Date().toISOString(), createdAt: new Date().toISOString() }
    },
  },

  // Message operations
  message: {
    findMany: async ({ where, orderBy, take, skip, cursor, include }: any) => {
      const channelId = where?.channelId
      if (!channelId) return []

      let sql = `SELECT m.id, m.content, m.type, m.userId, m.channelId, m.createdAt,
                 u.id as userId, u.username as userName, u.avatar as userAvatar
                 FROM Message m
                 JOIN ChatUser u ON m.userId = u.id
                 WHERE m.channelId = ?
                 ORDER BY m.createdAt ASC`

      const result = await libsql.execute({ sql, args: [channelId] })
      return result.rows.map(row => ({
        id: row.id as string,
        content: row.content as string,
        type: row.type as string,
        userId: row.userId as string,
        channelId: row.channelId as string,
        createdAt: row.createdAt as string,
        user: {
          id: row.userId as string,
          username: row.userName as string,
          avatar: row.userAvatar as string,
        },
      }))
    },
    create: async ({ data, include }: any) => {
      const id = 'msg_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36)
      await libsql.execute({
        sql: 'INSERT INTO Message (id, content, type, userId, channelId) VALUES (?, ?, ?, ?, ?)',
        args: [id, data.content, data.type || 'text', data.userId, data.channelId],
      })

      // Fetch with user info
      const result = await libsql.execute({
        sql: `SELECT m.id, m.content, m.type, m.userId, m.channelId, m.createdAt,
              u.id as userId, u.username as userName, u.avatar as userAvatar
              FROM Message m
              JOIN ChatUser u ON m.userId = u.id
              WHERE m.id = ?`,
        args: [id],
      })

      if (result.rows[0]) {
        const row = result.rows[0]
        return {
          id: row.id as string,
          content: row.content as string,
          type: row.type as string,
          userId: row.userId as string,
          channelId: row.channelId as string,
          createdAt: row.createdAt as string,
          user: {
            id: row.userId as string,
            username: row.userName as string,
            avatar: row.userAvatar as string,
          },
        }
      }

      return { id, ...data, createdAt: new Date().toISOString() }
    },
  },
}
