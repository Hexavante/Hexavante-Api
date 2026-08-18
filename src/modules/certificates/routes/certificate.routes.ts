import { FastifyInstance } from "fastify";
import { CertificateController } from "../controller/certificate.controller";
import { CertificateService } from "../service/certificate.service";
import { CertificateRepository } from "../repository/certificate.repository";
import { authenticate } from "../../../middlewares/authenticate";
import { asyncHandler } from "../../../lib/errors/errorHandler";
import { issueCertificateSchema, verifyCertificateSchema } from "../schemas/certificate.schemas";
import { validateBody, validateParams } from "../../../lib/validation/validate";

export async function certificateRoutes(fastify: FastifyInstance) {
  const repository = new CertificateRepository();
  const service = new CertificateService();
  const controller = new CertificateController(service);

  fastify.get(
    "/api/v1/certificates",
    { preHandler: [authenticate] },
    asyncHandler(controller.getUserCertificates.bind(controller)),
  );

  fastify.post(
    "/api/v1/certificates",
    { preHandler: [authenticate, validateBody(issueCertificateSchema)] },
    asyncHandler(controller.issueCertificate.bind(controller)),
  );

  fastify.get(
    "/api/v1/certificates/verify/:code",
    { preHandler: [validateParams(verifyCertificateSchema)] },
    asyncHandler(controller.verifyCertificate.bind(controller)),
  );
}