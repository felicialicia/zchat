'use client'

import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useChatStore } from '@/lib/chat-store'

function getSocketUrl() {
  // Production: use the Railway Socket.io URL
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL
  }
  // Sandbox: use Caddy gateway with XTransformPort
  return undefined // will use relative path with XTransformPort
}

function createSocketConnection(): Socket {
  const socketUrl = getSocketUrl()

  if (socketUrl) {
    // Production: connect directly to Railway
    return io(socketUrl, {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })
  }

  // Sandbox: use Caddy gateway with XTransformPort
  return io('/?XTransformPort=3003', {
    transports: ['websocket', 'polling'],
    forceNew: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    timeout: 10000,
  })
}

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const currentUserRef = useRef<any>(null)
  const activeChannelRef = useRef<string | null>(null)
  const {
    currentUser,
    activeChannel,
    setIsConnected,
    addMessage,
    setOnlineUsers,
    setTypingUsers,
  } = useChatStore()

  // Keep refs in sync
  useEffect(() => {
    currentUserRef.current = currentUser
  }, [currentUser])

  useEffect(() => {
    activeChannelRef.current = activeChannel
  }, [activeChannel])

  // Create socket connection once
  useEffect(() => {
    const socketInstance = createSocketConnection()
    socketRef.current = socketInstance

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected')
      setIsConnected(true)

      // Re-authenticate if user exists
      const user = currentUserRef.current
      if (user) {
        socketInstance.emit('auth', {
          userId: user.id,
          username: user.username,
          avatar: user.avatar,
        })
      }
    })

    socketInstance.on('disconnect', () => {
      console.log('[Socket] Disconnected')
      setIsConnected(false)
    })

    socketInstance.on('online-users', (users: any[]) => {
      console.log('[Socket] Online users:', users.length)
      setOnlineUsers(users)
    })

    socketInstance.on('new-message', (message: any) => {
      addMessage(message)
    })

    socketInstance.on('typing-users', (data: { channelId: string; users: any[] }) => {
      if (data.channelId === activeChannelRef.current) {
        const user = currentUserRef.current
        setTypingUsers(data.users.filter((u: any) => u.id !== user?.id))
      }
    })

    socketInstance.on('user-joined-channel', (data: any) => {
      console.log(`[Socket] User joined channel: ${data.user.username}`)
    })

    socketInstance.on('user-left-channel', (data: any) => {
      console.log(`[Socket] User left channel: ${data.user.username}`)
    })

    return () => {
      socketInstance.disconnect()
    }
  // Only run once on mount - use refs for dynamic values
  }, [setIsConnected, addMessage, setOnlineUsers, setTypingUsers])

  // Authenticate when currentUser changes
  useEffect(() => {
    if (socketRef.current && currentUser && socketRef.current.connected) {
      socketRef.current.emit('auth', {
        userId: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
      })
    }
  }, [currentUser])

  // Re-join channel when active channel changes
  useEffect(() => {
    if (socketRef.current && activeChannel && currentUser) {
      socketRef.current.emit('join-channel', { channelId: activeChannel })
    }
  }, [activeChannel, currentUser])

  const authenticate = useCallback((userId: string, username: string, avatar: string) => {
    if (socketRef.current) {
      socketRef.current.emit('auth', { userId, username, avatar })
    }
  }, [])

  const joinChannel = useCallback((channelId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('join-channel', { channelId })
    }
  }, [])

  const leaveChannel = useCallback((channelId: string) => {
    if (socketRef.current) {
      socketRef.current.emit('leave-channel', { channelId })
    }
  }, [])

  const sendMessage = useCallback((channelId: string, content: string, userId: string, username: string, avatar: string, type: string = 'text') => {
    if (socketRef.current) {
      socketRef.current.emit('send-message', {
        channelId,
        content,
        userId,
        username,
        avatar,
        type,
      })
    }
  }, [])

  const sendTyping = useCallback((channelId: string, isTyping: boolean) => {
    if (socketRef.current) {
      socketRef.current.emit('typing', { channelId, isTyping })
    }
  }, [])

  return {
    authenticate,
    joinChannel,
    leaveChannel,
    sendMessage,
    sendTyping,
  }
}
