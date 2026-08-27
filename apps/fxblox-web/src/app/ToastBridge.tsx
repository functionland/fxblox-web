// Wires the UI-free `platform/notify` port to the fx-ui ToastProvider once it is mounted (buffered toasts replay).
import { useEffect } from 'react';
import { useToast } from '@functionland/fx-ui';
import { setToastSink, type ToastMessage } from '@/platform/notify';

export function ToastBridge() {
  const { queueToast } = useToast();
  useEffect(() => {
    setToastSink(
      (m: ToastMessage) =>
        queueToast({
          type: m.type,
          title: m.title,
          message: m.message,
          ...(m.duration ? { autoHideDuration: m.duration } : {}),
        }),
      { replayBuffered: true },
    );
    return () => setToastSink(null);
  }, [queueToast]);
  return null;
}
