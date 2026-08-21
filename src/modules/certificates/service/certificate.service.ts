import { prisma } from "../../../config/prisma";
import { CertificateRepository } from "../repository/certificate.repository";
import type { Certificate } from "../types/certificate.types";
import { AppError } from "../../../lib/errors/AppError";

export class CertificateService {
  private repository: CertificateRepository;

  constructor() {
    this.repository = new CertificateRepository();
  }

  async getUserCertificates(userId: string) {
    const certificates = await this.repository.findUserCertificates(userId);
    return certificates;
  }

  async issueCertificate(userId: string, courseId: string): Promise<Certificate> {
    const course = await prisma.course.findUnique({
      where: { id: courseId } as any,
      include: { category: true },
    });

    if (!course) {
      throw new AppError(404, "Curso não encontrado");
    }

    const enrollment = await prisma.courseEnrollment.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      } as any,
      include: { lessonProgresses: true },
    });

    if (!enrollment) {
      throw new AppError(403, "Você não está matriculado neste curso");
    }

    if (Number(enrollment.progress) < 100) {
      throw new AppError(400, "Você deve concluir 100% do curso para obter o certificado");
    }

    const existing = await this.repository.findUserCertificateByCourse(userId, courseId);
    if (existing) {
      throw new AppError(409, "Você já possui o certificado deste curso");
    }

    const code = this.generateCertificateCode();
    const certificate = await this.repository.create({
      userId,
      courseId,
      code,
    });

    await prisma.notification.create({
      data: {
        userId,
        type: "CERTIFICATE_ISSUED",
        title: "Certificado Emitido!",
        message: `Você recebeu o certificado do curso "${course.title}"`,
        link: `/certificados/c/${code}`,
      },
    });

    return certificate;
  }

  async verifyCertificate(code: string) {
    const certificate = await this.repository.findByCode(code);
    if (!certificate) {
      throw new AppError(404, "Certificado não encontrado");
    }
    return certificate;
  }

  private generateCertificateCode(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const { randomBytes } = require("crypto");
    const bytes = randomBytes(8);
    let code = "HXV-";
    for (let i = 0; i < 8; i++) {
      code += chars.charAt(bytes[i] % chars.length);
    }
    return code;
  }
}