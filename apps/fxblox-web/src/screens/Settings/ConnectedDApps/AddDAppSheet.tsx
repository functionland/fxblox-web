/**
 * Port of apps/box/src/screens/Settings/ConnectedDApps/modals/AddDAppModal.tsx as an `FxSheet` (imperative
 * `present/close` ref, as on mobile). Choosing another Blox in the dropdown switches the app's current Blox
 * through `useBloxsStore.switchToBlox` (generation-guarded; mobile wrote `currentBloxPeerId` directly, which
 * skipped the fula re-init the authorization call depends on).
 */
import { useEffect, useMemo, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import {
  FxBox,
  FxButton,
  FxDropdown,
  FxSheet,
  FxText,
  FxTextInput,
  useToast,
  type FxSheetMethods,
} from '@functionland/fx-ui';
import { useBloxsStore } from '@/stores/useBloxsStore';
import { useUserProfileStore } from '@/stores/useUserProfileStore';

export type AddAppForm = {
  appName?: string;
  bundleId?: string;
  peerId?: string;
  bloxPeerId?: string;
  accountId?: string;
};

export interface AddDAppSheetProps {
  form?: AddAppForm;
  onSubmit?: (form: AddAppForm) => void;
  ref?: Ref<FxSheetMethods>;
}

export function AddDAppSheet({ form, onSubmit, ref }: AddDAppSheetProps) {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const [addForm, setAddForm] = useState<AddAppForm>({
    appName: form?.appName,
    bundleId: form?.bundleId,
    peerId: form?.peerId,
    bloxPeerId: form?.bloxPeerId,
    accountId: form?.accountId,
  });

  const bloxs = useBloxsStore((state) => state.bloxs);
  const currentBloxPeerId = useBloxsStore((state) => state.currentBloxPeerId);
  const switchToBlox = useBloxsStore((state) => state.switchToBlox);
  const fulaIsReady = useUserProfileStore((state) => state.fulaIsReady);

  // Update the form when a deep link pre-fills it.
  useEffect(() => {
    setAddForm({ ...form });
  }, [form]);

  // The form always targets the current Blox.
  useEffect(() => {
    setAddForm((prev) => ({ ...prev, bloxPeerId: currentBloxPeerId }));
  }, [currentBloxPeerId]);

  const bloxArray = useMemo(() => Object.values(bloxs), [bloxs]);

  const handleOnBloxChange = (peerId: string) => {
    if (peerId === currentBloxPeerId) return;
    if (bloxs[peerId]) {
      void switchToBlox(peerId);
    } else {
      showToast({ type: 'error', message: t('settings.dapps.invalidBlox') });
    }
  };

  const field = (key: keyof AddAppForm, caption: string, testID: string, mono = false) => (
    <FxTextInput
      caption={caption}
      value={addForm[key] ?? ''}
      onChangeText={(txt) => setAddForm((prev) => ({ ...prev, [key]: txt }))}
      mono={mono}
      marginTop="12"
      testID={testID}
    />
  );

  const disabled = !addForm.peerId || !addForm.appName || !addForm.bundleId || !addForm.bloxPeerId;

  return (
    <FxSheet ref={ref} title={t('settings.dapps.authorizeTitle')} testID="add-dapp-sheet">
      <FxBox>
        <FxText as="h2" variant="h200" textAlign="center" marginVertical="24">
          {t('settings.dapps.authorizeTitle')}
        </FxText>
        <FxDropdown
          selectedValue={currentBloxPeerId}
          onValueChange={(value) => handleOnBloxChange(String(value))}
          options={bloxArray.map((blox) => ({ label: blox.name, value: blox.peerId }))}
          title={t('settings.dapps.selectBlox')}
          caption={t('settings.dapps.selectBlox')}
          placeholder={t('settings.dapps.selectBlox')}
          testID="add-dapp-blox"
        />
        <FxBox marginBottom="24">
          {field('appName', t('settings.dapps.appName'), 'add-dapp-name')}
          {field('bundleId', t('settings.dapps.bundleId'), 'add-dapp-bundle', true)}
          {field('peerId', t('settings.dapps.peerId'), 'add-dapp-peer', true)}
          {field('accountId', t('settings.dapps.accountId'), 'add-dapp-account', true)}
        </FxBox>
        <FxButton
          size="large"
          disabled={disabled}
          onPress={fulaIsReady ? () => onSubmit?.(addForm) : undefined}
          aria-disabled={!fulaIsReady || undefined}
          testID="add-dapp-submit"
        >
          {fulaIsReady ? t('settings.dapps.addAndAuthorize') : t('settings.dapps.initializingFula')}
        </FxButton>
      </FxBox>
    </FxSheet>
  );
}

export default AddDAppSheet;
