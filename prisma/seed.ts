import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const PERMISSIONS = [
  { name: "user.read", resource: "user", action: "read" },
  { name: "user.update", resource: "user", action: "update" },
  { name: "user.delete", resource: "user", action: "delete" },
  { name: "course.create", resource: "course", action: "create" },
  { name: "course.update", resource: "course", action: "update" },
  { name: "course.delete", resource: "course", action: "delete" },
  { name: "course.read", resource: "course", action: "read" },
  { name: "exam.create", resource: "exam", action: "create" },
  { name: "exam.update", resource: "exam", action: "update" },
  { name: "exam.delete", resource: "exam", action: "delete" },
  { name: "exam.read", resource: "exam", action: "read" },
  { name: "community.moderate", resource: "community", action: "moderate" },
  { name: "community.ban", resource: "community", action: "ban" },
  { name: "community.warn", resource: "community", action: "warn" },
] as const;

const ROLES = [
  { name: "ADMIN", description: "Acesso total ao sistema" },
  { name: "TEACHER", description: "Professor — gerencia cursos e exames" },
  { name: "MODERATOR", description: "Moderador — gerencia a comunidade" },
  { name: "USER", description: "Usuário padrão" },
] as const;

const ROLE_PERMISSIONS: Record<string, string[]> = {
  ADMIN: [
    "user.read",
    "user.update",
    "user.delete",
    "course.create",
    "course.update",
    "course.delete",
    "course.read",
    "exam.create",
    "exam.update",
    "exam.delete",
    "exam.read",
    "community.moderate",
    "community.ban",
    "community.warn",
  ],
  TEACHER: [
    "course.create",
    "course.update",
    "course.delete",
    "course.read",
    "exam.create",
    "exam.update",
    "exam.delete",
    "exam.read",
  ],
  MODERATOR: [
    "community.moderate",
    "community.ban",
    "community.warn",
  ],
  USER: [
    "user.read",
  ],
};

async function main() {
  console.log("🌱 Seeding database...");

  const permissionMap = new Map<string, string>();

  for (const p of PERMISSIONS) {
    const created = await prisma.permission.upsert({
      where: { name: p.name },
      update: {},
      create: p,
    });
    permissionMap.set(p.name, created.id);
    console.log(`  ✓ Permission ${p.name}`);
  }

  for (const r of ROLES) {
    const role = await prisma.role.upsert({
      where: { name: r.name },
      update: {},
      create: r,
    });

    const permissionNames = ROLE_PERMISSIONS[r.name];
    if (permissionNames) {
      for (const permName of permissionNames) {
        const permissionId = permissionMap.get(permName);
        if (!permissionId) continue;

        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: role.id,
              permissionId,
            },
          },
          update: {},
          create: {
            roleId: role.id,
            permissionId,
          },
        });
      }
    }

    console.log(`  ✓ Role ${r.name} with ${permissionNames?.length ?? 0} permissions`);
  }

  console.log("✅ Seed complete");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
