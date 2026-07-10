import "reflect-metadata";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors();
  const port = Number(process.env.PORT ?? 8899);
  await app.listen(port);
  console.log(`[server] PropChain API listening on :${port}`);
}
bootstrap();
