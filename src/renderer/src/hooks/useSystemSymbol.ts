import { useEffect, useState } from 'react';

const symbolRequests = new Map<string, Promise<string | null>>();

function requestSymbol(name: string): Promise<string | null> {
  let request = symbolRequests.get(name);
  if (!request) {
    request = window.piApi.getSystemSymbol(name).catch(() => null);
    symbolRequests.set(name, request);
  }
  return request;
}

/** Data URL of a macOS SF Symbol, or null until loaded / when unavailable (non-macOS). */
export function useSystemSymbol(name: string): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void requestSymbol(name).then((result) => {
      if (!cancelled) setUrl(result);
    });
    return () => {
      cancelled = true;
    };
  }, [name]);

  return url;
}
