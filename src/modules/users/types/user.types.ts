export interface UserProfile {
  id: string;
  username: string | null;
  fullName: string;
  email: string;
  avatarUrl: string | null;
  birthDate: string | null;
  phone: string | null;
  city: string | null;
  state: string | null;
  bio: string | null;
  profileVisibility: string;
  isVerified: boolean;
  isPremium: boolean;
  coins: number;
  twoFactorEnabled: boolean;
  presence: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface PublicProfile {
  id: string;
  username: string | null;
  fullName: string;
  avatarUrl: string | null;
  bio: string | null;
  profileVisibility: string;
  isVerified: boolean;
  isPremium: boolean;
  presence: "ONLINE" | "AWAY" | "STUDYING" | "DND" | "OFFLINE";
  createdAt: Date;
}

export interface UpdateProfileInput {
  fullName?: string;
  username?: string;
  birthDate?: string;
}
