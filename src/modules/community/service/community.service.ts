import { Prisma } from '@prisma/client'
import { prisma } from '../../../config/prisma'
import { NotFoundError, BadRequestError } from '../../../lib/errors/AppError'
import type { FeedActivityView, ActivityCommentView } from '../types/community.types'

type FeedType = 'explore' | 'following' | 'questions'

export class CommunityService {
  async getFeed(userId: string | undefined, type: FeedType): Promise<FeedActivityView[]> {
    const where: Record<string, unknown> = {}

    if (type === 'following' && userId) {
      const following = await prisma.userFollow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      })
      where.userId = { in: following.map((f) => f.followingId) }
    }

    if (type === 'questions') {
      where.type = 'DISCUSSION'
    }

    const activities = await prisma.socialActivity.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
        _count: { select: { likes: true, comments: true } },
        reactions: { select: { type: true, userId: true } },
        likes: userId ? { where: { userId }, select: { id: true } } : false,
      },
      orderBy: [{ isPinned: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    })

    return activities.map((a) => {
      const reactionCounts: Record<string, number> = {}
      a.reactions.forEach((r) => {
        reactionCounts[r.type] = (reactionCounts[r.type] || 0) + 1
      })

      const viewerReactions = userId
        ? a.reactions.filter((r) => r.userId).map((r) => r.type)
        : []

      return {
        id: a.id,
        type: a.type,
        user: a.user,
        metadata: a.metadata as Record<string, unknown>,
        tags: (a.tags as string[]) ?? [],
        likes: a._count.likes,
        comments: a._count.comments,
        reactions: reactionCounts,
        likedByViewer: userId ? (a.likes as unknown[]).length > 0 : false,
        viewerReactions,
        isPinned: a.isPinned,
        createdAt: a.createdAt.toISOString(),
      }
    })
  }

  async createDiscussion(userId: string, data: { title: string; body: string; tags?: string[] }) {
    const activity = await prisma.socialActivity.create({
      data: {
        userId,
        type: 'DISCUSSION',
        metadata: { title: data.title, body: data.body },
        tags: data.tags ?? [],
      },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
      },
    })

    return {
      id: activity.id,
      type: activity.type,
      user: activity.user,
      metadata: activity.metadata as Record<string, unknown>,
      tags: (activity.tags as string[]) ?? [],
      likes: 0,
      comments: 0,
      reactions: {},
      likedByViewer: false,
      viewerReactions: [],
      isPinned: false,
      createdAt: activity.createdAt.toISOString(),
    }
  }

  async toggleLike(userId: string, activityId: string): Promise<{ liked: boolean }> {
    const activity = await prisma.socialActivity.findUnique({ where: { id: activityId } })
    if (!activity) throw new NotFoundError('Publicação não encontrada')

    const existing = await prisma.activityLike.findUnique({
      where: { activityId_userId: { activityId, userId } },
    })

    if (existing) {
      await prisma.activityLike.delete({ where: { id: existing.id } })
      return { liked: false }
    }

    await prisma.activityLike.create({ data: { activityId, userId } })
    return { liked: true }
  }

  async toggleReaction(userId: string, activityId: string, type: string): Promise<{ active: boolean }> {
    const activity = await prisma.socialActivity.findUnique({ where: { id: activityId } })
    if (!activity) throw new NotFoundError('Publicação não encontrada')

    const existing = await prisma.activityReaction.findUnique({
      where: { activityId_userId_type: { activityId, userId, type: type as any } },
    })

    if (existing) {
      await prisma.activityReaction.delete({ where: { id: existing.id } })
      return { active: false }
    }

    await prisma.activityReaction.create({
      data: { activityId, userId, type: type as any },
    })
    return { active: true }
  }

  async getComments(userId: string | undefined, activityId: string): Promise<ActivityCommentView[]> {
    const comments = await prisma.activityComment.findMany({
      where: { activityId },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
        _count: { select: { likes: true } },
        likes: userId ? { where: { userId }, select: { id: true } } : false,
      },
      orderBy: { createdAt: 'asc' },
    })

    return comments.map((c) => ({
      id: c.id,
      content: c.content,
      isAccepted: c.isAccepted,
      likes: c._count.likes,
      likedByViewer: userId ? (c.likes as unknown[]).length > 0 : false,
      user: c.user,
      createdAt: c.createdAt.toISOString(),
    }))
  }

  async addComment(userId: string, activityId: string, content: string) {
    const activity = await prisma.socialActivity.findUnique({ where: { id: activityId } })
    if (!activity) throw new NotFoundError('Publicação não encontrada')

    const comment = await prisma.activityComment.create({
      data: { activityId, userId, content },
      include: {
        user: { select: { id: true, username: true, fullName: true, avatarUrl: true } },
      },
    })

    return {
      id: comment.id,
      content: comment.content,
      isAccepted: comment.isAccepted,
      likes: 0,
      likedByViewer: false,
      user: comment.user,
      createdAt: comment.createdAt.toISOString(),
    }
  }

  async getTrendingTags(): Promise<{ tag: string; count: number }[]> {
    const activities = await prisma.socialActivity.findMany({
      where: { tags: { not: Prisma.DbNull } },
      select: { tags: true },
      take: 200,
    })

    const tagCounts = new Map<string, number>()
    activities.forEach((a) => {
      const tags = a.tags as string[]
      tags?.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
      })
    })

    return Array.from(tagCounts.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)
  }

  async getSuggestedUsers(userId: string | undefined) {
    const excludeIds = [userId].filter(Boolean) as string[]

    if (userId) {
      const following = await prisma.userFollow.findMany({
        where: { followerId: userId },
        select: { followingId: true },
      })
      excludeIds.push(...following.map((f) => f.followingId))
    }

    const users = await prisma.user.findMany({
      where: { id: { notIn: excludeIds } },
      select: {
        id: true,
        username: true,
        fullName: true,
        avatarUrl: true,
        _count: { select: { followers: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    })

    return users.map((u) => ({
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      avatarUrl: u.avatarUrl,
      followerCount: u._count.followers,
    }))
  }

  async toggleFollow(followerId: string, followingId: string): Promise<{ following: boolean }> {
    if (followerId === followingId) throw new BadRequestError('Você não pode seguir a si mesmo')

    const target = await prisma.user.findUnique({ where: { id: followingId } })
    if (!target) throw new NotFoundError('Usuário não encontrado')

    const existing = await prisma.userFollow.findUnique({
      where: { followerId_followingId: { followerId, followingId } },
    })

    if (existing) {
      await prisma.userFollow.delete({ where: { id: existing.id } })
      return { following: false }
    }

    await prisma.userFollow.create({ data: { followerId, followingId } })
    return { following: true }
  }
}
