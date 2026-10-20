/**
 * Family approval: a secure, expiring, single-use link for the parent.
 * Token = base64url(payload).hmac — payload {l: linkId, p: proposalId, n: nonce, e: expiry}.
 * The DB stores only sha256(token); the link works once (used_at) and expires after POLICY.familyLinkTtlMs.
 */
import { randomBytes } from 'node:crypto';
import { getDb } from './db';
import { now } from './clock';
import { POLICY } from './policy';
import { getPayee, getProposal, type Proposal } from './ledger';
import { hmac, newId, safeEqual, sha256 } from './util';
import { currentBinding } from './gate';
import { SEED } from './db/seed';
import type { Funding } from './cards';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');

export interface FamilyLinkRow {
  id: string;
  proposal_id: string;
  approver: string;
  token_hash: string;
  created_at: number;
  expires_at: number;
  used_at: number | null;
  decision: string | null;
}

export function createFamilyLink(p: Proposal): { token: string; linkId: string; expiresAt: number } {
  const linkId = newId('fam');
  const expiresAt = now() + POLICY.familyLinkTtlMs;
  const payload = b64(JSON.stringify({ l: linkId, p: p.id, n: randomBytes(12).toString('base64url'), e: expiresAt }));
  const token = `${payload}.${hmac(payload)}`;
  const db = getDb();
  db.transaction(() => {
    db.prepare('INSERT INTO family_links(id, proposal_id, approver, token_hash, created_at, expires_at) VALUES (?,?,?,?,?,?)').run(
      linkId, p.id, `${SEED.parent.name} (${SEED.parent.relation.toLowerCase()})`, sha256(token), now(), expiresAt,
    );
    db.prepare(`UPDATE proposals SET family_required = 1, family_status = 'pending' WHERE id = ?`).run(p.id);
  })();
  return { token, linkId, expiresAt };
}

export type TokenCheck =
  | { ok: true; link: FamilyLinkRow; proposal: Proposal }
  | { ok: false; reason: string; link?: FamilyLinkRow; proposal?: Proposal };

/** Verify signature, expiry, single use, and that the payment it refers to is still pending and unchanged. */
export function checkFamilyToken(token: string): TokenCheck {
  const [payload, sig] = token.split('.');
  if (!payload || !sig || !safeEqual(hmac(payload), sig)) return { ok: false, reason: 'This link is not valid.' };
  let data: { l: string; p: string; e: number };
  try {
    data = JSON.parse(unb64(payload));
  } catch {
    return { ok: false, reason: 'This link is not valid.' };
  }
  const link = getDb().prepare('SELECT * FROM family_links WHERE id = ?').get(data.l) as FamilyLinkRow | undefined;
  if (!link || !safeEqual(link.token_hash, sha256(token)) || link.proposal_id !== data.p) return { ok: false, reason: 'This link is not valid.' };
  const proposal = getProposal(link.proposal_id);
  if (!proposal) return { ok: false, reason: 'The payment no longer exists.', link };
  if (link.used_at) return { ok: false, reason: `This link was already used (${link.decision}). Each link works once.`, link, proposal };
  if (now() > link.expires_at) return { ok: false, reason: 'This link has expired. Ask Nusrat to send a new one.', link, proposal };
  if (proposal.status !== 'pending') return { ok: false, reason: `This payment is no longer waiting for approval (status: ${proposal.status}).`, link, proposal };
  const cur = currentBinding(proposal);
  if (!cur || cur.hash !== proposal.binding_hash) return { ok: false, reason: 'The payment details changed after the link was sent. It cannot be approved.', link, proposal };
  return { ok: true, link, proposal };
}

export function recordFamilyDecision(link: FamilyLinkRow, decision: 'approved' | 'rejected'): void {
  const db = getDb();
  db.transaction(() => {
    const res = db.prepare('UPDATE family_links SET used_at = ?, decision = ? WHERE id = ? AND used_at IS NULL').run(now(), decision, link.id);
    if (res.changes !== 1) throw new Error('Link already used.');
    db.prepare(`UPDATE proposals SET family_status = ?, status = CASE WHEN ? = 'rejected' THEN 'cancelled' ELSE status END WHERE id = ?`).run(decision, decision, link.proposal_id);
  })();
}

/** Everything the parent's view needs, from ledger data only. */
export function familyView(p: Proposal) {
  const payee = getPayee(p.payee_id)!;
  const funding = JSON.parse(p.funding_json) as Funding;
  const inv = p.invoice_id ? (getDb().prepare('SELECT fields_json FROM invoices WHERE id = ?').get(p.invoice_id) as { fields_json: string } | undefined) : undefined;
  const fields = inv ? (JSON.parse(inv.fields_json) as { dueDate: string | null; invoiceNumber: string | null }) : null;
  return {
    student: SEED.student.name,
    parent: SEED.parent.name,
    amountMinor: p.amount_minor,
    payeeName: payee.name,
    verified: payee.kind === 'institution',
    accountMasked: `••••${(payee.account_number ?? payee.iban ?? '').slice(-4)}`,
    sortCode: payee.sort_code,
    dueDate: fields?.dueDate ?? null,
    invoiceNumber: fields?.invoiceNumber ?? null,
    funding,
    bindingHash: p.binding_hash,
  };
}

export type FamilyViewData = ReturnType<typeof familyView>;
