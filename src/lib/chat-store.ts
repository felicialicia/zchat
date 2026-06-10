import { create } from 'zustand'

export interface ChatUser {
  id: string
  username: string
  avatar: string
  isOnline?: boolean
}

export interface Channel {
  id: string
  name: string
  description: string
  type: string
  createdAt: string
  _count?: { messages: number }
}

export interface ChatMessage {
  id: string
  content: string
  type: string
  userId: string
  channelId: string
  createdAt: string
  user: {
    id: string
    username: string
    avatar: string
  }
}

interface TypingUser {
  id: string
  username: string
}

interface ChatState {
  // Current user
  currentUser: ChatUser | null
  setCurrentUser: (user: ChatUser) => void

  // Channels
  channels: Channel[]
  setChannels: (channels: Channel[]) => void
  addChannel: (channel: Channel) => void
  activeChannel: string | null
  setActiveChannel: (channelId: string) => void

  // Messages
  messages: ChatMessage[]
  setMessages: (messages: ChatMessage[]) => void
  addMessage: (message: ChatMessage) => void

  // Online users
  onlineUsers: ChatUser[]
  setOnlineUsers: (users: ChatUser[]) => void

  // Typing
  typingUsers: TypingUser[]
  setTypingUsers: (users: TypingUser[]) => void

  // UI State
  isConnected: boolean
  setIsConnected: (connected: boolean) => void
  sidebarOpen: boolean
  setSidebarOpen: (open: boolean) => void
  showLogin: boolean
  setShowLogin: (show: boolean) => void
  isAiLoading: boolean
  setIsAiLoading: (loading: boolean) => void
}

export const useChatStore = create<ChatState>((set) => ({
  currentUser: null,
  setCurrentUser: (user) => set({ currentUser: user }),

  channels: [],
  setChannels: (channels) => set({ channels }),
  addChannel: (channel) => set((state) => ({ channels: [...state.channels, channel] })),
  activeChannel: null,
  setActiveChannel: (channelId) => set({ activeChannel: channelId, messages: [] }),

  messages: [],
  setMessages: (messages) => set({ messages }),
  addMessage: (message) => set((state) => {
    // Deduplicate: skip if message with same id already exists
    if (state.messages.some(m => m.id === message.id)) return state

    // Content-based dedup: skip if a message with same content from same user
    // in same channel within 5 seconds already exists (catches optimistic vs server messages)
    const isDuplicate = state.messages.some(m =>
      m.content === message.content &&
      m.userId === message.userId &&
      m.channelId === message.channelId &&
      Math.abs(new Date(m.createdAt).getTime() - new Date(message.createdAt).getTime()) < 5000
    )
    if (isDuplicate) return state

    return { messages: [...state.messages, message] }
  }),

  onlineUsers: [],
  setOnlineUsers: (users) => set({ 
    // Deduplicate by user id (belt-and-suspenders for server-side dedup)
    onlineUsers: users.reduce((acc: ChatUser[], u: ChatUser) => {
      if (!acc.find(existing => existing.id === u.id)) {
        acc.push(u)
      }
      return acc
    }, [])
  }),

  typingUsers: [],
  setTypingUsers: (users) => set({ typingUsers: users }),

  isConnected: false,
  setIsConnected: (connected) => set({ isConnected: connected }),
  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  showLogin: true,
  setShowLogin: (show) => set({ showLogin: show }),
  isAiLoading: false,
  setIsAiLoading: (loading) => set({ isAiLoading: loading }),
}))
