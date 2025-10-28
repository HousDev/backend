// config/digio.js
const isProd = /^(prod|production)$/i.test(process.env.DIGIO_ENV || "");
const DIGIO_BASE = isProd ? "https://api.digio.in" : "https://ext.digio.in:444";

function getAuthHeader() {
  const id = process.env.DIGIO_CLIENT_ID || "";
  const secret = process.env.DIGIO_CLIENT_SECRET || "";
  if (!id || !secret) throw new Error("DIGIO_CLIENT_ID / DIGIO_CLIENT_SECRET missing");
  return "Basic " + Buffer.from(`${id}:${secret}`).toString("base64");
}

module.exports = { DIGIO_BASE, getAuthHeader };
