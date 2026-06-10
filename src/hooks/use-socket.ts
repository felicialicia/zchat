'use client'

import { useEffect, useRef, useCallback } from 'react'
import { getSharedSocket, disconnectSharedSocket } from '@/lib/socket-instance'
import { useChatStore } from '@/lib/chat-store'

export function useSocket() {
  const socketRef = useRef<ReturnType<typeof getSharedSocket> | null>(null)
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

  // Create socket connection once using shared singleton
  useEffect(() => {
    const socketInstance = getSharedSocket()
    socketRef.current = socketInstance

    socketInstance.on('connect', () => {
      console.log('[Socket] Connected')
      setIsConnected(true)

      // Re-authenticate if user exists (for reconnections)
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
      // Don't add messages from ourselves - we already added them optimistically
      const user = currentUserRef.current
      if (user && message.userId === user.id) return
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

    // If socket is already connected, set state immediately
    if (socketInstance.connected) {
      setIsConnected(true)
    }

    return () => {
      // Don't disconnect the shared socket here - let the component that
      // owns the socket lifecycle handle it. Just remove our listeners.
      socketInstance.off('connect')
      socketInstance.off('disconnect')
      socketInstance.off('online-users')
      socketInstance.off('new-message')
      socketInstance.off('typing-users')
      socketInstance.off('user-joined-channel')
      socketInstance.off('user-left-channel')
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
    socketRef,
    joinChannel,
    leaveChannel,
    sendMessage,
    sendTyping,
  }
}
