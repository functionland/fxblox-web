/**
 * Placeholder screens for the route table. Screen builders replace the stub *files* (each is a default-export
 * module at the path the manifests import) — this helper stays for any route that is not ported yet.
 */
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxEmptyState, FxPageHeader, FxText } from '@functionland/fx-ui';
import { consumeDeepLinkStash } from '@/app/deepLinkStash';
import { paths, slugify } from '@/app/paths';
import { SetupFooter } from '@/app/shells/SetupShell';
import { STEP_ROUTES, type SetupStep } from '@/features/setup/setupMachine';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export interface StubScreenProps {
  /** i18n key (or literal) for the screen name. */
  titleKey: string;
  /** Route params to echo (from `useParams()`); search params are echoed automatically. */
  params?: Record<string, string | undefined>;
  /** Back-button fallback path; `false` hides the back button (top-level tabs). */
  back?: string | false;
  actions?: ReactNode;
  /** Render without the FxPageHeader (e.g. when a layout provides one). */
  bare?: boolean;
}

function ParamList({ entries }: { entries: [string, string][] }) {
  const { t } = useTranslation();
  if (entries.length === 0) return null;
  return (
    <dl
      aria-label={t('shell.params')}
      data-testid="route-params"
      className="mx-auto grid max-w-[520px] grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-fx-m bg-background-primary px-4 py-3"
    >
      {entries.map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="fx-text-bodyXSSemibold text-content3">{key}</dt>
          <dd className="break-all font-mono fx-text-bodyXSRegular text-content1" data-param={key}>
            {value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function useEchoedParams(params?: Record<string, string | undefined>): [string, string][] {
  const [search] = useSearchParams();
  const entries: [string, string][] = [];
  for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) entries.push([k, v]);
  for (const [k, v] of search.entries()) entries.push([`?${k}`, v]);
  return entries;
}

export function StubScreen({ titleKey, params, back, actions, bare }: StubScreenProps) {
  const { t } = useTranslation();
  const { back: goBack } = useAppNavigate();
  const name = t(titleKey, { defaultValue: titleKey });
  const entries = useEchoedParams(params);
  const slug = slugify(name);

  return (
    <FxBox
      as="section"
      data-screen={slug}
      testID={`stub-${slug}`}
      className="mx-auto w-full max-w-[720px] px-5"
    >
      {!bare && (
        <FxPageHeader
          title={name}
          onBack={back === false ? undefined : () => goBack(back ?? paths.blox)}
          backLabel={t('shell.back')}
          actions={actions}
        />
      )}
      <FxEmptyState
        title={t('shell.comingSoon', { name })}
        description={t('shell.comingSoonHint')}
      />
      <ParamList entries={entries} />
    </FxBox>
  );
}

/** Static "happy path" order so the stub setup flow is walkable end to end; the real screens own this logic. */
const NEXT_STEP: Partial<Record<SetupStep, () => string>> = {
  welcome: () => STEP_ROUTES.requirements,
  requirements: () => STEP_ROUTES.linkPassword,
  linkPassword: () => STEP_ROUTES.connectToBlox,
  connectToBlox: () => STEP_ROUTES.setBloxAuthorizer,
  connectToExistingBlox: () => paths.setup.setAuthorizer({ manual: true }),
  setBloxAuthorizer: () => STEP_ROUTES.connectToWifi,
  connectToWifi: () => STEP_ROUTES.checkConnection,
  checkConnection: () => STEP_ROUTES.setupComplete,
  // "Home": the single deep-link stash consumption point (plan §WS4).
  setupComplete: () => consumeDeepLinkStash() ?? STEP_ROUTES.done,
};

export interface SetupStubScreenProps {
  step: Exclude<SetupStep, 'done'>;
}

export function SetupStubScreen({ step }: SetupStubScreenProps) {
  const { t } = useTranslation();
  const { navigate, back } = useAppNavigate();
  const name = t(`setup.steps.${step}`, { defaultValue: step });
  const entries = useEchoedParams();
  const next = NEXT_STEP[step];
  const isLast = step === 'setupComplete';

  return (
    <FxBox
      as="section"
      data-screen={`setup-${slugify(step)}`}
      testID={`stub-setup-${slugify(step)}`}
      className="flex flex-1 flex-col"
    >
      <FxText as="h1" variant="h300" color="content1" marginBottom="8">
        {name}
      </FxText>
      <FxEmptyState
        title={t('shell.comingSoon', { name })}
        description={t('shell.comingSoonHint')}
      />
      <ParamList entries={entries} />
      <SetupFooter>
        <FxBox flexDirection="row" gap="12">
          {step !== 'welcome' && (
            <FxButton variant="inverted" flex={1} onPress={() => back(STEP_ROUTES.welcome)}>
              {t('shell.setup.back')}
            </FxButton>
          )}
          {next && (
            <FxButton
              flex={1}
              onPress={() => void navigate(next(), { replace: isLast })}
              testID="setup-continue"
            >
              {isLast ? t('shell.setup.home') : t('shell.setup.continue')}
            </FxButton>
          )}
        </FxBox>
      </SetupFooter>
    </FxBox>
  );
}
