import { createServer } from "vite";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
  appType: "custom",
  logLevel: "silent",
});
try {
  const { definitions, sets } = await server.ssrLoadModule(
    "/src/content/catalog.ts",
  );
  console.log(
    `Content valid: ${definitions.length} collectible cards in ${Object.keys(sets).length} sets.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  await server.close();
}
