import type { NextConfig } from "next";

const config: NextConfig = {
  // The agent SDK resolves a platform-native CLI binary and PGlite ships WASM:
  // both must stay plain Node requires, never bundled.
  serverExternalPackages: ["@anthropic-ai/claude-agent-sdk", "@electric-sql/pglite"],
  poweredByHeader: false,
  devIndicators: false,
  // Do not write agent instruction files into the repo on next dev.
  agentRules: false,
};

export default config;
