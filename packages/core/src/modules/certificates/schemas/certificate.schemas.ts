import { z } from "zod";

export const issueCertificateSchema = z.object({
  body: z.object({
    courseId: z.string().min(1, "Curso inválido"),
  }),
});

export const verifyCertificateSchema = z.object({
  params: z.object({
    code: z.string().min(1, "Código do certificado é obrigatório"),
  }),
});

export type IssueCertificateInput = z.infer<typeof issueCertificateSchema>["body"];
export type VerifyCertificateParams = z.infer<typeof verifyCertificateSchema>["params"];