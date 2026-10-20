import { beforeEach, describe, expect, it } from 'vitest';
import { freshSandbox } from './helpers';
import { append, listAudit, verifyChain, verifyRecords, GENESIS_HASH } from '@/lib/audit';
import { hashEntry } from '@/lib/audit/log';
import { getDb } from '@/lib/db';
import { canonicalJSON, sha256 } from '@/lib/util';

beforeEach(() => freshSandbox());

describe('hash-chained audit log', () => {
  it('starts from the genesis hash with the seed event', () => {
    const [first] = listAudit();
    expect(first.seq).toBe(1);
    expect(first.prevHash).toBe(GENESIS_HASH);
    expect(first.action).toBe('sandbox.seed');
  });

  it('hash = sha256(prevHash + canonicalJSON(entry)) and entries link', () => {
    const a = append({ actor: 'agent', action: 'getBalances', tier: 0, decision: 'allowed', reason: 'read' });
    const b = append({ actor: 'agent', action: 'getQuotes', tier: 1, decision: 'allowed', reason: 'suggest' });
    const { hash, ...entry } = b;
    expect(hash).toBe(sha256(entry.prevHash + canonicalJSON(entry)));
    expect(b.prevHash).toBe(a.hash);
    expect(verifyChain().ok).toBe(true);
  });

  it('never stores OTPs and masks bank details', () => {
    const r = append({ actor: 'student', action: 'executePayment', tier: 3, decision: 'blocked', reason: 'x', data: { otp: '123456', accountNumber: '41873960' } });
    expect(r.data.otp).toBe('[redacted]');
    expect(r.data.accountNumber).toBe('••••3960');
  });

  it('the database rejects UPDATE and DELETE on audit_log', () => {
    append({ actor: 'agent', action: 'getBalances', tier: 0, decision: 'allowed', reason: 'read' });
    expect(() => getDb().prepare(`UPDATE audit_log SET reason = 'edited' WHERE seq = 1`).run()).toThrow(/append-only/);
    expect(() => getDb().prepare('DELETE FROM audit_log WHERE seq = 1').run()).toThrow(/append-only/);
  });

  it('detects an edited entry', () => {
    for (let i = 0; i < 5; i++) append({ actor: 'agent', action: `a${i}`, tier: 0, decision: 'allowed', reason: 'r' });
    const records = listAudit();
    records[3] = { ...records[3], decision: 'allowed', reason: 'edited after the fact' };
    const v = verifyRecords(records);
    expect(v.ok).toBe(false);
    expect(v.firstBadSeq).toBe(4);
  });

  it('detects a deleted entry and a re-hashed forgery', () => {
    for (let i = 0; i < 4; i++) append({ actor: 'agent', action: `a${i}`, tier: 0, decision: 'allowed', reason: 'r' });
    const records = listAudit();
    expect(verifyRecords([...records.slice(0, 2), ...records.slice(3)]).ok).toBe(false);

    // Forger edits entry 3 and recomputes its own hash: the link from entry 4 breaks.
    const forged = { ...records[2], reason: 'forged' };
    const { hash: _old, ...entry } = forged;
    const reHashed = { ...entry, hash: hashEntry(entry) };
    const v = verifyRecords([...records.slice(0, 2), reHashed, ...records.slice(3)]);
    expect(v.ok).toBe(false);
    expect(v.firstBadSeq).toBe(4);
  });
});
