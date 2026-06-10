import { createClient } from '@libsql/client'

const client = createClient({
  url: process.env.TURSO_DATABASE_URL!,
  authToken: process.env.TURSO_AUTH_TOKEN!,
})

async function init() {
  console.log('Creating tables on Turso...')

  await client.execute(`
    CREATE TABLE IF NOT EXISTS ChatUser (
      id TEXT PRIMARY KEY NOT NULL,
      username TEXT NOT NULL UNIQUE,
      avatar TEXT NOT NULL DEFAULT '#6366f1',
      isOnline BOOLEAN NOT NULL DEFAULT false,
      lastSeen DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('✅ ChatUser table created')

  await client.execute(`
    CREATE TABLE IF NOT EXISTS Channel (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT 'general',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `)
  console.log('✅ Channel table created')

  await client.execute(`
    CREATE TABLE IF NOT EXISTS Message (
      id TEXT PRIMARY KEY NOT NULL,
      content TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'text',
      userId TEXT NOT NULL,
      channelId TEXT NOT NULL,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (userId) REFERENCES ChatUser(id),
      FOREIGN KEY (channelId) REFERENCES Channel(id)
    )
  `)
  console.log('✅ Message table created')

  const channels = [
    { id: 'ch_umum', name: 'umum', description: 'Channel umum untuk semua diskusi', type: 'general' },
    { id: 'ch_teknis', name: 'teknis', description: 'Diskusi teknis dan troubleshooting', type: 'general' },
    { id: 'ch_pengumuman', name: 'pengumuman', description: 'Pengumuman resmi dari admin', type: 'announcement' },
    { id: 'ch_random', name: 'random', description: 'Topik bebas dan obrolan santai', type: 'general' },
  ]

  for (const ch of channels) {
    try {
      await client.execute({
        sql: 'INSERT OR IGNORE INTO Channel (id, name, description, type) VALUES (?, ?, ?, ?)',
        args: [ch.id, ch.name, ch.description, ch.type],
      })
    } catch (e) {
      console.log(`Channel ${ch.name} might already exist`)
    }
  }
  console.log('✅ Channels seeded')

  try {
    await client.execute({
      sql: 'INSERT OR IGNORE INTO ChatUser (id, username, avatar) VALUES (?, ?, ?)',
      args: ['ai-assistant', 'Z.ai Assistant', '#8b5cf6'],
    })
  } catch (e) {
    console.log('AI assistant might already exist')
  }
  console.log('✅ AI assistant seeded')

  console.log('\n🎉 Turso database initialized successfully!')
}

init().catch(console.error)
