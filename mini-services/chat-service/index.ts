import { createServer } from 'http'
import { Server } from 'socket.io'

const httpServer = createServer()
const io = new Server(httpServer, {
  path: '/',
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000,
})

interface OnlineUser {
  id: string
  username: string
  avatar: string
  socketId: string
}

interface ChatMessage {
  id: string
  content: string
  type: string
  userId: string
  username: string
  avatar: string
  channelId: string
  createdAt: string
}

const onlineUsers = new Map<string, OnlineUser>()
const userChannels = new Map<string, Set<string>>()
const typingUsers = new Map<string, Set<string>>() // channelId -> Set of socketIds
const userSocketMap = new Map<string, string>() // userId -> socketId (for direct messaging/calls)

const generateId = () => Math.random().toString(36).substr(2, 9) + Date.now().toString(36)

io.on('connection', (socket) => {
  console.log(`[Chat] User connected: ${socket.id}`)

  // User authentication/join
  socket.on('auth', (data: { userId: string; username: string; avatar: string }) => {
    const { userId, username, avatar } = data
    
    const onlineUser: OnlineUser = {
      id: userId,
      username,
      avatar,
      socketId: socket.id
    }
    
    onlineUsers.set(socket.id, onlineUser)
    userChannels.set(socket.id, new Set())
    userSocketMap.set(userId, socket.id)
    
    // Broadcast updated online users list
    io.emit('online-users', Array.from(onlineUsers.values()).map(u => ({
      id: u.id,
      username: u.username,
      avatar: u.avatar
    })))
    
    console.log(`[Chat] ${username} authenticated, online: ${onlineUsers.size}`)
  })

  // Join a channel
  socket.on('join-channel', (data: { channelId: string }) => {
    const { channelId } = data
    const user = onlineUsers.get(socket.id)
    if (!user) return
    
    socket.join(channelId)
    userChannels.get(socket.id)?.add(channelId)
    
    // Notify channel that user joined
    socket.to(channelId).emit('user-joined-channel', {
      channelId,
      user: { id: user.id, username: user.username, avatar: user.avatar }
    })
    
    console.log(`[Chat] ${user.username} joined channel: ${channelId}`)
  })

  // Leave a channel
  socket.on('leave-channel', (data: { channelId: string }) => {
    const { channelId } = data
    const user = onlineUsers.get(socket.id)
    if (!user) return
    
    socket.leave(channelId)
    userChannels.get(socket.id)?.delete(channelId)
    
    // Remove typing status
    typingUsers.get(channelId)?.delete(socket.id)
    
    socket.to(channelId).emit('user-left-channel', {
      channelId,
      user: { id: user.id, username: user.username, avatar: user.avatar }
    })
  })

  // Send message to a channel
  socket.on('send-message', (data: { 
    channelId: string
    content: string
    userId: string
    username: string
    avatar: string
    type?: string
  }) => {
    const { channelId, content, userId, username, avatar, type = 'text' } = data
    const user = onlineUsers.get(socket.id)
    if (!user) return
    
    // Remove typing status when user sends message
    typingUsers.get(channelId)?.delete(socket.id)
    io.to(channelId).emit('typing-users', {
      channelId,
      users: Array.from(typingUsers.get(channelId) || []).map(sid => {
        const u = onlineUsers.get(sid)
        return u ? { id: u.id, username: u.username } : null
      }).filter(Boolean)
    })
    
    const message: ChatMessage = {
      id: generateId(),
      content,
      type,
      userId,
      username,
      avatar,
      channelId,
      createdAt: new Date().toISOString()
    }
    
    // Broadcast to everyone in the channel (including sender)
    io.to(channelId).emit('new-message', message)
  })

  // Typing indicator
  socket.on('typing', (data: { channelId: string; isTyping: boolean }) => {
    const { channelId, isTyping } = data
    const user = onlineUsers.get(socket.id)
    if (!user) return
    
    if (!typingUsers.has(channelId)) {
      typingUsers.set(channelId, new Set())
    }
    
    if (isTyping) {
      typingUsers.get(channelId)?.add(socket.id)
    } else {
      typingUsers.get(channelId)?.delete(socket.id)
    }
    
    socket.to(channelId).emit('typing-users', {
      channelId,
      users: Array.from(typingUsers.get(channelId) || []).map(sid => {
        const u = onlineUsers.get(sid)
        return u ? { id: u.id, username: u.username } : null
      }).filter(Boolean)
    })
  })

  // =========== WEBRTC CALL SIGNALING ===========
  
  // Initiate a call to a specific user
  socket.on('call-user', (data: {
    targetUserId: string
    callerId: string
    callerName: string
    callerAvatar: string
    callType: 'audio' | 'video'
    offer: RTCSessionDescriptionInit
  }) => {
    const { targetUserId, callerId, callerName, callerAvatar, callType, offer } = data
    const targetSocketId = userSocketMap.get(targetUserId)
    
    if (!targetSocketId) {
      socket.emit('call-failed', { reason: 'User is offline' })
      return
    }
    
    console.log(`[Call] ${callerName} calling ${targetUserId} (${callType})`)
    
    io.to(targetSocketId).emit('incoming-call', {
      callerId,
      callerName,
      callerAvatar,
      callType,
      offer,
    })
  })

  // Answer a call
  socket.on('answer-call', (data: {
    callerId: string
    answer: RTCSessionDescriptionInit
  }) => {
    const { callerId, answer } = data
    const callerSocketId = userSocketMap.get(callerId)
    
    if (!callerSocketId) {
      socket.emit('call-failed', { reason: 'Caller is offline' })
      return
    }
    
    console.log(`[Call] Call answered, sending answer to ${callerId}`)
    io.to(callerSocketId).emit('call-answered', { answer })
  })

  // Reject a call
  socket.on('reject-call', (data: {
    callerId: string
  }) => {
    const { callerId } = data
    const callerSocketId = userSocketMap.get(callerId)
    
    if (callerSocketId) {
      console.log(`[Call] Call rejected by callee, notifying ${callerId}`)
      io.to(callerSocketId).emit('call-rejected')
    }
  })

  // End an ongoing call
  socket.on('end-call', (data: {
    targetUserId: string
  }) => {
    const { targetUserId } = data
    const targetSocketId = userSocketMap.get(targetUserId)
    
    if (targetSocketId) {
      console.log(`[Call] Call ended, notifying ${targetUserId}`)
      io.to(targetSocketId).emit('call-ended')
    }
  })

  // Exchange ICE candidates
  socket.on('ice-candidate', (data: {
    targetUserId: string
    candidate: RTCIceCandidateInit
  }) => {
    const { targetUserId, candidate } = data
    const targetSocketId = userSocketMap.get(targetUserId)
    
    if (targetSocketId) {
      io.to(targetSocketId).emit('ice-candidate', { candidate })
    }
  })

  // =========== END WEBRTC ===========

  // Disconnect
  socket.on('disconnect', () => {
    const user = onlineUsers.get(socket.id)
    if (user) {
      // Remove from all channels
      const channels = userChannels.get(socket.id)
      if (channels) {
        channels.forEach(channelId => {
          typingUsers.get(channelId)?.delete(socket.id)
          socket.to(channelId).emit('user-left-channel', {
            channelId,
            user: { id: user.id, username: user.username, avatar: user.avatar }
          })
        })
      }
      
      onlineUsers.delete(socket.id)
      userChannels.delete(socket.id)
      userSocketMap.delete(user.id)
      
      // Broadcast updated online users list
      io.emit('online-users', Array.from(onlineUsers.values()).map(u => ({
        id: u.id,
        username: u.username,
        avatar: u.avatar
      })))
      
      console.log(`[Chat] ${user.username} disconnected, online: ${onlineUsers.size}`)
    }
  })

  socket.on('error', (error) => {
    console.error(`[Chat] Socket error (${socket.id}):`, error)
  })
})

const PORT = 3003
httpServer.listen(PORT, () => {
  console.log(`[Chat] Socket.io server running on port ${PORT}`)
})

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('[Chat] Received SIGTERM, shutting down...')
  httpServer.close(() => {
    console.log('[Chat] Server closed')
    process.exit(0)
  })
})

process.on('SIGINT', () => {
  console.log('[Chat] Received SIGINT, shutting down...')
  httpServer.close(() => {
    console.log('[Chat] Server closed')
    process.exit(0)
  })
})
