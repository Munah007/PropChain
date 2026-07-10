"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("reflect-metadata");
const core_1 = require("@nestjs/core");
const app_module_1 = require("./app.module");
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule);
    app.enableCors();
    const port = Number(process.env.PORT ?? 8899);
    await app.listen(port);
    console.log(`[server] PropChain API listening on :${port}`);
}
bootstrap();
//# sourceMappingURL=main.js.map