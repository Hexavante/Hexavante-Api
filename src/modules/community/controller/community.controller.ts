import { FastifyRequest, FastifyReply } from 'fastify'
import { CommunityService } from '../service/community.service'
import { createDiscussionSchema, addCommentSchema, reactSchema, reportSchema } from '../schemas/community.schemas'
import { validateBody, validateParams } from '../../../lib/validation/validate'

export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  async getFeed(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user?.id
    const { type } = request.params as { type: string }
    const feed = await this.communityService.getFeed(userId, type as any)
    reply.send(feed)
  }

  async createDiscussion(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(createDiscussionSchema)(request, reply)
    const userId = request.user!.id
    const body = request.body as { title: string; body: string; tags?: string[] }
    const activity = await this.communityService.createDiscussion(userId, body)
    reply.status(201).send(activity)
  }

  async toggleLike(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id
    const { id } = request.params as { id: string }
    const result = await this.communityService.toggleLike(userId, id)
    reply.send(result)
  }

  async toggleReaction(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(reactSchema)(request, reply)
    const userId = request.user!.id
    const { id } = request.params as { id: string }
    const { type } = request.body as { type: string }
    const result = await this.communityService.toggleReaction(userId, id, type)
    reply.send(result)
  }

  async getComments(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user?.id
    const { id } = request.params as { id: string }
    const comments = await this.communityService.getComments(userId, id)
    reply.send(comments)
  }

  async addComment(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    await validateBody(addCommentSchema)(request, reply)
    const userId = request.user!.id
    const { id } = request.params as { id: string }
    const { content } = request.body as { content: string }
    const comment = await this.communityService.addComment(userId, id, content)
    reply.status(201).send(comment)
  }

  async getTrendingTags(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const tags = await this.communityService.getTrendingTags()
    reply.send(tags)
  }

  async getSuggestedUsers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user?.id
    const users = await this.communityService.getSuggestedUsers(userId)
    reply.send(users)
  }

  async toggleFollow(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const userId = request.user!.id
    const { id } = request.params as { id: string }
    const result = await this.communityService.toggleFollow(userId, id)
    reply.send(result)
  }
}
