import { FastifyInstance } from 'fastify';
import { getOAuthConfig, getRedirectUri, getWebUrl, getAllowedRedirectHosts, oauthProviders } from '../../../config/oauth';
import { findOrCreateOAuthUser } from '../service/oauth.service';
import { createSession } from '../../../lib/session';

export async function oauthRoutes(fastify: FastifyInstance) {
  // GET /oauth/:provider — redireciona pro consent do provider
  fastify.get('/oauth/:provider', async (request, reply) => {
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
  fastify.get('/oauth/callback/:provider', async (request, reply) => {
    const { provider } = request.params as { provider: string };
    const { code, state, error } = request.query as {
      code?: string;
      state?: string;
      error?: string;
    };

    const config = getOAuthConfig(provider);
    const webUrl = getWebUrl();

    if (!config) {
      return reply.redirect(`${webUrl}/login?error=provider_not_found`);
    }

    // Erro do provider
    if (error) {
      return reply.redirect(`${webUrl}/login?error=oauth_${error}`);
    }

    // Verifica state
    const savedState = request.cookies?.oauth_state;
    if (!state || !savedState || state !== savedState) {
      return reply.redirect(`${webUrl}/login?error=oauth_invalid_state`);
    }

    // Limpa cookies temporários
    reply.clearCookie('oauth_state', { path: '/' });
    reply.clearCookie('oauth_callback', { path: '/' });

    const callbackURL = request.cookies?.oauth_callback || `${webUrl}/`;

    if (!code) {
      return reply.redirect(`${webUrl}/login?error=oauth_no_code`);
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

      // GitHub precisa de Accept header pra receber JSON
      const tokenHeaders: Record<string, string> =
        provider === 'github'
          ? { Accept: 'application/json' }
          : {};

      const tokenRes = await fetch(config.tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          ...tokenHeaders,
        },
        body: new URLSearchParams(tokenBody).toString(),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text();
        console.error(`[OAuth] Token exchange failed for ${provider}:`, errText);
        return reply.redirect(`${webUrl}/login?error=oauth_token_exchange`);
      }

      const tokenData = (await tokenRes.json()) as any;
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        return reply.redirect(`${webUrl}/login?error=oauth_no_token`);
      }

      // Busca profile do usuário
      const providerDef = oauthProviders[provider];
      const profile = await providerDef.getUserInfo(accessToken);

      if (!profile.email) {
        return reply.redirect(`${webUrl}/login?error=oauth_no_email`);
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

      // Redireciona pro web
      return reply.redirect(callbackURL);
    } catch (err) {
      console.error(`[OAuth] Callback error for ${provider}:`, err);
      return reply.redirect(`${webUrl}/login?error=oauth_callback_error`);
    }
  });
}
