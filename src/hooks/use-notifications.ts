'use client'

import { useState, useCallback } from 'react'

export function useNotifications() {
  const [isSupported] = useState(() => typeof window !== 'undefined' && 'Notification' in window)
  const [permission, setPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission
    }
    return 'default'
  })

  const requestPermission = useCallback(async () => {
    if (!isSupported) return false

    const result = await Notification.requestPermission()
    setPermission(result)
    return result === 'granted'
  }, [isSupported])

  const notify = useCallback((title: string, options?: NotificationOptions) => {
    if (!isSupported || permission !== 'granted') return

    // Don't notify if the page is focused
    if (document.hasFocus()) return

    const notification = new Notification(title, {
      icon: '/logo.svg',
      badge: '/logo.svg',
      ...options,
    })

    notification.onclick = () => {
      window.focus()
      notification.close()
    }

    // Auto-close after 5 seconds
    setTimeout(() => notification.close(), 5000)
  }, [isSupported, permission])

  return {
    isSupported,
    permission,
    requestPermission,
    notify,
  }
}
