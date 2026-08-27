// Ported VERBATIM (typing tightened for strict TS) from apps/box/src/hooks/useFetch.ts
import { useEffect, useRef, useState } from 'react';

export interface IUseFetchProps<TData, TParams> {
  initialLoading?: boolean;
  initialError?: Error | null;
  initialData?: TData | null;
  apiMethod: (params: TParams | null) => Promise<TData | null>;
  params?: TParams | null;
  mungResponse?: ((data: TData | null) => TData | null) | null;
}

export const useFetch = <TData, TParams>({
  initialLoading = true,
  initialError = null,
  initialData = null,
  apiMethod,
  params: initialParams = null,
  mungResponse = null,
}: IUseFetchProps<TData, TParams>) => {
  const [loading, setLoading] = useState<boolean>(initialLoading);
  const [error, setError] = useState<Error | null>(initialError);
  const [data, setData] = useState<TData | null>(initialData);
  const params = useRef(initialParams);

  const fetch = async () => {
    try {
      const response = await apiMethod(params.current);
      setError(null);
      if (mungResponse) {
        setData(mungResponse(response));
      } else {
        setData(response);
      }
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      console.log('err', err);
      setData(null);
    }
  };

  const fetchWithLoading = async (): Promise<void> => {
    setLoading(true);
    await fetch();
    setLoading(false);
  };

  const refetch = async ({ params: nextParams, withLoading = true }: { params?: TParams; withLoading?: boolean } = {}): Promise<void> => {
    if (nextParams) {
      params.current = nextParams;
    }
    if (withLoading) {
      await fetchWithLoading();
    } else {
      await fetch();
    }
  };

  useEffect(() => {
    if (initialLoading) void fetchWithLoading();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading, error, data, refetch };
};

interface IUseFetchWithBLEProps<TData, TParams> extends IUseFetchProps<TData, TParams> {
  bleMethod?: (params: TParams) => Promise<TData | null>;
  shouldTryBLE?: boolean;
}

export const useFetchWithBLE = <TData, TParams>({
  initialLoading = true,
  initialError = null,
  initialData = null,
  apiMethod,
  bleMethod,
  shouldTryBLE = true,
  params: initialParams = null,
  mungResponse = null,
}: IUseFetchWithBLEProps<TData, TParams>) => {
  const [loading, setLoading] = useState<boolean>(initialLoading);
  const [error, setError] = useState<Error | null>(initialError);
  const [data, setData] = useState<TData | null>(initialData);
  const params = useRef(initialParams);
  const mounted = useRef(false);

  const fetch = async (useBLE = false) => {
    try {
      if (useBLE && bleMethod && params.current) {
        const bleResponse = await bleMethod(params.current);
        if (bleResponse) {
          setError(null);
          setData({ data: mungResponse ? mungResponse(bleResponse) : bleResponse } as unknown as TData);
          return true; // Successfully handled by BLE - don't fallback
        }
      }

      const response = await apiMethod(params.current);
      setError(null);
      setData(mungResponse ? mungResponse(response) : response);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
      console.log('err', err);
      setData(null);
      return false;
    }
  };

  const fetchWithLoading = async (useBLE = false): Promise<boolean> => {
    setLoading(true);
    const res = await fetch(useBLE);
    setLoading(false);
    return res;
  };

  const refetch = async ({
    params: nextParams,
    withLoading = true,
    tryBLE = shouldTryBLE,
  }: {
    params?: TParams;
    withLoading?: boolean;
    tryBLE?: boolean;
  } = {}): Promise<void> => {
    if (nextParams) {
      params.current = nextParams;
    }
    if (withLoading) {
      if (tryBLE) {
        const bleSuccess = await fetchWithLoading(true);
        if (!bleSuccess) {
          await fetchWithLoading(false);
        }
      } else {
        await fetchWithLoading(false);
      }
    } else {
      if (tryBLE) {
        const bleSuccess = await fetch(true);
        if (!bleSuccess) {
          await fetch(false);
        }
      } else {
        await fetch(false);
      }
    }
  };

  useEffect(() => {
    if (!mounted.current && initialLoading) {
      mounted.current = true;
      void fetchWithLoading(shouldTryBLE);
    }
    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { loading, error, data, refetch };
};
