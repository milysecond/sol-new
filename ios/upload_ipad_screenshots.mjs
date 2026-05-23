import fs from "fs";
import path from "path";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Read _asc.mjs helper functions inline
const ascPath = new URL("file:///Volumes/PRO-G40/solnew/sol-new/ios/_asc.mjs");

// We'll re-implement the key parts from _asc.mjs
import * as jose from "https://deno.land/x/jose/index.ts"; // won't work, use node
