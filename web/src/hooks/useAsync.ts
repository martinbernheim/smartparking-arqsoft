import { useCallback, useEffect, useRef, useState, type DependencyList } from 'react';
import { reportError } from '../api/client';

export function useAsync<T>(fn: () => Promise<T>, deps: DependencyList) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(() => {
    const my = ++seq.current;
    setLoading(true);
    setError(null);
    fn().then(
      (d) => { if (my === seq.current) { setData(d); setLoading(false); } },
      (e) => { if (my === seq.current) { setError(e); setLoading(false); reportError(e, 'No se pudieron cargar los datos.'); } },
    );
  }, deps);

  useEffect(() => { run(); return () => { seq.current++; }; }, [run]);
  return { data, setData, error, loading, reload: run };
}
