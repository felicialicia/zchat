'use client'

import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useChatStore } from '@/lib/chat-store'

export function useSocket() {
  const socketRef = useRef<Socket | null>(null)
  const {
    currentUser,
    activeChannel,
    setIsConnected,
    addMessage,
    setOnlineUsers,
    setTypingUsers,
  } = useChatStore()

  useEffect(() => {
    const socketInstance = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: true,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socketRef.current = socketInstance

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected')
      setIsConnected(true)

      // Re-authenticate if user exists
      if (currentUser) {
        socketInstance.emit('auth', {
          userId: currentUser.id,
          username: currentUser.username,
          avatar: currentUser.avatar,
        })
      }
    })

    socketInstance.on('disconnect', () => {
      console.log('[Socket] Disconnected')
      setIsConnected(false)
    })

    socketInstance.on('online-users', (users: any[]) => {
      setOnlineUsers(users)
    })

    socketInstance.on('new-message', (message: any) => {
      addMessage(message)
    })

    socketInstance.on('typing-users', (data: { channelId: string; users: any[] }) => {
      if (data.channelId === activeChannel) {
        setTypingUsers(data.users.filter((u: any) => u.id !== currentUser?.id))
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
  }, [setIsConnected, addMessage, setOnlineUsers, setTypingUsers, activeChannel, currentUser])

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
