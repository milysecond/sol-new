import http from "http";
import next from "next";

const app = next({ dev: true });
const handle = app.getRequestHandler();

await app.prepare();

http.createServer((req, res) => handle(req, res)).listen(3333, "::", () => {
  console.log("> Ready on http://[::]:3333 (IPv4 + IPv6)");
});
