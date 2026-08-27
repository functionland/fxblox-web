import { copyToClipboard as platformCopy, readFromClipboard } from '@/platform/clipboard';

export const copyToClipboard = (contents: string): void => {
  void platformCopy(contents);
};

export const copyFromClipboard = async (): Promise<string> => {
  return readFromClipboard();
};
