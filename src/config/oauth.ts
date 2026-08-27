const WEB_URL =
  process.env.CORS_ORIGIN?.split(',')[0]?.trim() ||
  (process.env.NODE_ENV === 'production'
    ? 'https://app.hexavante.com.br'
    : 'http://localhost:3000');

const API_URL =
  process.env.BETTER_AUTH_URL ||
  process.env.AUTH_URL ||
  (process.env.NODE_ENV === 'production'
    ? 'https://api.hexavante.com.br'
    : 'http://localhost:3045');

const ALLOWED_REDIRECT_HOSTS = [
  'hexavante.com.br',
  'app.hexavante.com.br',
  'www.hexavante.com.br',
  'localhost',
  '127.0.0.1',
];

export interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  scopes: string[];
  enabled: boolean;
}

export interface OAuthProviderDefinition {
  name: string;
  label: string;
  getUserInfo: (accessToken: string) => Promise<{
    providerId: string;
    email: string;
    name: string;
    avatarUrl: string | null;
  }>;
}

function generateUsername(name: string, email: string): string {
  const base = (name || email.split('@')[0])
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .substring(0, 20);
  return base || 'user' + Date.now().toString(36);
}

export const oauthProviders: Record<string, OAuthProviderDefinition> = {
  google: {
    name: 'google',
    label: 'Google',
    getUserInfo: async (accessToken: string) => {
      const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Google user info');
      const data = await res.json() as any;
      return {
        providerId: data.id,
        email: data.email,
        name: data.name || '',
        avatarUrl: data.picture || null,
      };
    },
  },
  github: {
    name: 'github',
    label: 'GitHub',
    getUserInfo: async (accessToken: string) => {
      const res = await fetch('https://api.github.com/user', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to fetch GitHub user info');
      const data = await res.json() as any;

      let email = data.email as string | null;
      if (!email) {
        const emailsRes = await fetch('https://api.github.com/user/emails', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        if (emailsRes.ok) {
          const emails = (await emailsRes.json()) as any[];
          const primary = emails.find((e: any) => e.primary);
          email = primary?.email || emails[0]?.email;
        }
      }

      return {
        providerId: String(data.id),
        email: email || '',
        name: data.name || data.login || '',
        avatarUrl: data.avatar_url || null,
      };
    },
  },
  // Microsoft - descomentar quando tiver as credenciais
  // microsoft: {
  //   name: 'microsoft',
  //   label: 'Microsoft',
  //   getUserInfo: async (accessToken: string) => {
  //     const res = await fetch('https://graph.microsoft.com/v1.0/me', {
  //       headers: { Authorization: `Bearer ${accessToken}` },
  //     });
  //     if (!res.ok) throw new Error('Failed to fetch Microsoft user info');
  //     const data = await res.json();
  //     return {
  //       providerId: data.id,
  //       email: data.mail || data.userPrincipalName,
  //       name: data.displayName || '',
  //       avatarUrl: null,
  //     };
  //   },
  // },
};

export function getOAuthConfig(provider: string): OAuthProviderConfig | null {
  switch (provider) {
    case 'google':
      return {
        clientId: process.env.GOOGLE_CLIENT_ID || '',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
        tokenEndpoint: 'https://oauth2.googleapis.com/token',
        scopes: ['openid', 'email', 'profile'],
        enabled: !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET),
      };
    case 'github':
      return {
        clientId: process.env.GITHUB_CLIENT_ID || '',
        clientSecret: process.env.GITHUB_CLIENT_SECRET || '',
        authorizationEndpoint: 'https://github.com/login/oauth/authorize',
        tokenEndpoint: 'https://github.com/login/oauth/access_token',
        scopes: ['user:email'],
        enabled: !!(process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET),
      };
    // Microsoft - descomentar quando tiver as credenciais
    // case 'microsoft':
    //   return {
    //     clientId: process.env.MICROSOFT_CLIENT_ID || '',
    //     clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    //     authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    //     tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    //     scopes: ['openid', 'email', 'profile', 'User.Read'],
    //     enabled: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
    //   };
    default:
      return null;
  }
}

export function getRedirectUri(provider: string): string {
  return `${API_URL}/oauth/callback/${provider}`;
}

export function getWebUrl(): string {
  return WEB_URL;
}

export function getAllowedRedirectHosts(): string[] {
  return ALLOWED_REDIRECT_HOSTS;
}

export { generateUsername };
