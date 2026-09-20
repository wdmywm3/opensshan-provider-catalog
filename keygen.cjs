"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { privateKey, publicKey } = crypto.generateKeyPairSync("ed25519");
fs.writeFileSync(path.join(__dirname, "signing-private.pem"), privateKey.export({ type: "pkcs8", format: "pem" }), { flag: "wx", mode: 0o600 });
fs.writeFileSync(path.join(__dirname, "public-key.pem"), publicKey.export({ type: "spki", format: "pem" }), { flag: "wx" });
console.log("Created signing-private.pem and public-key.pem. Keep the private key outside Git.");
