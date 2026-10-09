export interface Certificate {
  id: string;
  userId: string;
  courseId: string;
  code: string;
  issuedAt: Date;
  verifiedAt: Date | null;
  user: {
    id: string;
    fullName: string;
    email: string;
    username: string | null;
  };
  course: {
    id: string;
    title: string;
    slug: string;
    categoryId: string;
    category: {
      id: string;
      name: string;
    };
  };
}

export interface UserCertificate {
  id: string;
  code: string;
  issuedAt: string;
  course: {
    title: string;
    categoryName: string;
  };
}

export interface VerifyCertificateResponse {
  certificate: {
    id: string;
    code: string;
    issuedAt: string;
    verifiedAt: string | null;
    user: {
      fullName: string;
    };
    course: {
      title: string;
    };
  };
}