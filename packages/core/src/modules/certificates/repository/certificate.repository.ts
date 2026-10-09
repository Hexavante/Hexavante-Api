import { prisma } from "../../../config/prisma";
import type { Certificate, UserCertificate } from "../types/certificate.types";

export class CertificateRepository {
  async findUserCertificates(userId: string): Promise<Certificate[]> {
    return prisma.certificate.findMany({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            username: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            categoryId: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { issuedAt: "desc" },
    });
  }

  async findByCode(code: string): Promise<Certificate | null> {
    return prisma.certificate.findUnique({
      where: { code },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            username: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            categoryId: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async findUserCertificateByCourse(userId: string, courseId: string): Promise<Certificate | null> {
    return prisma.certificate.findUnique({
      where: {
        userId_courseId: {
          userId,
          courseId,
        },
      },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            username: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            categoryId: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async create(data: { userId: string; courseId: string; code: string }): Promise<Certificate> {
    return prisma.certificate.create({
      data,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            email: true,
            username: true,
          },
        },
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            categoryId: true,
            category: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  async toUserCertificate(cert: Certificate): Promise<UserCertificate> {
    return {
      id: cert.id,
      code: cert.code,
      issuedAt: cert.issuedAt.toISOString(),
      course: {
        title: cert.course.title,
        categoryName: cert.course.category.name,
      },
    };
  }
}