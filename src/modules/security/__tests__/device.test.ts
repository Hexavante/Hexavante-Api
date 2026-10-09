import { describe, it, expect, vi } from "vitest";

// Evita conexão real: o import do service puxa o módulo prisma,
// cujo $connect() em top-level chamaria process.exit(1) sem banco.
vi.mock("../../../../packages/core/src/config/prisma", () => ({ prisma: {} }));

import {
  fingerprintDevice,
  resolveDeviceFingerprint,
  resolveDeviceIp,
} from "../service/security.service";

/**
 * P1-5: o IP do body só vale se for IP válido; resto cai para o servidor.
 * P1-6: deviceId opt-in vira fingerprint estável sem migração.
 */
describe("resolveDeviceIp", () => {
  it("aceita IPv4 válido do body", () => {
    expect(resolveDeviceIp("187.44.10.20", "10.0.0.1")).toBe("187.44.10.20");
  });

  it("aceita IPv6 válido do body", () => {
    expect(resolveDeviceIp("::1", "10.0.0.1")).toBe("::1");
  });

  it("rejeita texto arbitrário e usa o IP do servidor", () => {
    expect(resolveDeviceIp("nao-um-ip", "10.0.0.1")).toBe("10.0.0.1");
  });

  it("ausente usa o IP do servidor", () => {
    expect(resolveDeviceIp(undefined, "10.0.0.1")).toBe("10.0.0.1");
  });
});

describe("resolveDeviceFingerprint", () => {
  it("com deviceId: prefixo did: + id (estável, sem hash de UA/IP)", () => {
    const fp = resolveDeviceFingerprint({
      deviceId: "550e8400-e29b-41d4-a716-446655440000",
      userAgent: "qualquer-ua",
      ip: "1.2.3.4",
    });
    expect(fp).toBe("did:550e8400-e29b-41d4-a716-446655440000");
  });

  it("sem deviceId: cai para o fingerprint legado", () => {
    const legacy = fingerprintDevice("Test-UA", "9.9.9.9");
    expect(
      resolveDeviceFingerprint({ userAgent: "Test-UA", ip: "9.9.9.9" }),
    ).toBe(legacy);
    expect(legacy).toMatch(/^[0-9a-f]{64}$/);
  });

  it("deviceId vazio/em branco: cai para o legado", () => {
    const legacy = fingerprintDevice("UA", "1.1.1.1");
    expect(resolveDeviceFingerprint({ deviceId: "   ", userAgent: "UA", ip: "1.1.1.1" })).toBe(
      legacy,
    );
  });

  it("deviceId nunca colide com o formato legado (prefixo did:)", () => {
    const fp = resolveDeviceFingerprint({ deviceId: "abc123" });
    expect(fp.startsWith("did:")).toBe(true);
    expect(fp).not.toMatch(/^[0-9a-f]{64}$/);
  });
});
