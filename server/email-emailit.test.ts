/**
 * Transport Emailit : charge utile envoyée à l'API, lecture de l'identifiant,
 * erreurs, et choix de la config système selon les variables d'environnement.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { sendEmail, getSystemEmailConfig, type EmailConfig } from "./email";

const CFG: EmailConfig = { provider: "emailit", apiKey: "em_x", fromAddress: "noreply@ecole-naturo.fr", fromName: "Naturo Pro", replyTo: "c@exemple.fr" };

function mockFetch(status: number, body: any) {
  const calls: any[] = [];
  (globalThis as any).fetch = async (url: string, init: any) => {
    calls.push({ url, init });
    return { ok: status < 400, status, json: async () => body };
  };
  return calls;
}

test("Emailit : charge utile, auth et id", async () => {
  const calls = mockFetch(200, { id: "em_123" });
  const r = await sendEmail(CFG, "a@b.fr", "Sujet", "<p>x</p>", "x", [{ filename: "f.pdf", content: Buffer.from("hi"), contentType: "application/pdf" }], { "List-Unsubscribe": "<u>" });
  assert.deepEqual(r, { ok: true, id: "em_123" });
  assert.equal(calls[0].url, "https://api.emailit.com/v2/emails");
  assert.equal(calls[0].init.headers.Authorization, "Bearer em_x");
  const p = JSON.parse(calls[0].init.body);
  assert.equal(p.from, "Naturo Pro <noreply@ecole-naturo.fr>");
  assert.equal(p.reply_to, "c@exemple.fr");
  assert.equal(p.attachments[0].content, Buffer.from("hi").toString("base64"));
  assert.equal(p.attachments[0].content_type, "application/pdf");
  assert.equal(p.headers["List-Unsubscribe"], "<u>");
});

test("Emailit : erreur HTTP remontée", async () => {
  mockFetch(422, { message: "domain not verified" });
  assert.deepEqual(await sendEmail(CFG, "a@b.fr", "S", "<p>x</p>"), { ok: false, error: "domain not verified" });
});

test("config système : Emailit prioritaire, repli Resend, sinon null", () => {
  const keep = { ...process.env };
  delete process.env.EMAILIT_API_KEY; delete process.env.RESEND_API_KEY;
  assert.equal(getSystemEmailConfig(), null);
  process.env.RESEND_API_KEY = "re_x";
  assert.equal(getSystemEmailConfig()?.provider, "resend");
  process.env.EMAILIT_API_KEY = "em_x"; process.env.MAIL_FROM = "n@ecole-naturo.fr"; process.env.MAIL_FROM_NAME = "NP";
  const c = getSystemEmailConfig();
  assert.deepEqual([c?.provider, c?.fromAddress, c?.fromName], ["emailit", "n@ecole-naturo.fr", "NP"]);
  process.env = keep as any;
});
