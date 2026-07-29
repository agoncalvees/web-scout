import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Driver nativo do Postgres e runtime do Prisma não devem ser empacotados
  // pelo bundler do servidor — usam `fs`/bindings nativos.
  serverExternalPackages: ["pg", "@prisma/adapter-pg"],
};

export default nextConfig;
