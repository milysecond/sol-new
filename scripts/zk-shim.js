import { Buffer } from "buffer";
import * as process from "process";

if (typeof globalThis.Buffer === "undefined") {
  // @ts-expect-error Buffer polyfill
  globalThis.Buffer = Buffer;
}
if (typeof globalThis.process === "undefined") {
  // @ts-expect-error process polyfill
  globalThis.process = process;
}
