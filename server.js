import { startServer } from "./src/server.js";

startServer().catch((error) => {
  // Bootstrap fallback: structured logging may be unavailable when configuration fails.
  process.stderr.write(
    `No fue posible iniciar el servidor: ${error.message}\n`,
  );
  process.exitCode = 1;
});
