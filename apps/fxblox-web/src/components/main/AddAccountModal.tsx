// Port of apps/box/src/components/Modals/AddAccountModal.tsx (FxBottomSheetModal → FxSheet, same ref API).
import { useEffect, useState, type Ref } from 'react';
import { useTranslation } from 'react-i18next';
import { FxBox, FxButton, FxSheet, FxTextInput, type FxSheetMethods } from '@functionland/fx-ui';

export type AddAccountForm = {
  seed?: string;
};

export interface AddAccountModalProps {
  form?: AddAccountForm;
  onSubmit?: (form: AddAccountForm) => void | Promise<void>;
  ref?: Ref<FxSheetMethods>;
}

export function AddAccountModal({ form, onSubmit, ref }: AddAccountModalProps) {
  const { t } = useTranslation();
  const [addForm, setAddForm] = useState<AddAccountForm>({ seed: form?.seed });
  useEffect(() => {
    setAddForm({ ...form });
  }, [form]);

  return (
    <FxSheet ref={ref} title={t('main.addAccount.title')} testID="add-account-modal">
      <FxBox paddingVertical="8">
        <FxBox marginBottom="24">
          <FxTextInput
            caption={t('main.addAccount.seed')}
            value={addForm.seed ?? ''}
            onChangeText={(txt) => setAddForm((prev) => ({ ...prev, seed: txt }))}
            testID="add-account-seed"
          />
        </FxBox>
        <FxButton
          size="large"
          disabled={!addForm.seed}
          onPress={() => void onSubmit?.(addForm)}
          testID="add-account-create"
        >
          {t('main.addAccount.create')}
        </FxButton>
      </FxBox>
    </FxSheet>
  );
}

export default AddAccountModal;
