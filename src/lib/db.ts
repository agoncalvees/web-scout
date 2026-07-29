import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

// Em dev o Next recarrega os módulos a cada edição; sem o singleton no
// globalThis cada reload abriria um pool novo até estourar as conexões.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não está definida. Veja o .env.example.");
  }

  return new PrismaClient({
    // Pool pequeno de propósito: cada instância serverless abre o seu, e o
    // limite real é o do pooler do Neon. Muitas conexões por instância esgotam
    // o limite da conta quando várias funções sobem ao mesmo tempo.
    adapter: new PrismaPg({ connectionString, max: 5 }),
  });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
