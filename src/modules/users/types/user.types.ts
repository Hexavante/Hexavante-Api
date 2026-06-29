export interface UserProfile {
  id: string;
  username: string;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  birthDate: Date;
  phone: string | null;
  city: string | null;
  state: string | null;
  bio: string | null;
  profileVisibility: string;
  isVerified: boolean;
  isPremium: boolean;
  coins: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateProfileInput {
  fullName?: string;
  username?: string;
  birthDate?: string;
}
