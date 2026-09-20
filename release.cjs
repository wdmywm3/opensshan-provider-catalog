#!/usr/bin/env node
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateDirectory, verifyEnvelope } = require("./contract.cjs");
function loadDirectory(root = __dirname) {
  const read = name => JSON.parse(fs.readFileSync(path.join(root, name), "utf8"));
  return validateDirectory({ ...read("metadata.json"), ...read("providers.json"), capabilities: read("models.json") });
}
function release(root = __dirname, env = process.env) {
  const directory = loadDirectory(root);
  if (!env.CATALOG_SIGNING_KEY) throw new Error("CATALOG_SIGNING_KEY must contain an Ed25519 private PEM key");
  const key = crypto.createPrivateKey(env.CATALOG_SIGNING_KEY);
  if (key.asymmetricKeyType !== "ed25519") throw new Error("Ed25519 key required");
  const bytes = Buffer.from(JSON.stringify(directory));
  const keyId = env.CATALOG_KEY_ID || "catalog-release";
  const envelope = { keyId, payload: bytes.toString("base64"), signature: crypto.sign(null, bytes, key).toString("base64") };
  verifyEnvelope(envelope, { [keyId]: crypto.createPublicKey(key).export({ format: "pem", type: "spki" }) });
  fs.mkdirSync(path.join(root, "dist"), { recursive: true });
  fs.writeFileSync(path.join(root, "dist", "directory.json"), JSON.stringify(envelope) + "\n");
  return directory.version;
}
if (require.main === module) {
  try { console.log(process.argv.includes("--check") ? `Valid directory ${loadDirectory().version}` : `Released directory ${release()}`); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { loadDirectory, release };
