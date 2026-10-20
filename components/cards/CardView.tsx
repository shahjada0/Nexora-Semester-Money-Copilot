'use client';

import type { Card, FamilyCard } from '@/lib/cards';
import { ProposalView, type ConfirmResult } from './ProposalView';
import { AlertView, BalancesView, MonthlyView, BlockedView, InvoiceView, PayeesView, QuotesView, ReceiptView, RunwayView, ScamView, ScheduleView } from './simple';
import { CardShell, Why } from '../ui';
import { Users } from 'lucide-react';

function FamilyView({ c }: { c: FamilyCard }) {
  return (
    <CardShell title="Family approval requested" icon={<Users className="h-4 w-4 text-violet-600" />} tier={c.tier} decision={c.decision} auditSeq={c.auditSeq}>
      <div className="text-sm">
        Sent to {c.approver}. Single-use link, expires {new Date(c.expiresAt).toLocaleString('en-GB')}:
        <a href={c.link} target="_blank" rel="noreferrer" className="mt-1 block break-all font-medium text-violet-700 underline">{c.link}</a>
      </div>
      <Why>{c.why}</Why>
    </CardShell>
  );
}

export function CardView({ card, onResult }: { card: Card; onResult: (r: ConfirmResult) => void }) {
  switch (card.type) {
    case 'invoice':
      return <InvoiceView c={card} />;
    case 'quotes':
      return <QuotesView c={card} />;
    case 'proposal':
      return <ProposalView c={card} onResult={onResult} />;
    case 'receipt':
      return <ReceiptView c={card} />;
    case 'blocked':
      return <BlockedView c={card} />;
    case 'scam':
      return <ScamView c={card} />;
    case 'runway':
      return <RunwayView c={card} />;
    case 'monthly':
      return <MonthlyView c={card} />;
    case 'balances':
      return <BalancesView c={card} />;
    case 'alert':
      return <AlertView c={card} />;
    case 'schedule':
      return <ScheduleView c={card} />;
    case 'payees':
      return <PayeesView c={card} />;
    case 'family':
      return <FamilyView c={card} />;
    default:
      return null;
  }
}
