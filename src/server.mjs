import http from "node:http";
import { createApp } from "./app.mjs";

const port = Number(process.env.PORT ?? 3000);
const app = createApp();

const server = http.createServer(app);

server.listen(port, () => {
  console.log(`App Portaria360 online em http://localhost:${port}`);
});
