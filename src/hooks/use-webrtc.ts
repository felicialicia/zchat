'use client'

import { useRef, useCallback, useEffect, useState } from 'react'
import { io, Socket } from 'socket.io-client'
import { useChatStore } from '@/lib/chat-store'

// Free Google STUN servers for NAT traversal
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
}

export interface IncomingCallData {
  callerId: string
  callerName: string
  callerAvatar: string
  callType: 'audio' | 'video'
  offer: RTCSessionDescriptionInit
}

export interface CallState {
  isInCall: boolean
  isCallInitiator: boolean
  callType: 'audio' | 'video'
  targetUserId: string
  targetUserName: string
  targetUserAvatar: string
  isRinging: boolean
  callDuration: number
}

export function useWebRTC() {
  const socketRef = useRef<Socket | null>(null)
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)
  const callTimerRef = useRef<NodeJS.Timeout | null>(null)

  const { currentUser } = useChatStore()

  const [callState, setCallState] = useState<CallState>({
    isInCall: false,
    isCallInitiator: false,
    callType: 'audio',
    targetUserId: '',
    targetUserName: '',
    targetUserAvatar: '',
    isRinging: false,
    callDuration: 0,
  })

  const [incomingCall, setIncomingCall] = useState<IncomingCallData | null>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null)

  // ============ Declare functions BEFORE useEffect that uses them ============

  // Start call timer
  const startCallTimer = useCallback(() => {
    setCallState(prev => ({ ...prev, callDuration: 0 }))
    callTimerRef.current = setInterval(() => {
      setCallState(prev => ({ ...prev, callDuration: prev.callDuration + 1 }))
    }, 1000)
  }, [])

  // Cleanup call resources
  const cleanupCall = useCallback(() => {
    if (callTimerRef.current) {
      clearInterval(callTimerRef.current)
      callTimerRef.current = null
    }

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop())
      localStreamRef.current = null
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close()
      peerConnectionRef.current = null
    }

    setLocalStream(null)
    setRemoteStream(null)
    setIncomingCall(null)
    setCallState({
      isInCall: false,
      isCallInitiator: false,
      callType: 'audio',
      targetUserId: '',
      targetUserName: '',
      targetUserAvatar: '',
      isRinging: false,
      callDuration: 0,
    })
  }, [])

  // ============ Socket connection & WebRTC signaling ============

  // Initialize socket connection for calls
  useEffect(() => {
    const socketInstance = io('/?XTransformPort=3003', {
      transports: ['websocket', 'polling'],
      forceNew: false,
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 10000,
    })

    socketRef.current = socketInstance

    // Re-authenticate when connected
    socketInstance.on('connect', () => {
      if (currentUser) {
        socketInstance.emit('auth', {
          userId: currentUser.id,
          username: currentUser.username,
          avatar: currentUser.avatar,
        })
      }
    })

    // Listen for incoming calls
    socketInstance.on('incoming-call', (data: IncomingCallData) => {
      console.log('[WebRTC] Incoming call from', data.callerName)
      setIncomingCall(data)
    })

    // Listen for call answered
    socketInstance.on('call-answered', async (data: { answer: RTCSessionDescriptionInit }) => {
      console.log('[WebRTC] Call answered')
      if (peerConnectionRef.current) {
        try {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer))
          setCallState(prev => ({ ...prev, isRinging: false }))
          startCallTimer()
        } catch (err) {
          console.error('[WebRTC] Error setting remote description:', err)
        }
      }
    })

    // Listen for call rejected
    socketInstance.on('call-rejected', () => {
      console.log('[WebRTC] Call rejected')
      cleanupCall()
    })

    // Listen for call ended
    socketInstance.on('call-ended', () => {
      console.log('[WebRTC] Call ended by remote')
      cleanupCall()
    })

    // Listen for ICE candidates from remote
    socketInstance.on('ice-candidate', async (data: { candidate: RTCIceCandidateInit }) => {
      if (peerConnectionRef.current && data.candidate) {
        try {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate))
        } catch (err) {
          console.error('[WebRTC] Error adding ICE candidate:', err)
        }
      }
    })

    // Listen for call failed
    socketInstance.on('call-failed', (data: { reason: string }) => {
      console.error('[WebRTC] Call failed:', data.reason)
      cleanupCall()
    })

    return () => {
      socketInstance.disconnect()
    }
  }, [currentUser, startCallTimer, cleanupCall])

  // Create peer connection
  const createPeerConnection = useCallback(() => {
    const pc = new RTCPeerConnection(ICE_SERVERS)

    // Handle ICE candidates (send to remote)
    pc.onicecandidate = (event) => {
      if (event.candidate && callState.targetUserId && socketRef.current) {
        socketRef.current.emit('ice-candidate', {
          targetUserId: callState.targetUserId,
          candidate: event.candidate.toJSON(),
        })
      }
    }

    // Handle remote stream
    pc.ontrack = (event) => {
      console.log('[WebRTC] Remote track received')
      const stream = event.streams[0]
      remoteStreamRef.current = stream
      setRemoteStream(stream)
    }

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      console.log('[WebRTC] Connection state:', pc.connectionState)
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        cleanupCall()
      }
    }

    pc.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', pc.iceConnectionState)
      if (pc.iceConnectionState === 'disconnected' || pc.iceConnectionState === 'failed') {
        cleanupCall()
      }
    }

    return pc
  }, [callState.targetUserId, cleanupCall])

  // Initiate a call
  const startCall = useCallback(async (targetUserId: string, targetUserName: string, targetUserAvatar: string, callType: 'audio' | 'video') => {
    if (!currentUser || !socketRef.current) return

    try {
      // Get media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: callType === 'video',
      })

      localStreamRef.current = stream
      setLocalStream(stream)

      // Create peer connection
      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      // Add local tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })

      // Create offer
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)

      // Update state
      setCallState({
        isInCall: true,
        isCallInitiator: true,
        callType,
        targetUserId,
        targetUserName,
        targetUserAvatar,
        isRinging: true,
        callDuration: 0,
      })

      // Send call signal
      socketRef.current.emit('call-user', {
        targetUserId,
        callerId: currentUser.id,
        callerName: currentUser.username,
        callerAvatar: currentUser.avatar,
        callType,
        offer,
      })

      console.log(`[WebRTC] Calling ${targetUserName} (${callType})`)
    } catch (err) {
      console.error('[WebRTC] Error starting call:', err)
      cleanupCall()
    }
  }, [currentUser, createPeerConnection, cleanupCall])

  // Answer an incoming call
  const answerCall = useCallback(async () => {
    if (!incomingCall || !socketRef.current) return

    try {
      // Get media stream
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incomingCall.callType === 'video',
      })

      localStreamRef.current = stream
      setLocalStream(stream)

      // Create peer connection
      const pc = createPeerConnection()
      peerConnectionRef.current = pc

      // Add local tracks
      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream)
      })

      // Set remote description (the offer)
      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer))

      // Create answer
      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)

      // Send answer signal
      socketRef.current.emit('answer-call', {
        callerId: incomingCall.callerId,
        answer,
      })

      // Update state
      setCallState({
        isInCall: true,
        isCallInitiator: false,
        callType: incomingCall.callType,
        targetUserId: incomingCall.callerId,
        targetUserName: incomingCall.callerName,
        targetUserAvatar: incomingCall.callerAvatar,
        isRinging: false,
        callDuration: 0,
      })

      setIncomingCall(null)
      startCallTimer()

      console.log(`[WebRTC] Answered call from ${incomingCall.callerName}`)
    } catch (err) {
      console.error('[WebRTC] Error answering call:', err)
      cleanupCall()
    }
  }, [incomingCall, createPeerConnection, cleanupCall, startCallTimer])

  // Reject an incoming call
  const rejectCall = useCallback(() => {
    if (!incomingCall || !socketRef.current) return

    socketRef.current.emit('reject-call', {
      callerId: incomingCall.callerId,
    })

    setIncomingCall(null)
    console.log('[WebRTC] Call rejected')
  }, [incomingCall])

  // End the current call
  const endCall = useCallback(() => {
    if (!socketRef.current) return

    socketRef.current.emit('end-call', {
      targetUserId: callState.targetUserId,
    })

    cleanupCall()
    console.log('[WebRTC] Call ended')
  }, [callState.targetUserId, cleanupCall])

  // Toggle camera on/off during video call
  const toggleCamera = useCallback(() => {
    if (localStreamRef.current) {
      const videoTrack = localStreamRef.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        return videoTrack.enabled
      }
    }
    return false
  }, [])

  // Toggle microphone on/off during call
  const toggleMicrophone = useCallback(() => {
    if (localStreamRef.current) {
      const audioTrack = localStreamRef.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        return audioTrack.enabled
      }
    }
    return false
  }, [])

  return {
    callState,
    incomingCall,
    localStream,
    remoteStream,
    startCall,
    answerCall,
    rejectCall,
    endCall,
    toggleCamera,
    toggleMicrophone,
  }
}
