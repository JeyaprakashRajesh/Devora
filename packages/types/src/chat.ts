export type ChannelType = 'public' | 'private' | 'dm' | 'thread'
export type MessageContentType = 'markdown' | 'system' | 'card'

export interface Channel {
  id: string
  orgId: string
  projectId?: string
  name: string
  type: ChannelType
  createdBy: string
}

export interface Message {
  id: string
  channelId: string
  threadId?: string
  authorId: string
  content: string
  contentType: MessageContentType
  mentions: string[]
  reactions: Record<string, string[]>
  contextRef?: { type: 'pr' | 'issue' | 'deploy'; id: string }
  createdAt: Date
  editedAt?: Date
  deletedAt?: Date
}
