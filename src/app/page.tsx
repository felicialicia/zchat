'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useChatStore, ChatMessage } from '@/lib/chat-store'
import { useSocket } from '@/hooks/use-socket'
import { useNotifications } from '@/hooks/use-notifications'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Hash,
  Send,
  Plus,
  Users,
  MessageSquare,
  Wifi,
  WifiOff,
  LogOut,
  Bot,
  Menu,
  X,
  ChevronDown,
  Megaphone,
  Loader2,
  Paperclip,
  Mic,
  MicOff,
  Image as ImageIcon,
  Bell,
  BellOff,
  Download,
} from 'lucide-react'
import { toast } from '@/hooks/use-toast'

export default function ChatPage() {
  const {
    currentUser,
    setCurrentUser,
    channels,
    setChannels,
    addChannel,
    activeChannel,
    setActiveChannel,
    messages,
    setMessages,
    addMessage,
    onlineUsers,
    isConnected,
    sidebarOpen,
    setSidebarOpen,
    showLogin,
    setShowLogin,
    isAiLoading,
    setIsAiLoading,
    typingUsers,
  } = useChatStore()

  const { authenticate, joinChannel, leaveChannel, sendMessage, sendTyping } = useSocket()
  const { isSupported: notifSupported, permission: notifPermission, requestPermission: requestNotifPermission, notify: sendNotif } = useNotifications()

  const [inputMessage, setInputMessage] = useState('')
  const [loginUsername, setLoginUsername] = useState('')
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelDesc, setNewChannelDesc] = useState('')
  const [createDialogOpen, setCreateDialogOpen] = useState(false)
  const [channelsExpanded, setChannelsExpanded] = useState(true)
  const [usersExpanded, setUsersExpanded] = useState(true)
  const [isSending, setIsSending] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [imagePreview, setImagePreview] = useState<string | null>(null)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Declare fetch functions first
  const fetchChannels = useCallback(async () => {
    try {
      const res = await fetch('/api/chat/channels')
      const data = await res.json()
      setChannels(data)
      if (data.length > 0 && !activeChannel) {
        setActiveChannel(data[0].id)
      }
    } catch (error) {
      console.error('Failed to fetch channels:', error)
    }
  }, [activeChannel, setChannels, setActiveChannel])

  const fetchMessages = useCallback(async (channelId: string) => {
    try {
      const res = await fetch(`/api/chat/messages?channelId=${channelId}&limit=50`)
      const data = await res.json()
      setMessages(data.messages || [])
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }, [setMessages])

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Fetch channels on mount
  useEffect(() => {
    fetchChannels()
  }, [fetchChannels])

  // Fetch messages when active channel changes
  useEffect(() => {
    if (activeChannel) {
      fetchMessages(activeChannel)
    }
  }, [activeChannel, fetchMessages])

  // Check for saved user on mount
  useEffect(() => {
    const saved = localStorage.getItem('chatUser')
    if (saved) {
      try {
        const user = JSON.parse(saved)
        setCurrentUser(user)
        setShowLogin(false)
      } catch {}
    }
  }, [setCurrentUser, setShowLogin])

  // Request notification permission on login
  useEffect(() => {
    if (currentUser && notifSupported && notifPermission === 'default') {
      requestNotifPermission()
    }
  }, [currentUser, notifSupported, notifPermission, requestNotifPermission])

  const handleLogin = async () => {
    if (!loginUsername.trim()) return

    try {
      const res = await fetch('/api/chat/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginUsername.trim() }),
      })
      const user = await res.json()

      if (res.ok) {
        setCurrentUser(user)
        setShowLogin(false)
        localStorage.setItem('chatUser', JSON.stringify(user))
        authenticate(user.id, user.username, user.avatar)

        if (activeChannel) {
          joinChannel(activeChannel)
        }

        toast({
          title: 'Selamat datang! 👋',
          description: `Halo ${user.username}, kamu sudah masuk ke chat.`,
        })
      } else {
        toast({
          title: 'Gagal masuk',
          description: user.error || 'Username sudah digunakan',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal terhubung ke server',
        variant: 'destructive',
      })
    }
  }

  const handleLogout = () => {
    if (activeChannel) {
      leaveChannel(activeChannel)
    }
    localStorage.removeItem('chatUser')
    setCurrentUser(null)
    setShowLogin(true)
    setLoginUsername('')
  }

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !currentUser || !activeChannel || isSending) return

    setIsSending(true)
    const content = inputMessage.trim()
    setInputMessage('')
    setImagePreview(null)

    // Stop typing indicator
    sendTyping(activeChannel, false)
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    // Optimistically add message locally
    const optimisticMessage: ChatMessage = {
      id: `temp-${Date.now()}`,
      content,
      type: 'text',
      userId: currentUser.id,
      channelId: activeChannel,
      createdAt: new Date().toISOString(),
      user: {
        id: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
      },
    }
    addMessage(optimisticMessage)

    // Send via WebSocket (if connected)
    if (isConnected) {
      sendMessage(activeChannel, content, currentUser.id, currentUser.username, currentUser.avatar)
    }

    // Save to database
    try {
      await fetch('/api/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content,
          type: 'text',
          userId: currentUser.id,
          channelId: activeChannel,
        }),
      })
    } catch (error) {
      console.error('Failed to save message:', error)
    }

    setIsSending(false)
    inputRef.current?.focus()
  }

  const handleAiChat = async () => {
    if (!inputMessage.trim() || !currentUser || !activeChannel || isAiLoading) return

    const question = inputMessage.trim()
    setInputMessage('')
    setIsAiLoading(true)

    // Show user's question locally
    const questionMessage: ChatMessage = {
      id: `temp-q-${Date.now()}`,
      content: `🤖 ${question}`,
      type: 'ai-question',
      userId: currentUser.id,
      channelId: activeChannel,
      createdAt: new Date().toISOString(),
      user: {
        id: currentUser.id,
        username: currentUser.username,
        avatar: currentUser.avatar,
      },
    }
    addMessage(questionMessage)

    if (isConnected) {
      sendMessage(activeChannel, `🤖 ${question}`, currentUser.id, currentUser.username, currentUser.avatar, 'ai-question')
    }

    try {
      const res = await fetch('/api/chat/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: question,
          channelId: activeChannel,
          username: currentUser.username,
        }),
      })

      const data = await res.json()

      if (data.success) {
        const aiMessage = {
          id: `ai-${Date.now()}`,
          content: data.response,
          type: 'ai-response',
          userId: 'ai-assistant',
          channelId: activeChannel,
          createdAt: new Date().toISOString(),
          user: {
            id: 'ai-assistant',
            username: 'Z.ai Assistant',
            avatar: '#8b5cf6',
          },
        }
        addMessage(aiMessage as ChatMessage)

        // Browser notification for AI response
        sendNotif('Z.ai Assistant', {
          body: data.response.substring(0, 100) + (data.response.length > 100 ? '...' : ''),
          tag: `ai-${Date.now()}`,
        })

        const aiUser = await fetch('/api/chat/users').then(r => r.json()).then((users: any[]) => users.find((u: any) => u.username === 'Z.ai Assistant'))
        if (aiUser) {
          await fetch('/api/chat/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              content: data.response,
              type: 'ai-response',
              userId: aiUser.id,
              channelId: activeChannel,
            }),
          })
        }
      }
    } catch (error) {
      toast({
        title: 'AI Error',
        description: 'Gagal mendapatkan respons dari AI',
        variant: 'destructive',
      })
    }

    setIsAiLoading(false)
  }

  // =========== FILE UPLOAD ===========
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !currentUser || !activeChannel) return

    setIsUploading(true)

    try {
      // Show preview for images
      if (file.type.startsWith('image/')) {
        const reader = new FileReader()
        reader.onload = (ev) => {
          setImagePreview(ev.target?.result as string)
        }
        reader.readAsDataURL(file)
      }

      const formData = new FormData()
      formData.append('file', file)
      formData.append('channelId', activeChannel)
      formData.append('userId', currentUser.id)

      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (data.success) {
        const content = data.isImage
          ? `📷 ${file.name}\n${data.url}`
          : `📎 ${file.name} (${(file.size / 1024).toFixed(1)}KB)\n${data.url}`

        const uploadMessage: ChatMessage = {
          id: `upload-${Date.now()}`,
          content,
          type: data.isImage ? 'image' : 'file',
          userId: currentUser.id,
          channelId: activeChannel,
          createdAt: new Date().toISOString(),
          user: {
            id: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
          },
        }
        addMessage(uploadMessage)

        if (isConnected) {
          sendMessage(activeChannel, content, currentUser.id, currentUser.username, currentUser.avatar, data.isImage ? 'image' : 'file')
        }

        // Save to database
        await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            type: data.isImage ? 'image' : 'file',
            userId: currentUser.id,
            channelId: activeChannel,
          }),
        })

        toast({
          title: 'File terkirim! 📎',
          description: `${file.name} berhasil diupload`,
        })
      } else {
        toast({
          title: 'Upload gagal',
          description: data.error || 'Gagal mengupload file',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Upload error',
        description: 'Gagal mengupload file',
        variant: 'destructive',
      })
    }

    setImagePreview(null)
    setIsUploading(false)
    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  // =========== VOICE MESSAGE ===========
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/ogg',
      })
      
      audioChunksRef.current = []
      
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      
      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: mediaRecorder.mimeType })
        stream.getTracks().forEach(track => track.stop())
        await handleVoiceUpload(audioBlob)
      }
      
      mediaRecorderRef.current = mediaRecorder
      mediaRecorder.start()
      setIsRecording(true)
      
      toast({
        title: 'Merekam... 🎤',
        description: 'Klik tombol mic lagi untuk berhenti',
      })
    } catch (error) {
      toast({
        title: 'Gagal merekam',
        description: 'Pastikan browser punya akses mikrofon',
        variant: 'destructive',
      })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      setIsRecording(false)
    }
  }

  const handleVoiceUpload = async (audioBlob: Blob) => {
    if (!currentUser || !activeChannel) return

    try {
      const formData = new FormData()
      formData.append('audio', audioBlob, 'voice-message.webm')

      const res = await fetch('/api/chat/voice', {
        method: 'POST',
        body: formData,
      })

      const data = await res.json()

      if (data.success) {
        const content = `🎤 Pesan suara${data.transcription ? `: "${data.transcription}"` : ''}\n${data.audioUrl}`

        const voiceMessage: ChatMessage = {
          id: `voice-${Date.now()}`,
          content,
          type: 'voice',
          userId: currentUser.id,
          channelId: activeChannel,
          createdAt: new Date().toISOString(),
          user: {
            id: currentUser.id,
            username: currentUser.username,
            avatar: currentUser.avatar,
          },
        }
        addMessage(voiceMessage)

        if (isConnected) {
          sendMessage(activeChannel, content, currentUser.id, currentUser.username, currentUser.avatar, 'voice')
        }

        // Save to database
        await fetch('/api/chat/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            content,
            type: 'voice',
            userId: currentUser.id,
            channelId: activeChannel,
          }),
        })

        if (data.transcription) {
          toast({
            title: 'Pesan suara terkirim! 🎤',
            description: `Transkripsi: "${data.transcription.substring(0, 50)}..."`,
          })
        } else {
          toast({
            title: 'Pesan suara terkirim! 🎤',
          })
        }
      }
    } catch (error) {
      toast({
        title: 'Gagal mengirim suara',
        description: 'Upload pesan suara gagal',
        variant: 'destructive',
      })
    }
  }

  const handleInputChange = (value: string) => {
    setInputMessage(value)

    if (activeChannel && currentUser) {
      sendTyping(activeChannel, true)

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }

      typingTimeoutRef.current = setTimeout(() => {
        sendTyping(activeChannel, false)
      }, 2000)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  const handleCreateChannel = async () => {
    if (!newChannelName.trim()) return

    try {
      const res = await fetch('/api/chat/channels', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newChannelName.trim(),
          description: newChannelDesc.trim(),
          type: 'general',
        }),
      })

      const channel = await res.json()

      if (res.ok) {
        addChannel(channel)
        setActiveChannel(channel.id)
        setNewChannelName('')
        setNewChannelDesc('')
        setCreateDialogOpen(false)
        toast({
          title: 'Channel dibuat! 🎉',
          description: `Channel #${channel.name} berhasil dibuat.`,
        })
      } else {
        toast({
          title: 'Gagal membuat channel',
          description: channel.error || 'Nama channel sudah ada',
          variant: 'destructive',
        })
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Gagal membuat channel',
        variant: 'destructive',
      })
    }
  }

  const handleChannelSwitch = (channelId: string) => {
    if (channelId === activeChannel) return
    if (activeChannel) {
      leaveChannel(activeChannel)
    }
    setActiveChannel(channelId)
    joinChannel(channelId)
  }

  const activeChannelData = channels.find((c) => c.id === activeChannel)

  const getInitials = (name: string) => {
    return name.slice(0, 2).toUpperCase()
  }

  const formatTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr)
      return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return ''
    }
  }

  // =========== LOGIN SCREEN ===========
  if (showLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-slate-100 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 mb-4 shadow-lg">
              <MessageSquare className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-3xl font-bold text-foreground">ZChat</h1>
            <p className="text-muted-foreground mt-2">Chat internal tim Anda</p>
          </div>

          <div className="bg-card border rounded-2xl p-8 shadow-xl">
            <h2 className="text-xl font-semibold text-center mb-6">Masuk ke Chat</h2>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-muted-foreground mb-1.5 block">
                  Nama Pengguna
                </label>
                <Input
                  value={loginUsername}
                  onChange={(e) => setLoginUsername(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  placeholder="Masukkan nama Anda..."
                  className="h-12 text-base"
                  autoFocus
                />
              </div>
              <Button
                onClick={handleLogin}
                disabled={!loginUsername.trim()}
                className="w-full h-12 text-base font-semibold bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
              >
                Masuk
              </Button>
            </div>
          </div>

          <div className="text-center text-xs text-muted-foreground mt-6 space-y-1">
            <p>💬 Chat real-time · 🤖 AI Assistant · 📎 Upload file</p>
            <p>🎤 Pesan suara · 🔔 Notifikasi · 📱 Installable</p>
          </div>
        </div>
      </div>
    )
  }

  // =========== MAIN CHAT UI ===========
  return (
    <div className="min-h-screen flex bg-background">
      {/* Sidebar */}
      <div
        className={`${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        } fixed lg:relative lg:translate-x-0 z-40 w-72 h-screen bg-card border-r flex flex-col transition-transform duration-300`}
      >
        {/* Sidebar Header */}
        <div className="p-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                <MessageSquare className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-lg font-bold">ZChat</h1>
            </div>
            <div className="flex items-center gap-1">
              {isConnected ? (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Wifi className="w-4 h-4 text-emerald-500" />
                    </TooltipTrigger>
                    <TooltipContent>Tersambung</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <WifiOff className="w-4 h-4 text-red-500" />
                    </TooltipTrigger>
                    <TooltipContent>Tidak tersambung</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Notification bell */}
              {notifSupported && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          if (notifPermission !== 'granted') {
                            requestNotifPermission()
                          }
                        }}
                        className="p-1 rounded hover:bg-muted"
                      >
                        {notifPermission === 'granted' ? (
                          <Bell className="w-3.5 h-3.5 text-emerald-500" />
                        ) : (
                          <BellOff className="w-3.5 h-3.5 text-muted-foreground" />
                        )}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>
                      {notifPermission === 'granted' ? 'Notifikasi aktif' : 'Aktifkan notifikasi'}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              <Button variant="ghost" size="icon" className="lg:hidden h-8 w-8" onClick={() => setSidebarOpen(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Channels */}
        <div className="flex-1 overflow-y-auto">
          <div className="p-2">
            {/* Channel List */}
            <button
              onClick={() => setChannelsExpanded(!channelsExpanded)}
              className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-1">
                <ChevronDown className={`w-3 h-3 transition-transform ${channelsExpanded ? '' : '-rotate-90'}`} />
                Channel
              </span>
              <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Plus className="w-3.5 h-3.5 hover:text-foreground" onClick={(e) => e.stopPropagation()} />
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Buat Channel Baru</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 pt-2">
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Nama Channel</label>
                      <Input
                        value={newChannelName}
                        onChange={(e) => setNewChannelName(e.target.value)}
                        placeholder="contoh: proyek-baru"
                        onKeyDown={(e) => e.key === 'Enter' && handleCreateChannel()}
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium mb-1.5 block">Deskripsi</label>
                      <Input
                        value={newChannelDesc}
                        onChange={(e) => setNewChannelDesc(e.target.value)}
                        placeholder="Tentang apa channel ini?"
                      />
                    </div>
                    <Button onClick={handleCreateChannel} disabled={!newChannelName.trim()} className="w-full">
                      Buat Channel
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </button>

            {channelsExpanded && (
              <div className="space-y-0.5 mt-1">
                {channels.map((channel) => (
                  <button
                    key={channel.id}
                    onClick={() => handleChannelSwitch(channel.id)}
                    className={`flex items-center gap-2 w-full px-2 py-1.5 rounded-md text-sm transition-colors ${
                      activeChannel === channel.id
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                    }`}
                  >
                    {channel.type === 'announcement' ? (
                      <Megaphone className="w-4 h-4 shrink-0" />
                    ) : (
                      <Hash className="w-4 h-4 shrink-0" />
                    )}
                    <span className="truncate">{channel.name}</span>
                    {channel._count && channel._count.messages > 0 && (
                      <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0 h-4">
                        {channel._count.messages}
                      </Badge>
                    )}
                  </button>
                ))}
              </div>
            )}

            <Separator className="my-3" />

            {/* Online Users */}
            <button
              onClick={() => setUsersExpanded(!usersExpanded)}
              className="flex items-center justify-between w-full px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors"
            >
              <span className="flex items-center gap-1">
                <ChevronDown className={`w-3 h-3 transition-transform ${usersExpanded ? '' : '-rotate-90'}`} />
                Online ({onlineUsers.length})
              </span>
            </button>

            {usersExpanded && (
              <div className="space-y-0.5 mt-1">
                {onlineUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded-md text-sm text-muted-foreground"
                  >
                    <div className="relative">
                      <Avatar className="w-6 h-6">
                        <AvatarFallback
                          className="text-[10px] text-white font-medium"
                          style={{ backgroundColor: user.avatar }}
                        >
                          {getInitials(user.username)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-card" />
                    </div>
                    <span className="truncate">{user.username}</span>
                    {currentUser?.id === user.id && (
                      <span className="text-[10px] text-muted-foreground ml-auto">(Anda)</span>
                    )}
                  </div>
                ))}
                {onlineUsers.length === 0 && (
                  <p className="text-xs text-muted-foreground px-2 py-1">Belum ada yang online</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar Footer - Current User */}
        <div className="p-3 border-t">
          <div className="flex items-center gap-2">
            <div className="relative">
              <Avatar className="w-8 h-8">
                <AvatarFallback
                  className="text-xs text-white font-medium"
                  style={{ backgroundColor: currentUser?.avatar }}
                >
                  {currentUser ? getInitials(currentUser.username) : '??'}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{currentUser?.username}</p>
              <p className="text-[10px] text-emerald-500">Online</p>
            </div>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 text-muted-foreground" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Keluar</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="h-14 border-b flex items-center px-4 gap-3 bg-card shrink-0">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="w-5 h-5" />
          </Button>

          {activeChannelData ? (
            <>
              <Hash className="w-5 h-5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <h2 className="font-semibold truncate">{activeChannelData.name}</h2>
                <p className="text-xs text-muted-foreground truncate">
                  {activeChannelData.description || 'Tidak ada deskripsi'}
                </p>
              </div>
            </>
          ) : (
            <h2 className="font-semibold text-muted-foreground">Pilih channel</h2>
          )}

          <div className="ml-auto flex items-center gap-2">
            <Badge variant="outline" className="text-xs gap-1">
              <Users className="w-3 h-3" />
              {onlineUsers.length}
            </Badge>
          </div>
        </div>

        {/* Messages Area */}
        <div className="flex-1 overflow-hidden">
          <ScrollArea className="h-full">
            <div className="p-4 space-y-1">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                  <Hash className="w-12 h-12 mb-3 opacity-20" />
                  <p className="text-lg font-medium">Belum ada pesan</p>
                  <p className="text-sm">Mulai percakapan di channel ini!</p>
                </div>
              ) : (
                messages.map((msg, index) => {
                  const isCurrentUser = msg.userId === currentUser?.id
                  const isAiMessage = msg.type === 'ai-response' || msg.userId === 'ai-assistant'
                  const isAiQuestion = msg.type === 'ai-question'
                  const isImageMessage = msg.type === 'image'
                  const isFileMessage = msg.type === 'file'
                  const isVoiceMessage = msg.type === 'voice'
                  const showHeader =
                    index === 0 ||
                    messages[index - 1]?.userId !== msg.userId ||
                    (new Date(msg.createdAt).getTime() - new Date(messages[index - 1]?.createdAt).getTime() > 300000)

                  return (
                    <div
                      key={msg.id}
                      className={`group flex gap-3 px-2 py-0.5 rounded-lg hover:bg-muted/50 transition-colors ${
                        isAiMessage ? 'bg-violet-50 dark:bg-violet-950/20 border-l-2 border-violet-400' : ''
                      } ${isAiQuestion ? 'bg-amber-50 dark:bg-amber-950/20 border-l-2 border-amber-400' : ''}`}
                    >
                      {showHeader ? (
                        <>
                          <Avatar className="w-9 h-9 mt-0.5 shrink-0">
                            <AvatarFallback
                              className="text-xs text-white font-medium"
                              style={{ backgroundColor: isAiMessage ? '#8b5cf6' : isVoiceMessage ? '#14b8a6' : msg.user?.avatar || '#6b7280' }}
                            >
                              {isAiMessage ? (
                                <Bot className="w-4 h-4" />
                              ) : isVoiceMessage ? (
                                <Mic className="w-4 h-4" />
                              ) : (
                                getInitials(msg.user?.username || '??')
                              )}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <span
                                className={`font-semibold text-sm ${
                                  isAiMessage ? 'text-violet-700 dark:text-violet-400' : ''
                                } ${isCurrentUser ? 'text-primary' : ''}`}
                              >
                                {msg.user?.username || 'Unknown'}
                              </span>
                              {isAiMessage && (
                                <Badge className="bg-violet-100 text-violet-700 dark:bg-violet-900 dark:text-violet-300 text-[10px] px-1.5 py-0 h-4">
                                  AI
                                </Badge>
                              )}
                              {isVoiceMessage && (
                                <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 text-[10px] px-1.5 py-0 h-4">
                                  🎤 Suara
                                </Badge>
                              )}
                              <span className="text-[10px] text-muted-foreground">
                                {formatTime(msg.createdAt)}
                              </span>
                            </div>
                            <div className="mt-0.5">
                              <MessageContent 
                                content={msg.content} 
                                isAi={isAiMessage} 
                                isQuestion={isAiQuestion}
                                isImage={isImageMessage}
                                isFile={isFileMessage}
                                isVoice={isVoiceMessage}
                              />
                            </div>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-9 shrink-0" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline gap-2">
                              <MessageContent 
                                content={msg.content} 
                                isAi={isAiMessage} 
                                isQuestion={isAiQuestion}
                                isImage={isImageMessage}
                                isFile={isFileMessage}
                                isVoice={isVoiceMessage}
                              />
                              <span className="text-[10px] text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity">
                                {formatTime(msg.createdAt)}
                              </span>
                            </div>
                          </div>
                        </>
                      )}
                    </div>
                  )
                })
              )}

              {/* Typing indicator */}
              {typingUsers.length > 0 && (
                <div className="flex items-center gap-2 px-2 py-1 text-sm text-muted-foreground">
                  <div className="flex gap-1">
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-1.5 h-1.5 bg-muted-foreground rounded-full animate-bounce" />
                  </div>
                  <span>
                    {typingUsers.map((u) => u.username).join(', ')} sedang mengetik...
                  </span>
                </div>
              )}

              {/* AI Loading */}
              {isAiLoading && (
                <div className="flex gap-3 px-2 py-1 bg-violet-50 dark:bg-violet-950/20 border-l-2 border-violet-400 rounded-lg">
                  <Avatar className="w-9 h-9 mt-0.5 shrink-0">
                    <AvatarFallback className="text-xs text-white font-medium bg-violet-500">
                      <Bot className="w-4 h-4" />
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex items-center gap-2 py-2">
                    <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                    <span className="text-sm text-violet-600 dark:text-violet-400">AI sedang berpikir...</span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
        </div>

        {/* Image Preview */}
        {imagePreview && (
          <div className="px-4 py-2 border-t bg-card">
            <div className="flex items-center gap-2">
              <div className="relative w-16 h-16 rounded-lg overflow-hidden border">
                <img src={imagePreview} alt="Preview" className="w-full h-full object-cover" />
              </div>
              <span className="text-xs text-muted-foreground">Mengupload...</span>
              <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        )}

        {/* Message Input */}
        <div className="p-4 border-t bg-card">
          <div className="flex items-center gap-2">
            {/* File upload button */}
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              onChange={handleFileUpload}
            />
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={!activeChannel || isUploading}
                    className="h-9 w-9 shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    {isUploading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Paperclip className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload file/gambar</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            {/* Voice record button */}
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={isRecording ? stopRecording : startRecording}
                    disabled={!activeChannel}
                    className={`h-9 w-9 shrink-0 ${
                      isRecording
                        ? 'text-red-500 hover:text-red-600 bg-red-50 dark:bg-red-950 animate-pulse'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {isRecording ? (
                      <MicOff className="w-4 h-4" />
                    ) : (
                      <Mic className="w-4 h-4" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {isRecording ? 'Berhenti merekam' : 'Pesan suara'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <div className="flex-1 flex items-center gap-2 bg-background border rounded-xl px-4 py-2 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition-all">
              <input
                ref={inputRef}
                type="text"
                value={inputMessage}
                onChange={(e) => handleInputChange(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Kirim pesan ke #${activeChannelData?.name || '...'} `}
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                disabled={!activeChannel}
              />
            </div>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    size="icon"
                    variant="outline"
                    onClick={handleAiChat}
                    disabled={!inputMessage.trim() || !activeChannel || isAiLoading}
                    className="h-9 w-9 shrink-0 border-violet-200 hover:bg-violet-50 hover:text-violet-600 dark:border-violet-800 dark:hover:bg-violet-950"
                  >
                    {isAiLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-violet-500" />
                    ) : (
                      <Bot className="w-4 h-4 text-violet-500" />
                    )}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Tanya AI Assistant</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <Button
              size="icon"
              onClick={handleSendMessage}
              disabled={!inputMessage.trim() || !activeChannel}
              className="h-9 w-9 shrink-0 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700"
            >
              <Send className="w-4 h-4" />
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Enter</kbd> kirim ·{' '}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">📎</kbd> file ·{' '}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">🎤</kbd> suara ·{' '}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">🤖</kbd> AI
          </p>
        </div>
      </div>

      {/* Sidebar overlay for mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
    </div>
  )
}

// Message content component with special formatting for different types
function MessageContent({ content, isAi, isQuestion, isImage, isFile, isVoice }: { 
  content: string; isAi: boolean; isQuestion: boolean
  isImage: boolean; isFile: boolean; isVoice: boolean
}) {
  // Image message
  if (isImage) {
    const lines = content.split('\n')
    const imageUrl = lines[lines.length - 1]
    const fileName = lines[0].replace('📷 ', '')
    return (
      <div className="space-y-1">
        <span className="text-sm">{fileName}</span>
        <div className="relative rounded-lg overflow-hidden border max-w-xs">
          <img 
            src={imageUrl} 
            alt={fileName}
            className="w-full h-auto max-h-64 object-cover"
            loading="lazy"
          />
        </div>
      </div>
    )
  }

  // File message
  if (isFile) {
    const lines = content.split('\n')
    const fileUrl = lines[lines.length - 1]
    const fileInfo = lines[0].replace('📎 ', '')
    return (
      <a
        href={fileUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2 px-3 py-2 bg-muted rounded-lg text-sm hover:bg-muted/80 transition-colors"
      >
        <Download className="w-4 h-4" />
        <span>{fileInfo}</span>
      </a>
    )
  }

  // Voice message
  if (isVoice) {
    const lines = content.split('\n')
    const audioUrl = lines[lines.length - 1]
    const transcriptionLine = lines[0].replace('🎤 ', '')
    const transcription = transcriptionLine.startsWith('Pesan suara: ') 
      ? transcriptionLine.replace('Pesan suara: ', '').replace(/"/g, '')
      : ''
    return (
      <div className="space-y-1">
        <div className="inline-flex items-center gap-2 px-3 py-2 bg-teal-50 dark:bg-teal-950/30 rounded-lg">
          <Mic className="w-4 h-4 text-teal-600 dark:text-teal-400" />
          <audio controls className="h-8 max-w-[240px]" preload="metadata">
            <source src={audioUrl} />
          </audio>
        </div>
        {transcription && (
          <p className="text-xs text-muted-foreground italic">"{transcription}"</p>
        )}
      </div>
    )
  }

  // Strip the 🤖 prefix from AI questions
  const displayContent = isQuestion ? content.replace(/^🤖\s*/, '') : content

  // For AI responses
  if (isAi) {
    return (
      <div className="text-sm whitespace-pre-wrap break-words text-violet-900 dark:text-violet-200 leading-relaxed">
        {displayContent}
      </div>
    )
  }

  return (
    <span className="text-sm whitespace-pre-wrap break-words">{displayContent}</span>
  )
}
