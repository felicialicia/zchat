import { db } from '@/lib/db'

async function seed() {
  // Create default channels
  const channels = [
    { name: 'umum', description: 'Channel umum untuk semua diskusi', type: 'general' },
    { name: 'teknis', description: 'Diskusi teknis dan troubleshooting', type: 'general' },
    { name: 'pengumuman', description: 'Pengumuman resmi dari admin', type: 'announcement' },
    { name: 'random', description: 'Topik bebas dan obrolan santai', type: 'general' },
  ]

  for (const ch of channels) {
    const existing = await db.channel.findUnique({ where: { name: ch.name } })
    if (!existing) {
      await db.channel.create({ data: ch })
      console.log(`Created channel: ${ch.name}`)
    }
  }

  // Create AI assistant user
  const aiUser = await db.chatUser.findUnique({ where: { username: 'Z.ai Assistant' } })
  if (!aiUser) {
    await db.chatUser.create({
      data: {
        username: 'Z.ai Assistant',
        avatar: '#8b5cf6',
      }
    })
    console.log('Created AI Assistant user')
  }

  console.log('Seed completed!')
}

seed()
  .catch(console.error)
  .finally(() => db.$disconnect())
