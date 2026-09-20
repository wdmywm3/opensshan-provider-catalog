"use strict";

const crypto = require("node:crypto");
const MAX_BYTES = 16 * 1024 * 1024;
const FORMATS = new Set(["openai_compatible", "openai_responses", "anthropic_compatible", "gemini_native"]);
const DIALECTS = new Set(["none", "anthropic_adaptive_effort", "deepseek_thinking", "gemini_thinking_budget", "gemini_dynamic_thinking", "openai_responses_effort"]);
const EFFORTS = new Set(["off", "none", "default", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"]);
function check(condition, message) { if (!condition) throw new Error(`Provider directory: ${message}`); }
function text(value, max = 2048) { return typeof value === "string" && value.length <= max && !/[\u0000-\u001f]/.test(value); }
function url(value, local = false, fragment = false) {
  const parsed = new URL(value);
  check(!parsed.username && !parsed.password && (fragment || !parsed.hash), "URL contains credentials or fragment");
  check(parsed.protocol === "https:" || local && parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname), "unsupported URL");
}
function validateDirectory(value) {
  check(value?.schemaVersion === 1, "unsupported schema version");
  check(Number.isSafeInteger(value.version) && value.version > 0, "invalid version");
  check(typeof value.generatedAt === "string" && Number.isFinite(Date.parse(value.generatedAt)), "invalid generation date");
  check(Array.isArray(value.providers) && value.providers.length > 0 && value.providers.length <= 500, "invalid providers");
  const ids = new Set();
  const fields = new Set(["id", "name", "category", "apiFormats", "modelDefaults", "modelDefaultsByModel", "defaultApiFormat", "supportedApiFormats", "needsApiKey", "websiteUrl", "apiKeyUrl", "featured", "sources", "verifiedAt"]);
  for (const p of value.providers) {
    check(p && typeof p === "object" && Object.keys(p).every(k => fields.has(k)), "unsupported provider fields");
    check(text(p.id, 100) && /^[a-z0-9][a-z0-9-]*$/.test(p.id) && !ids.has(p.id), "duplicate or invalid provider ID"); ids.add(p.id);
    check(text(p.name, 200) && p.name.length > 0, "invalid provider name");
    check(["official", "aggregator", "local", "custom"].includes(p.category), "invalid provider category");
    check(typeof p.needsApiKey === "boolean", "invalid authentication flag");
    check(Array.isArray(p.supportedApiFormats) && p.supportedApiFormats.length > 0 && p.supportedApiFormats.every(f => FORMATS.has(f)), "unsupported API format");
    check(p.supportedApiFormats.includes(p.defaultApiFormat), "missing default API format");
    check(p.apiFormats && Object.keys(p.apiFormats).every(f => p.supportedApiFormats.includes(f)), "invalid API formats");
    for (const f of p.supportedApiFormats) {
      const c = p.apiFormats[f];
      check(c && text(c.baseUrl) && Object.keys(c).every(k => ["baseUrl", "baseUrlPlaceholder", "defaultModels"].includes(k)), "invalid API configuration");
      if (c.baseUrl) url(c.baseUrl, p.category === "local");
      else check(p.category === "custom", "empty API URL");
      if (c.defaultModels) check(Object.values(c.defaultModels).every(m => text(m, 300)), "invalid default model");
    }
    for (const key of ["websiteUrl", "apiKeyUrl"]) if (p[key]) url(p[key], false, true);
    for (const defaults of [p.modelDefaults, ...Object.values(p.modelDefaultsByModel || {})]) {
      if (!defaults) continue;
      const numeric = ["temperature", "contextWindow", "maxTokens"];
      const boolean = ["streamOutput", "cacheEnabled", "textEnabled", "imageEnabled", "audioEnabled", "videoEnabled", "pdfEnabled", "toolCallSupported", "structuredOutputSupported", "temperatureSupported", "thinkingMode"];
      for (const [k, v] of Object.entries(defaults)) {
        check(numeric.includes(k) ? Number.isFinite(v) && v >= 0 : boolean.includes(k) ? typeof v === "boolean" : k === "thinkingEffort" ? EFFORTS.has(v) : k === "reasoningEfforts" && Array.isArray(v) && v.every(e => EFFORTS.has(e)), "unsupported model default");
      }
    }
  }
  check(ids.has("anthropic"), "required cloud provider is missing");
  check(Array.isArray(value.providerGroups) && value.providerGroups.length <= 500, "invalid provider groups");
  const aliases = new Set();
  for (const group of value.providerGroups) {
    check(Array.isArray(group) && group.length > 0 && group.length <= 50, "invalid provider group");
    for (const id of group) { check(text(id, 100) && !aliases.has(id), "duplicate provider alias"); aliases.add(id); }
  }
  check(Array.isArray(value.capabilities?.models) && value.capabilities.models.length > 0 && value.capabilities.models.length <= 50000, "invalid model capabilities");
  for (const row of value.capabilities.models) {
    check(text(row?.match?.model, 300) && row.match.model.length > 0 && row.capabilities && typeof row.capabilities === "object", "invalid model row");
    for (const key of ["contextWindow", "maxTokens"]) if (row.capabilities[key] !== undefined) check(Number.isSafeInteger(row.capabilities[key]) && row.capabilities[key] > 0 && row.capabilities[key] <= 100000000, "invalid model limit");
    const r = row.capabilities.reasoning;
    if (r?.dialect !== undefined) check(DIALECTS.has(r.dialect), "unsupported reasoning protocol");
    if (r?.efforts !== undefined) check(Array.isArray(r.efforts) && r.efforts.every(e => EFFORTS.has(e)), "invalid reasoning effort");
  }
  // This is data only; reject prototype mutation keys at every depth.
  const walk = item => { if (item && typeof item === "object") for (const [k, v] of Object.entries(item)) { check(!["__proto__", "prototype", "constructor"].includes(k), "forbidden field"); walk(v); } };
  walk(value);
  return value;
}
function verifyEnvelope(envelope, publicKeys) {
  check(envelope && typeof envelope.payload === "string" && envelope.payload.length <= MAX_BYTES * 1.4, "invalid signed payload");
  check(typeof envelope.keyId === "string" && Object.hasOwn(publicKeys, envelope.keyId), "unknown signing key");
  const key = crypto.createPublicKey(publicKeys[envelope.keyId]);
  check(key.asymmetricKeyType === "ed25519", "signing key must be Ed25519");
  const bytes = Buffer.from(envelope.payload, "base64");
  check(bytes.length <= MAX_BYTES && bytes.toString("base64") === envelope.payload, "invalid payload encoding");
  check(typeof envelope.signature === "string" && crypto.verify(null, bytes, key, Buffer.from(envelope.signature, "base64")), "invalid signature");
  return { directory: validateDirectory(JSON.parse(bytes.toString("utf8"))), bytes, hash: crypto.createHash("sha256").update(bytes).digest("hex") };
}
module.exports = { MAX_BYTES, validateDirectory, verifyEnvelope, validateUrl: url };
