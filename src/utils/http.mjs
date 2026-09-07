import fs from "node:fs";
import path from "node:path";

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".png": "image/png"
};

export function json(res, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    ...extraHeaders
  });
  res.end(body);
}

export function text(res, statusCode, payload, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    ...extraHeaders
  });
  res.end(payload);
}

export function binary(res, statusCode, payload, contentType, extraHeaders = {}) {
  res.writeHead(statusCode, {
    "Content-Type": contentType,
    "Content-Length": payload.length,
    ...extraHeaders
  });
  res.end(payload);
}

export function noContent(res, extraHeaders = {}) {
  res.writeHead(204, extraHeaders);
  res.end();
}

export function notFound(res, message = "Recurso nao encontrado.") {
  json(res, 404, { error: message });
}

export function badRequest(res, message = "Requisicao invalida.") {
  json(res, 400, { error: message });
}

export function conflict(res, message = "Conflito com o estado atual do recurso.") {
  json(res, 409, { error: message });
}

export function forbidden(res, message = "Acesso negado.") {
  json(res, 403, { error: message });
}

export function unauthorized(res, message = "Nao autenticado.") {
  json(res, 401, { error: message });
}

export function serverError(res, error) {
  json(res, 500, {
    error: "Erro interno no servidor.",
    detail: error instanceof Error ? error.message : String(error)
  });
}

export async function parseJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8").trim();
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function parseCookies(req) {
  const cookieHeader = req.headers.cookie ?? "";
  return Object.fromEntries(
    cookieHeader
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function sendStaticFile(res, filePath) {
  if (!fs.existsSync(filePath)) return false;
  const ext = path.extname(filePath).toLowerCase();
  const buffer = fs.readFileSync(filePath);
  res.writeHead(200, {
    "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream",
    "Content-Length": buffer.length
  });
  res.end(buffer);
  return true;
}

export function safeJoin(basePath, requestPath) {
  const normalized = path.normalize(requestPath).replace(/^(\.\.(\/|\\|$))+/, "");
  const targetPath = path.join(basePath, normalized);
  return targetPath.startsWith(basePath) ? targetPath : basePath;
}

export function matchesRoute(pathname, expression) {
  const match = pathname.match(expression);
  return match ? match.slice(1) : null;
}
