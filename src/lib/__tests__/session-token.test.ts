import { describe, it, expect } from "vitest";
import { parseBearerToken, extractSessionToken, parseSessionToken } from "../session";

const COOKIE_NAME = "__Secure-hexavante.session_token";
const TOKEN = "abcdefghijklmnopqrstuvwxyz0123456789ABCDEF";

describe("parseBearerToken", () => {
  it("lê o token de um header Bearer válido", () => {
    expect(parseBearerToken(`Bearer ${TOKEN}`)).toBe(TOKEN);
  });

  it("aceita 'bearer' em minúsculas e espaços/tabs extras", () => {
    expect(parseBearerToken(`bearer   ${TOKEN}`)).toBe(TOKEN);
    expect(parseBearerToken(`BEARER\t${TOKEN}`)).toBe(TOKEN);
  });

  it("devolve null para header ausente, vazio ou malformado", () => {
    expect(parseBearerToken(null)).toBeNull();
    expect(parseBearerToken(undefined)).toBeNull();
    expect(parseBearerToken("")).toBeNull();
    expect(parseBearerToken("Bearer ")).toBeNull();
    expect(parseBearerToken("Bearer")).toBeNull();
    // Basic (docs) e token sem esquema não são sessão
    expect(parseBearerToken("Basic dXNlcjpwYXNz")).toBeNull();
    expect(parseBearerToken(TOKEN)).toBeNull();
  });

  it("não devolve o restante de um header multipart/colado", () => {
    expect(parseBearerToken(`Bearer ${TOKEN} extra`)).toBeNull();
  });
});

describe("extractSessionToken", () => {
  it("usa Authorization: Bearer quando presente", () => {
    expect(extractSessionToken({ authorization: `Bearer ${TOKEN}` })).toBe(TOKEN);
  });

  it("cai para o cookie quando não há Authorization", () => {
    expect(extractSessionToken({ cookie: `${COOKIE_NAME}=${TOKEN}` })).toBe(TOKEN);
  });

  it("prioriza o Bearer sobre o cookie quando os dois chegam", () => {
    const header = "do-header";
    const cookie = "do-cookie";
    expect(
      extractSessionToken({
        authorization: `Bearer ${header}`,
        cookie: `${COOKIE_NAME}=${cookie}`,
      }),
    ).toBe(header);
  });

  it("ignora Authorization sem esquema Bearer e usa o cookie", () => {
    expect(
      extractSessionToken({
        authorization: "Basic dXNlcjpwYXNz",
        cookie: `${COOKIE_NAME}=${TOKEN}`,
      }),
    ).toBe(TOKEN);
  });

  it("devolve null sem credencial nenhuma", () => {
    expect(extractSessionToken({})).toBeNull();
    expect(extractSessionToken({ authorization: null, cookie: null })).toBeNull();
  });

  it("mantém o comportamento legado do parseSessionToken", () => {
    expect(parseSessionToken(`${COOKIE_NAME}=${TOKEN}; outro=1`)).toBe(TOKEN);
    expect(parseSessionToken("outro=1")).toBeNull();
    expect(parseSessionToken(null)).toBeNull();
  });
});
