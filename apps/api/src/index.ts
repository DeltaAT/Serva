import "dotenv/config";
import { buildApp } from "./app";

const app = await buildApp();
const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || "0.0.0.0";

app.listen({ port, host }).then(() => {
  console.log(`API running on http://${host}:${port}`);
  console.log(`Swagger UI available at http://${host}:${port}/documentation`);
});