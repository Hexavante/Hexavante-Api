export interface FeedActivityView {
  id: string
  type: string
  user: {
    id: string
    username: string | null
    fullName: string
    avatarUrl: string | null
  }
  metadata: Record<string, unknown>
  tags: string[]
  likes: number
  comments: number
  reactions: Record<string, number>
  likedByViewer: boolean
  viewerReactions: string[]
  isPinned: boolean
  createdAt: string
}

export interface ActivityCommentView {
  id: string
  content: string
  isAccepted: boolean
  likes: number
  likedByViewer: boolean
  user: {
    id: string
    username: string | null
    fullName: string
    avatarUrl: string | null
  }
  createdAt: string
}

export interface TrendingTagView {
  tag: string
  count: number
}

export interface SuggestedUserView {
  id: string
  username: string | null
  fullName: string
  avatarUrl: string | null
  followerCount: number
}
