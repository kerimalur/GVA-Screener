// Next.js erkennt nur "middleware.ts" als Middleware-Datei.
// Die Logik liegt in proxy.ts — hier nur re-exportieren.
export { proxy as middleware, config } from "./proxy";
