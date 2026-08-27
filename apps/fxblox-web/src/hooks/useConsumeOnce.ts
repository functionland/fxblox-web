/**
 * Read a search param once and strip it from the URL (history `replace`), so a remount / refresh / back does not
 * re-apply it — the mobile `prefillScenario` param semantics (Diagnostics tab, `/blox-ai?scenario=`).
 */
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router';

export function useConsumeOnce(name: string): string | null {
  const [searchParams, setSearchParams] = useSearchParams();
  const [value] = useState<string | null>(() => searchParams.get(name));

  useEffect(() => {
    if (!searchParams.has(name)) return;
    const next = new URLSearchParams(searchParams);
    next.delete(name);
    setSearchParams(next, { replace: true });
  }, [name, searchParams, setSearchParams]);

  return value;
}
