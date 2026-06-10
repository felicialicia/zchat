'use client'

import { useEffect, useRef, useCallback } from 'react'
import { io, Socket } from 'socket.io-client'
import { useChatStore } from '@/lib/chat-store'

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
    const socketUrl = typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.hostname}:3003`
      : 'http://localhost:3003'

    const socketInstance = io(socketUrl, {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
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
