import { checkFamilyToken, familyView } from '@/lib/family';
import { FamilyApproval } from '@/components/FamilyApproval';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Tuition approval · Semester Money Copilot' };

export default function FamilyPage({ params }: { params: { token: string } }) {
  const token = decodeURIComponent(params.token);
  const check = checkFamilyToken(token);
  const view = check.ok ? familyView(check.proposal) : null;
  const expiresAt = check.ok ? check.link.expires_at : null;
  return <FamilyApproval token={token} view={view} error={check.ok ? null : check.reason} expiresAt={expiresAt} />;
}
