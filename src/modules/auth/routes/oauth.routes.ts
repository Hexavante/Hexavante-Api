import { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import rateLimit from '@fastify/rate-limit';
import {
  getOAuthConfig,
  getRedirectUri,
  getWebUrl,
  getAllowedRedirectHosts,
  isNativeCallbackURL,
  isAllowedNativeCallbackURL,
  oauthProviders,
  parseTokenResponse,
} from '../../../config/oauth';
import { findOrCreateOAuthUser } from '../service/oauth.service';
import { createSession, validateSession } from '../../../lib/session';
import { getRedisClient } from '../../../config/redis';
import { asyncHandler } from '../../../lib/errors/errorHandler';
import { buildRateLimitOptions } from '../../../plugins/rate-limit';

/** TTL (s) do one-time code entregue aos apps nativos no redirect de sucesso. */
const NATIVE_CODE_TTL_SECONDS = 120;

/**
 * Monta a URL de redirect para um callback nativo (`scheme://...`),
 * preservando o scheme e sobrescrevendo os parâmetros
 * (ex.: `?error=...` ou `?code=...&provider=...`).
 */
function buildNativeCallbackRedirect(
  callbackURL: string,
  params: Record<string, string>
): string {
  const url = new URL(callbackURL);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Classifica um `oauth_callback` já salvo no cookie, seguindo a MESMA ordem
 * do `GET /oauth/:provider`: http(s) → web; scheme customizado → nativo.
 */
function isNativeCallback(callbackURL: string): boolean {
  return !callbackURL.startsWith('http') && isNativeCallbackURL(callbackURL);
}

export async function oauthRoutes(fastify: FastifyInstance) {
  // GET /oauth/providers — quais providers estão configurados (público)
  // Registrado ANTES de /oauth/:provider; no radix tree do Fastify o segmento
  // estático "providers" tem prioridade sobre o param ":provider", mas manter
  // a ordem deixa a intenção explícita.
  fastify.get('/oauth/providers', {
    schema: {
      summary: "Listar providers OAuth configurados",
      tags: ["Auth"],
      description:
        "Retorna quais providers OAuth (Google, GitHub, Microsoft, Discord) estão habilitados na API, ou seja, têm credenciais (CLIENT_ID/SECRET) no ambiente. Público, sem autenticação.",
      response: {
        200: {
          type: "object",
          properties: {
            providers: {
              type: "object",
              properties: {
                google: { type: "boolean", description: "Google configurado" },
                github: { type: "boolean", description: "GitHub configurado" },
                microsoft: { type: "boolean", description: "Microsoft configurado" },
                discord: { type: "boolean", description: "Discord configurado" },
              },
            },
          },
        },
      },
    },
  }, async () => ({
    providers: {
      google: getOAuthConfig('google')?.enabled === true,
      github: getOAuthConfig('github')?.enabled === true,
      microsoft: getOAuthConfig('microsoft')?.enabled === true,
      discord: getOAuthConfig('discord')?.enabled === true,
    },
  }));

  // POST /oauth/exchange — troca o one-time code do redirect nativo por sessão.
  //
  // Registrado num escopo filho onde o rate-limit é carregado NO MESMO contexto
  // da rota: `@fastify/rate-limit` só protege o escopo em que é registrado (um
  // wrapper encapsulado não alcança as rotas irmãs — ver plugins/rate-limit).
  // Assim a rota nova ganha limite próprio sem alterar as demais rotas OAuth.
  await fastify.register(async (exchangeScope) => {
    await exchangeScope.register(rateLimit, buildRateLimitOptions());

    exchangeScope.post('/oauth/exchange', {
      config: {
        // Rota pública: 10 tentativas de troca por minuto por IP.
        rateLimit: {
          max: 10,
          timeWindow: 60 * 1000,
        },
      },
      // Erros de schema ficam em `request.validationError` para responder 400
      // em pt-BR no mesmo formato dos demais erros desta rota.
      attachValidation: true,
      schema: {
        summary: "Trocar código OAuth nativo por sessão",
        tags: ["Auth"],
        description:
          "Recebe o `code` entregue no redirect nativo (`<callbackURL>?code=...&provider=...`), consome no Redis (uso único, expira em 120s) e devolve o token de sessão e o usuário no mesmo shape do login. Público: os apps nativos usam o `token` no cookie `__Secure-hexavante.session_token`.",
        body: {
          type: "object",
          required: ["code"],
          properties: {
            code: {
              type: "string",
              minLength: 1,
              maxLength: 256,
              description: "One-time code recebido no redirect nativo",
            },
          },
        },
        response: {
          200: {
            type: "object",
            properties: {
              token: { type: "string", description: "Token de sessão (válido por 7 dias)" },
              user: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  name: { type: "string" },
                  email: { type: "string" },
                  username: { type: ["string", "null"] },
                  avatarUrl: { type: ["string", "null"] },
                  roles: { type: "array", items: { type: "string" } },
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              error: { type: "string" },
            },
          },
        },
      },
    }, asyncHandler(async (request, reply) => {
      const body = (request.body ?? {}) as { code?: unknown };

      if (
        request.validationError ||
        typeof body.code !== "string" ||
        body.code.length === 0
      ) {
        return reply.status(400).send({ error: "Código de troca inválido" });
      }

      const redis = getRedisClient();
      const redisKey = `oauth:native:${body.code}`;

      // Uso único: GETDEL consome e devolve em uma operação atômica.
      // Fallback para Redis < 6.2 (sem GETDEL): GET + DEL.
      let token: string | null = null;
      try {
        token = await redis.getdel(redisKey);
      } catch {
        token = await redis.get(redisKey);
        if (token) await redis.del(redisKey);
      }

      if (!token) {
        return reply.status(400).send({ error: "Código inválido ou expirado" });
      }

      const session = await validateSession(token);
      if (!session) {
        return reply.status(400).send({ error: "Código inválido ou expirado" });
      }

      // Mesmo shape de `data.user` do POST /api/v1/auth/login.
      return reply.status(200).send({
        token,
        user: {
          id: session.user.id,
          name: session.user.fullName,
          email: session.user.email,
          username: session.user.username,
          avatarUrl: session.user.avatarUrl,
          roles: session.user.roles.map((role) => role.role.name),
        },
      });
    }));
  });

  // GET /oauth/:provider — redireciona pro consent do provider
  fastify.get('/oauth/:provider', {
    schema: {
      summary: "Iniciar fluxo OAuth",
      tags: ["Auth"],
      description:
        "Redireciona o usuário para a tela de consentimento do provider (Google, GitHub, etc). `callbackURL` aceita caminho relativo do web, URL http(s) de domínio permitido ou scheme nativo de app (ex.: `hexavante://auth/callback`, allowlist da env `OAUTH_NATIVE_SCHEMES`).",
    },
  }, async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const { callbackURL: rawCallbackURL } = request.query as { callbackURL?: string };

    const config = getOAuthConfig(provider);
    const providerDef = oauthProviders[provider];

    if (!config || !providerDef) {
      return reply.status(404).send({ error: 'Provider não suportado' });
    }

    if (!config.enabled) {
      return reply.status(400).send({ error: 'Provider não configurado' });
    }

    // Valida callbackURL
    const webOrigin = getWebUrl();
    let callbackURL: string;
    const ALLOWED = getAllowedRedirectHosts();

    if (!rawCallbackURL) {
      callbackURL = `${webOrigin}/`;
    } else if (rawCallbackURL.startsWith('http')) {
      const parsed = new URL(rawCallbackURL);
      if (!ALLOWED.includes(parsed.hostname)) {
        return reply.status(400).send({ error: 'Domínio de redirecionamento não permitido' });
      }
      callbackURL = rawCallbackURL;
    } else if (isNativeCallbackURL(rawCallbackURL)) {
      // Scheme customizado de app (mobile/desktop): precisa estar na allowlist
      // da env OAUTH_NATIVE_SCHEMES (default: hexavante).
      if (!isAllowedNativeCallbackURL(rawCallbackURL)) {
        return reply.status(400).send({ error: 'Scheme de callback não permitido' });
      }
      callbackURL = rawCallbackURL;
    } else {
      callbackURL = `${webOrigin}${rawCallbackURL.startsWith('/') ? '' : '/'}${rawCallbackURL}`;
    }

    // Gera state aleatório
    const state = crypto.randomUUID();
    const redirectUri = getRedirectUri(provider);

    // Salva state e callbackURL em cookie temporário (5 min)
    reply.setCookie('oauth_state', state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    });
    reply.setCookie('oauth_callback', callbackURL, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 300,
    });

    // Monta URL de consent
    const authUrl = new URL(config.authorizationEndpoint);
    authUrl.searchParams.set('client_id', config.clientId);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', config.scopes.join(' '));
    authUrl.searchParams.set('state', state);

    // Google precisa de access_type=offline pra refresh token
    if (provider === 'google') {
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');
    }

    return reply.redirect(authUrl.toString());
  });

  // GET /oauth/callback/:provider — recebe code+state do provider
  fastify.get('/oauth/callback/:provider', {
    schema: {
      summary: "Callback OAuth",
      tags: ["Auth"],
      description: "Recebe code+state do provider, troca por token, cria sessão e redireciona.",
      hide: true,
    },
  }, async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const { code, state, error } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const config = getOAuthConfig(provider);
    const webUrl = getWebUrl();

    // Lido cedo: todos os redirects (sucesso e TODOS os erros) precisam
    // respeitar o destino — inclusive quando o state é inválido.
    const callbackURL = request.cookies?.oauth_callback || `${webUrl}/`;
    const nativeCallback = isNativeCallback(callbackURL);

    // Erro → web: `${webUrl}/login?error=...`; nativo: `<callbackURL>?error=...`.
    const redirectWithError = (errorCode: string) =>
      nativeCallback
        ? reply.redirect(buildNativeCallbackRedirect(callbackURL, { error: errorCode }))
        : reply.redirect(`${webUrl}/login?error=${errorCode}`);

    if (!config) {
      return redirectWithError('provider_not_found');
    }

    // Erro do provider
    if (error) {
      return redirectWithError(`oauth_${error}`);
    }

    // Verifica state
    const savedState = request.cookies?.oauth_state;
    if (!state || !savedState || state !== savedState) {
      return redirectWithError('oauth_invalid_state');
    }

    // Limpa cookies temporários
    reply.clearCookie('oauth_state', { path: '/' });
    reply.clearCookie('oauth_callback', { path: '/' });

    if (!code) {
      return redirectWithError('oauth_no_code');
    }

    try {
      // Troca code por token
      const tokenBody: Record<string, string> = {
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code,
        redirect_uri: getRedirectUri(provider),
        grant_type: 'authorization_code',
      };

      // Accept: application/json faz o GitHub devolver JSON (os demais já
      // devolvem); o parser abaixo aceita JSON e urlencoded, então qualquer
      // formato funciona para qualquer provider.
      const tokenRes = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
        body: new URLSearchParams(tokenBody).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error(`[OAuth] Token exchange failed for ${provider}:`, errText);
        return redirectWithError('oauth_token_exchange');
      }

      const tokenData = parseTokenResponse(await tokenRes.text());
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        return redirectWithError('oauth_no_token');
      }

      // Busca profile do usuário
      const providerDef = oauthProviders[provider];
      const profile = await providerDef.getUserInfo(accessToken);

      if (!profile.email) {
        return redirectWithError('oauth_no_email');
      }

      // Cria ou encontra user
      const user = await findOrCreateOAuthUser({
        provider,
        providerId: profile.providerId,
        email: profile.email,
        name: profile.name,
        avatarUrl: profile.avatarUrl,
      });

      // Cria sessão
      const session = await createSession(user.id, request.ip, request.headers['user-agent']);

      // OAuth é autenticação forte: confia neste dispositivo automaticamente
      try {
        const { SecurityService, fingerprintDevice } = await import(
          '../../security/service/security.service'
        );
        const security = new SecurityService();
        await security.trustDevice(
          user.id,
          fingerprintDevice(request.headers['user-agent'], request.ip),
          request.headers['user-agent'],
          request.ip,
        );
      } catch (trustError) {
        console.error("[OAuth] Falha ao registrar dispositivo:", trustError);
      }

      // Set cookie
      reply.setCookie('__Secure-hexavante.session_token', session.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        domain: process.env.NODE_ENV === 'production' ? '.hexavante.com.br' : undefined,
      });

      if (nativeCallback) {
        // App nativo: entrega um one-time code no Redis (uso único, 120s).
        // O app troca por { token, user } em POST /oauth/exchange.
        const oneTimeCode = randomBytes(16).toString('hex'); // 128 bits
        await getRedisClient().set(
          `oauth:native:${oneTimeCode}`,
          session.token,
          'EX',
          NATIVE_CODE_TTL_SECONDS
        );
        return reply.redirect(
          buildNativeCallbackRedirect(callbackURL, { code: oneTimeCode, provider })
        );
      }

      // Redireciona pro web
      return reply.redirect(callbackURL);
    } catch (err) {
      console.error(`[OAuth] Callback error for ${provider}:`, err);
      return redirectWithError('oauth_callback_error');
    }
  });
}
