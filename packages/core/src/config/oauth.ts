// P1-10: URL principal do app (default de callbackURL e destino de erros
// web). Env dedicada — NUNCA derivada de CORS_ORIGIN (cujo primeiro item
// pode ser a landing ou até "*" no compose, quebrando redirects).
// Leitura preguiçosa (por chamada) para respeitar a env vigente.
function resolveWebUrl(): string {
  return (
    process.env.WEB_URL?.trim() ||
    (process.env.NODE_ENV === 'production'
      ? 'https://app.hexavante.com.br'
      : 'http://localhost:3000')
  );
}

function resolveApiUrl(): string {
  return (
    process.env.API_PUBLIC_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    process.env.AUTH_URL?.trim() ||
    (process.env.NODE_ENV === 'production'
      ? 'https://api.hexavante.com.br'
      : 'http://localhost:3045')
  );
}

const ALLOWED_REDIRECT_HOSTS = [
  'hexavante.com.br',
  'app.hexavante.com.br',
  'www.hexavante.com.br',
  // Domínio da própria API: usado pelo desktop (`auth.ipc.ts`) como
  // `callbackURL=https://api.hexavante.com.br/api/v1/auth/oauth/success`.
  'api.hexavante.com.br',
  'desktop-api.hexavante.com.br',
  'mobile-api.hexavante.com.br',
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
  microsoft: {
    name: 'microsoft',
    label: 'Microsoft',
    getUserInfo: async (accessToken: string) => {
      const res = await fetch('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Microsoft user info');
      const data = await res.json() as any;
      return {
        providerId: data.id,
        // Contas pessoais (@outlook.com/@hotmail.com) não têm `mail`,
        // só `userPrincipalName`.
        email: data.mail || data.userPrincipalName || '',
        name: data.displayName || '',
        avatarUrl: null,
      };
    },
  },
  discord: {
    name: 'discord',
    label: 'Discord',
    getUserInfo: async (accessToken: string) => {
      const res = await fetch('https://discord.com/api/users/@me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error('Failed to fetch Discord user info');
      const data = await res.json() as any;
      return {
        providerId: String(data.id),
        // `email` só vem se o app tiver o scope `email` e a conta verificada.
        email: data.email || '',
        name: data.global_name || data.username || '',
        avatarUrl: data.avatar
          ? `https://cdn.discordapp.com/avatars/${data.id}/${data.avatar}.png?size=128`
          : null,
      };
    },
  },
};

/** Providers OAuth suportados pela API (mesmo conjunto de `oauthProviders`). */
// GitHub foi removido como opção de login (nov/2026). Contas criadas por ele
// continuam válidas: entram pelo Google com o mesmo e-mail ou por e-mail/senha.
export const OAUTH_PROVIDER_IDS = ['google', 'microsoft', 'discord'] as const;

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
    case 'microsoft':
      return {
        clientId: process.env.MICROSOFT_CLIENT_ID || '',
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
        authorizationEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
        tokenEndpoint: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
        scopes: ['openid', 'email', 'profile', 'User.Read'],
        enabled: !!(process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET),
      };
    case 'discord':
      return {
        clientId: process.env.DISCORD_CLIENT_ID || '',
        clientSecret: process.env.DISCORD_CLIENT_SECRET || '',
        authorizationEndpoint: 'https://discord.com/api/oauth2/authorize',
        tokenEndpoint: 'https://discord.com/api/oauth2/token',
        scopes: ['identify', 'email'],
        enabled: !!(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET),
      };
    default:
      return null;
  }
}

/**
 * Interpreta a resposta do token exchange.
 *
 * Google, Microsoft e Discord devolvem JSON. Alguns provedores devolvem
 * `application/x-www-form-urlencoded`; aceita os dois formatos
 * (e também tolera corpo vazio, que vira `{}` → "oauth_no_token").
 */
export function parseTokenResponse(text: string): Record<string, string> {
  const trimmed = (text || '').trim();
  if (!trimmed) return {};

  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, string>;
    }
  } catch {
    // Não é JSON válido — tenta urlencoded abaixo.
  }

  try {
    const params = new URLSearchParams(trimmed);
    const result: Record<string, string> = {};
    for (const [key, value] of params) {
      result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

export function getRedirectUri(provider: string): string {
  return `${resolveApiUrl()}/oauth/callback/${provider}`;
}

export function getWebUrl(): string {
  return resolveWebUrl();
}

export function getAllowedRedirectHosts(): string[] {
  return ALLOWED_REDIRECT_HOSTS;
}

/**
 * Regex de scheme customizado de app nativo (Expo/desktop), ex.:
 * `hexavante://auth/callback`. Só casa com scheme em minúsculas — URLs
 * `http(s)://` continuam tratadas pelo caminho web (ver regra do
 * `GET /oauth/:provider`).
 */
const NATIVE_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:\/\//;

/** Allowlist de schemes aceitos como callback nativo (env csv, default `hexavante`). */
const DEFAULT_NATIVE_SCHEMES = 'hexavante';

/**
 * Schemes de app nativo permitidos em `callbackURL`, lidos em tempo de uso
 * (env `OAUTH_NATIVE_SCHEMES`, csv) para permitir configuração por ambiente.
 */
export function getNativeCallbackSchemes(): string[] {
  const raw = process.env.OAUTH_NATIVE_SCHEMES ?? DEFAULT_NATIVE_SCHEMES;
  return raw
    .split(',')
    .map((scheme) => scheme.trim())
    .filter(Boolean);
}

/** true se o valor é um callback com scheme customizado de app (`x://...`). */
export function isNativeCallbackURL(value: string): boolean {
  return NATIVE_SCHEME_REGEX.test(value);
}

/**
 * true se o valor é um callback nativo E o scheme está na allowlist.
 * Callbacks web/não-nativos retornam false (o chamador deve usar a regra web).
 */
export function isAllowedNativeCallbackURL(value: string): boolean {
  if (!isNativeCallbackURL(value)) return false;
  const scheme = value.slice(0, value.indexOf(':'));
  return getNativeCallbackSchemes().includes(scheme);
}

export { generateUsername };
