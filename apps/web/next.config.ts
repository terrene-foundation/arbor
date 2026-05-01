import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  transpilePackages: ["@kailash/prism-web"],
  // Pin Turbopack's workspace root to this app directory. Without this Next
  // walks up looking for a lockfile and emits a warning when it finds more
  // than one (terrene-foundation root, arbor monorepo, etc.). Anchor here
  // explicitly so the inference is deterministic across machines.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
