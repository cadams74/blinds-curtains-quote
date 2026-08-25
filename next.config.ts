import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pg: the existing Node-native-binding case. pdfjs-dist: webpack bundling
  // relocates its "fake worker" fallback to a chunk path that no longer
  // sits next to its own pdf.worker.mjs, so the PDF fabric-import upload
  // failed with "Cannot find module '.../pdf.worker.mjs'" in every real
  // production build/start -- confirmed live, not assumed, while verifying
  // the PDF import feature end to end. Excluding it from webpack bundling
  // keeps its own file layout (and its own relative worker-path lookup)
  // intact at runtime, the same fix as pg's.
  serverExternalPackages: ["pg", "pdfjs-dist"],
  experimental: {
    serverActions: {
      // Default is 1MB, too small for a real supplier fabric price list
      // upload (admin/fabric-import) -- the whole seeded fabric library is
      // 3,313 rows and well under 10MB as .xlsx, so this comfortably covers
      // a single supplier's list with headroom.
      bodySizeLimit: "10mb",
    },
  },
  // The pricing/db library code (src/db, src/pricing) predates the Next.js
  // app and was built as a standalone Node ESM package run via tsx, where
  // Node's ESM resolver requires explicit ".js" extensions on relative
  // imports even though the actual files are ".ts" -- the standard pattern
  // for Node ESM + TypeScript. TypeScript's own compiler already maps that
  // correctly (moduleResolution "Bundler"), but Next's webpack build doesn't
  // by default -- it needs this told explicitly, or every one of those
  // already-tested imports would need rewriting instead.
  webpack: (config) => {
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
    };
    return config;
  },
};

export default nextConfig;
