import type { FastifyRequest, FastifyReply } from "fastify";
import { CertificateService } from "../service/certificate.service";
import { asyncHandler } from "../../../lib/errors/errorHandler";
import type { Certificate } from "../types/certificate.types";

export class CertificateController {
  constructor(private service: CertificateService) {}

  getUserCertificates = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const certificates = await this.service.getUserCertificates(userId);

    return reply.send({
      success: true,
      certificates: certificates.map((cert: Certificate) => ({
        id: cert.id,
        code: cert.code,
        issuedAt: cert.issuedAt.toISOString(),
        course: {
          title: cert.course.title,
          categoryName: cert.course.category.name,
        },
        user: cert.user,
      })),
    });
  });

  issueCertificate = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const userId = (request.user as { id: string }).id;
    const { courseId } = request.body as { courseId: string };
    const certificate = await this.service.issueCertificate(userId, courseId);

    return reply.status(201).send({
      success: true,
      certificate: {
        id: certificate.id,
        code: certificate.code,
        issuedAt: certificate.issuedAt.toISOString(),
        courseTitle: certificate.course.title,
      },
    });
  });

  verifyCertificate = asyncHandler(async (request: FastifyRequest, reply: FastifyReply) => {
    const { code } = request.params as { code: string };
    const certificate = await this.service.verifyCertificate(code);

    return reply.send({
      success: true,
      certificate: {
        id: certificate.id,
        code: certificate.code,
        issuedAt: certificate.issuedAt.toISOString(),
        verifiedAt: certificate.verifiedAt?.toISOString() ?? null,
        user: {
          fullName: certificate.user.fullName,
        },
        course: {
          title: certificate.course.title,
        },
      },
    });
  });
}