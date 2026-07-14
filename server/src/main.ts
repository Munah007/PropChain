import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  // Accounts, wallet keys, and funding state persist under DATA_DIR. On an
  // ephemeral host (Railway/Fly with no volume) an unset DATA_DIR means the
  // store lives on disposable disk — every restart wipes it and returning
  // users get brand-new wallets, losing access to their old accounts. Fail
  // loud so this is never silent in production.
  if (!process.env.DATA_DIR) {
    const msg =
      "DATA_DIR is not set — account data will NOT survive a restart. Point it at a persistent volume in production.";
    if (process.env.NODE_ENV === "production") console.error(`[server] FATAL-ish: ${msg}`);
    else console.warn(`[server] WARNING: ${msg}`);
  }

  const app = await NestFactory.create(AppModule);
  // CORS_ORIGINS: comma-separated allowlist. Defaults to "*" (open) so
  // nothing breaks before deploy config sets it — restrict in production.
  const origins = (process.env.CORS_ORIGINS ?? "*")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins.includes("*") ? true : origins });
  const port = Number(process.env.PORT ?? 8899);
  await app.listen(port);
  console.log(`[server] PropChain API listening on :${port}`);
}
bootstrap();
