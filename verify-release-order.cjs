"use strict";
const fs = require("node:fs");
function verifyOrder(previous, next) {
  const before = JSON.parse(Buffer.from(previous.payload, "base64"));
  const after = JSON.parse(Buffer.from(next.payload, "base64"));
  if (after.version < before.version || after.version === before.version && previous.payload !== next.payload) {
    throw new Error("Changed directory data must be published with a higher metadata.json version");
  }
}
if (require.main === module) {
  const [previous, next] = process.argv.slice(2);
  if (fs.existsSync(previous)) verifyOrder(JSON.parse(fs.readFileSync(previous)), JSON.parse(fs.readFileSync(next)));
}
module.exports = { verifyOrder };
