// fx-ui component gallery (DEV / VITE_ENABLE_GALLERY): /gallery and /gallery/:id
import { useParams } from 'react-router';
import { useTranslation } from 'react-i18next';
import { FxGallery, FxPageHeader } from '@functionland/fx-ui';
import { paths } from '@/app/paths';
import { LanguageSelector } from '@/components/LanguageSelector';
import { useAppNavigate } from '@/hooks/useAppNavigate';

export default function Gallery() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { back } = useAppNavigate();
  return (
    <main data-screen="gallery" className="min-h-dvh bg-background-app text-content1">
      <div className="mx-auto w-full max-w-[1200px] px-5">
        <FxPageHeader
          title={t('shell.gallery.title')}
          onBack={() => back(paths.settings.root)}
          backLabel={t('shell.back')}
          actions={<LanguageSelector />}
        />
      </div>
      <FxGallery only={id} />
    </main>
  );
}
