import { useState, useCallback, useRef } from 'react';

export interface ToastMessage {
  text: string;
  isError?: boolean;
}

export function useToast() {
  const [toastMessage, setToastMessage] = useState<ToastMessage | null>(null);
  const timerRef = useRef<number | null>(null);

  const showToast = useCallback((text: string, isError = false) => {
    setToastMessage({ text, isError });
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(() => {
      setToastMessage(null);
      timerRef.current = null;
    }, 3200);
  }, []);

  return { toastMessage, showToast };
}
