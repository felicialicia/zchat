'use client'

import { useState, useEffect, useRef } from 'react'
import { CallState, IncomingCallData } from '@/hooks/use-webrtc'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Phone,
  PhoneOff,
  Video,
  VideoOff,
  Mic,
  MicOff,
  PhoneCall,
  MonitorSmartphone,
  X,
} from 'lucide-react'

interface CallUIProps {
  callState: CallState
  incomingCall: IncomingCallData | null
  localStream: MediaStream | null
  remoteStream: MediaStream | null
  onAnswerCall: () => void
  onRejectCall: () => void
  onEndCall: () => void
  onToggleCamera: () => boolean
  onToggleMicrophone: () => boolean
  onStartCall: (userId: string, userName: string, userAvatar: string, type: 'audio' | 'video') => void
  onlineUsers: { id: string; username: string; avatar: string }[]
  currentUserId: string | null
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

export function CallUI({
  callState,
  incomingCall,
  localStream,
  remoteStream,
  onAnswerCall,
  onRejectCall,
  onEndCall,
  onToggleCamera,
  onToggleMicrophone,
  onStartCall,
  onlineUsers,
  currentUserId,
}: CallUIProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isCameraOff, setIsCameraOff] = useState(false)
  const [showCallMenu, setShowCallMenu] = useState(false)
  const [selectedCallType, setSelectedCallType] = useState<'audio' | 'video'>('audio')
  const [selectedUser, setSelectedUser] = useState<{ id: string; name: string; avatar: string } | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)

  // Attach local stream to video element
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  // Attach remote stream to video element
  useEffect(() => {
    if (remoteVideoRef.current && remoteStream) {
      remoteVideoRef.current.srcObject = remoteStream
    }
  }, [remoteStream])

  const handleToggleMic = () => {
    const enabled = onToggleMicrophone()
    setIsMuted(!enabled)
  }

  const handleToggleCamera = () => {
    const enabled = onToggleCamera()
    setIsCameraOff(!enabled)
  }

  const handleStartCall = (userId: string, userName: string, userAvatar: string, type: 'audio' | 'video') => {
    onStartCall(userId, userName, userAvatar, type)
    setShowCallMenu(false)
    setSelectedUser(null)
    setIsMuted(false)
    setIsCameraOff(false)
  }

  // Get initials
  const getInitials = (name: string) => name.slice(0, 2).toUpperCase()

  // ============ INCOMING CALL OVERLAY ============
  if (incomingCall && !callState.isInCall) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
        <div className="bg-card rounded-3xl p-8 shadow-2xl max-w-sm w-full mx-4 text-center space-y-6 animate-in zoom-in-95 duration-300">
          {/* Caller avatar */}
          <div className="flex flex-col items-center gap-3">
            <div className="relative">
              <Avatar className="w-20 h-20">
                <AvatarFallback
                  className="text-2xl text-white font-bold"
                  style={{ backgroundColor: incomingCall.callerAvatar }}
                >
                  {getInitials(incomingCall.callerName)}
                </AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 w-8 h-8 rounded-full flex items-center justify-center bg-emerald-500 animate-pulse">
                {incomingCall.callType === 'video' ? (
                  <Video className="w-4 h-4 text-white" />
                ) : (
                  <Phone className="w-4 h-4 text-white" />
                )}
              </div>
            </div>
            <div>
              <h2 className="text-xl font-bold">{incomingCall.callerName}</h2>
              <p className="text-sm text-muted-foreground mt-1">
                {incomingCall.callType === 'video' ? '📞 Video call masuk...' : '📞 Panggilan suara masuk...'}
              </p>
            </div>
          </div>

          {/* Ringing animation */}
          <div className="flex justify-center gap-2">
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
            <div className="w-3 h-3 bg-emerald-500 rounded-full animate-bounce" />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-6">
            <Button
              onClick={onRejectCall}
              className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
              size="icon"
            >
              <PhoneOff className="w-7 h-7" />
            </Button>
            <Button
              onClick={onAnswerCall}
              className="w-16 h-16 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/30"
              size="icon"
            >
              <Phone className="w-7 h-7" />
            </Button>
          </div>
          <div className="flex justify-between px-8 text-xs text-muted-foreground">
            <span>Tolak</span>
            <span>Angkat</span>
          </div>
        </div>
      </div>
    )
  }

  // ============ ACTIVE CALL OVERLAY ============
  if (callState.isInCall) {
    const isVideo = callState.callType === 'video'

    return (
      <div className="fixed inset-0 z-50 bg-gray-900 flex flex-col">
        {/* Video area */}
        {isVideo ? (
          <div className="flex-1 relative overflow-hidden">
            {/* Remote video (full screen) */}
            {remoteStream && (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            )}

            {/* Local video (picture-in-picture) */}
            <div className="absolute top-4 right-4 w-36 h-48 rounded-2xl overflow-hidden border-2 border-white/20 shadow-xl">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${isCameraOff ? 'hidden' : ''}`}
              />
              {isCameraOff && (
                <div className="w-full h-full bg-gray-800 flex items-center justify-center">
                  <VideoOff className="w-8 h-8 text-gray-500" />
                </div>
              )}
            </div>

            {/* Call info overlay */}
            <div className="absolute top-4 left-4 text-white">
              <h2 className="text-lg font-bold">{callState.targetUserName}</h2>
              <p className="text-sm text-white/70">
                {callState.isRinging ? 'Menghubungi...' : formatDuration(callState.callDuration)}
              </p>
            </div>
          </div>
        ) : (
          /* Audio call screen */
          <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
            {/* Avatar */}
            <div className="relative">
              <Avatar className="w-28 h-28">
                <AvatarFallback
                  className="text-3xl text-white font-bold"
                  style={{ backgroundColor: callState.targetUserAvatar }}
                >
                  {getInitials(callState.targetUserName)}
                </AvatarFallback>
              </Avatar>
              {/* Sound wave animation */}
              {!callState.isRinging && (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-400/30 animate-ping" />
                  <div className="absolute inset-0 rounded-full border-2 border-emerald-400/20 animate-ping [animation-delay:0.5s]" />
                </>
              )}
            </div>

            <div className="text-center">
              <h2 className="text-2xl font-bold text-white">{callState.targetUserName}</h2>
              <p className="text-white/60 mt-2">
                {callState.isRinging ? 'Menghubungi...' : formatDuration(callState.callDuration)}
              </p>
            </div>

            {/* Hidden video elements for audio-only call */}
            <video ref={localVideoRef} autoPlay playsInline muted className="hidden" />
            <video ref={remoteVideoRef} autoPlay playsInline className="hidden" />
          </div>
        )}

        {/* Call controls */}
        <div className="p-6 flex items-center justify-center gap-4">
          <Button
            onClick={handleToggleMic}
            className={`w-14 h-14 rounded-full ${isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-white/30'} text-white`}
            size="icon"
          >
            {isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
          </Button>

          {isVideo && (
            <Button
              onClick={handleToggleCamera}
              className={`w-14 h-14 rounded-full ${isCameraOff ? 'bg-red-500 hover:bg-red-600' : 'bg-white/20 hover:bg-white/30'} text-white`}
              size="icon"
            >
              {isCameraOff ? <VideoOff className="w-6 h-6" /> : <Video className="w-6 h-6" />}
            </Button>
          )}

          <Button
            onClick={onEndCall}
            className="w-16 h-16 rounded-full bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/30"
            size="icon"
          >
            <PhoneOff className="w-7 h-7" />
          </Button>
        </div>
      </div>
    )
  }

  // ============ CALL INITIATION MENU (from online users) ============
  const otherUsers = onlineUsers.filter(u => u.id !== currentUserId)

  return (
    <>
      {/* Call button in sidebar - opens call menu */}
      {otherUsers.length > 0 && (
        <div className="relative">
          {/* Floating call button */}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-2 text-xs mt-2"
            onClick={() => setShowCallMenu(!showCallMenu)}
          >
            <PhoneCall className="w-3.5 h-3.5" />
            <span>Panggil</span>
          </Button>

          {/* Call menu dropdown */}
          {showCallMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setShowCallMenu(false)} />
              <div className="absolute bottom-full left-0 mb-2 w-64 bg-card border rounded-xl shadow-2xl z-50 overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
                <div className="p-3 border-b">
                  <h3 className="text-sm font-semibold">Panggil User</h3>
                  <p className="text-xs text-muted-foreground">Pilih user & tipe panggilan</p>
                </div>
                <div className="max-h-60 overflow-y-auto">
                  {otherUsers.map((user) => (
                    <div
                      key={user.id}
                      className="flex items-center justify-between px-3 py-2 hover:bg-muted transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Avatar className="w-7 h-7">
                          <AvatarFallback
                            className="text-[10px] text-white font-medium"
                            style={{ backgroundColor: user.avatar }}
                          >
                            {getInitials(user.username)}
                          </AvatarFallback>
                        </Avatar>
                        <span className="text-sm truncate">{user.username}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          onClick={() => handleStartCall(user.id, user.username, user.avatar, 'audio')}
                        >
                          <Phone className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-violet-600 hover:text-violet-700 hover:bg-violet-50"
                          onClick={() => handleStartCall(user.id, user.username, user.avatar, 'video')}
                        >
                          <Video className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
