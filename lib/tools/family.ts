import { z } from 'zod';
import { getDb } from '../db';
import { now } from '../clock';
import { fmt } from '../money';
import { getProposal } from '../ledger';
import { gateFamilyDecision, gateFamilyRequest } from '../gate';
import { checkFamilyToken, createFamilyLink, recordFamilyDecision } from '../family';
import type { FamilyCard } from '../cards';
import { defineTool, type ToolResult } from './types';

export const requestFamilyApproval = defineTool({
  name: 'requestFamilyApproval',
  description: 'Student-only: create a single-use, expiring approval link for a parent on a pending Tier 3 payment.',
  schema: z.object({ proposalId: z.string().max(64), baseUrl: z.string().url().max(200).optional() }),
  parameters: { type: 'object', properties: {} },
  agentCallable: false,
  async run(params, ctx): Promise<ToolResult> {
    const p = getProposal(params.proposalId);
    const d = gateFamilyRequest(p, ctx.actor);
    if (d.decision === 'blocked') {
      return { tier: 3, decision: 'blocked', reasons: d.reasons, cards: [{ type: 'blocked', tier: 3, decision: 'blocked', title: 'Family approval not created', why: d.reasons[0], reasons: d.reasons, checks: [] }], summary: d.reasons.join(' ') };
    }
    // A new link supersedes any earlier unused one.
    getDb().prepare(`UPDATE family_links SET used_at = ?, decision = 'superseded' WHERE proposal_id = ? AND used_at IS NULL`).run(now(), p!.id);
    const { token, linkId, expiresAt } = createFamilyLink(p!);
    const link = `${(params.baseUrl ?? '').replace(/\/$/, '')}/family/${token}`;
    const card: FamilyCard = {
      type: 'family',
      tier: 3,
      decision: 'needs_confirmation',
      why: `The payment of ${fmt(p!.amount_minor, 'GBP')} now needs two approvals: yours (re-type + OTP) and your father's (this link). The link works once and expires in 24 h.`,
      proposalId: p!.id,
      link,
      expiresAt,
      approver: 'Abdul Rahman (father)',
    };
    return {
      tier: 3,
      decision: 'needs_confirmation',
      reasons: d.reasons,
      cards: [card],
      summary: `Family approval link created for proposal ${p!.id}.`,
      audit: { proposalId: p!.id, linkId, expiresAt },
    };
  },
});

export const familyDecision = defineTool({
  name: 'familyDecision',
  description: 'Parent-only: approve or reject through the family link.',
  schema: z.object({ token: z.string().min(20).max(1000), decision: z.enum(['approved', 'rejected']) }),
  parameters: { type: 'object', properties: {} },
  agentCallable: false,
  async run(params, ctx): Promise<ToolResult> {
    const check = checkFamilyToken(params.token);
    const d = gateFamilyDecision(check.ok, check.ok ? null : check.reason, ctx.actor);
    if (d.decision === 'blocked' || !check.ok) {
      return { tier: 3, decision: 'blocked', reasons: d.reasons, cards: [], summary: d.reasons.join(' '), audit: { linkId: check.link?.id, proposalId: check.proposal?.id } };
    }
    recordFamilyDecision(check.link, params.decision);
    return {
      tier: 3,
      decision: params.decision === 'approved' ? 'allowed' : 'blocked',
      reasons: [params.decision === 'approved' ? 'Parent approved the payment.' : 'Parent rejected the payment; it was cancelled.'],
      cards: [],
      summary: `Parent ${params.decision} proposal ${check.proposal.id}.`,
      audit: { linkId: check.link.id, proposalId: check.proposal.id, decision: params.decision, bindingHash: check.proposal.binding_hash },
    };
  },
});
