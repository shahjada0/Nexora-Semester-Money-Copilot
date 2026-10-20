import { CopilotApp } from '@/components/CopilotApp';

export const dynamic = 'force-dynamic';

export default function Home({ searchParams }: { searchParams: { demo?: string } }) {
  return <CopilotApp demo={searchParams.demo === '1'} />;
}
