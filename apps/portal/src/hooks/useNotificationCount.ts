import { useQuery } from '@tanstack/react-query'
import { api } from '../lib/api'

interface UnreadCountResponse {
  count?: number
  unreadCount?: number
}

export function useNotificationCount() {
  const query = useQuery({
    queryKey: ['notification-unread-count'],
    queryFn: async () => {
      try {
        const response = await api.get<UnreadCountResponse>('/notify/notifications/unread-count')
        return response.data.count ?? response.data.unreadCount ?? 0
      } catch {
        return 0
      }
    },
    refetchInterval: 30_000,
    retry: false,
  })

  return {
    count: query.data ?? 0,
  }
}
