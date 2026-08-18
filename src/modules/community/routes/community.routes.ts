import { FastifyInstance } from 'fastify'
import { CommunityController } from '../controller/community.controller'
import { CommunityService } from '../service/community.service'
import { authenticate } from '../../../middlewares/authenticate'
import { optionalAuth } from '../../../middlewares/optionalAuth'
import { asyncHandler } from '../../../lib/errors/errorHandler'

export async function communityRoutes(fastify: FastifyInstance) {
  const communityService = new CommunityService()
  const communityController = new CommunityController(communityService)

  fastify.get(
    '/api/v1/community/feed/:type',
    { preHandler: [optionalAuth] },
    asyncHandler(communityController.getFeed.bind(communityController)),
  )

  fastify.post(
    '/api/v1/community/discussions',
    { preHandler: [authenticate] },
    asyncHandler(communityController.createDiscussion.bind(communityController)),
  )

  fastify.post(
    '/api/v1/community/activities/:id/like',
    { preHandler: [authenticate] },
    asyncHandler(communityController.toggleLike.bind(communityController)),
  )

  fastify.post(
    '/api/v1/community/activities/:id/react',
    { preHandler: [authenticate] },
    asyncHandler(communityController.toggleReaction.bind(communityController)),
  )

  fastify.get(
    '/api/v1/community/activities/:id/comments',
    { preHandler: [optionalAuth] },
    asyncHandler(communityController.getComments.bind(communityController)),
  )

  fastify.post(
    '/api/v1/community/activities/:id/comments',
    { preHandler: [authenticate] },
    asyncHandler(communityController.addComment.bind(communityController)),
  )

  fastify.get(
    '/api/v1/community/tags/trending',
    asyncHandler(communityController.getTrendingTags.bind(communityController)),
  )

  fastify.get(
    '/api/v1/community/users/suggested',
    { preHandler: [optionalAuth] },
    asyncHandler(communityController.getSuggestedUsers.bind(communityController)),
  )

  fastify.post(
    '/api/v1/community/users/:id/follow',
    { preHandler: [authenticate] },
    asyncHandler(communityController.toggleFollow.bind(communityController)),
  )
}
