'use client'

import { io, Socket } from 'socket.io-client'

function getSocketUrl() {
  // Production: use the Railway Socket.io URL
  if (process.env.NEXT_PUBLIC_SOCKET_URL) {
    return process.env.NEXT_PUBLIC_SOCKET_URL
  }
  // Sandbox: use Caddy gateway with XTransformPort
  return undefined // will use relative path with XTransformPort
}

let socketInstance: Socket | null = null

export function getSharedSocket(): Socket {
  if (!socketInstance) {
    const socketUrl = getSocketUrl()

    if (socketUrl) {
      // Production: connect directly to Railway
      socketInstance = io(socketUrl, {
        transports: ['websocket', 'polling'],
        forceNew: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 10000,
      })
    } else {
      // Sandbox: use Caddy gateway with XTransformPort
      socketInstance = io({
        path: '/socket.io',
        transports: ['polling', 'websocket'],
        forceNew: false,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 1000,
        timeout: 10000,
        query: {
          XTransformPort: '3099'
        }
      })
    }
  }

  return socketInstance
}

export function disconnectSharedSocket() {
  if (socketInstance) {
    socketInstance.disconnect()
    socketInstance = null
  }
}
