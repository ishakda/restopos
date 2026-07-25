import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // ESLint is not part of the CI pipeline yet; strict TypeScript + tests guard quality.
  eslint: { ignoreDuringBuilds: true },
  poweredByHeader: false,
};

export default withNextIntl(nextConfig);
