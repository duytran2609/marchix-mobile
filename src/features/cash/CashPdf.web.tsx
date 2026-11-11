import { createElement, useEffect, useState } from 'react';
import type { CashPdfProps } from './CashPdf';

export function CashPdf({ bytes, name, onError }: CashPdfProps) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/pdf' }));
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [bytes]);
  if (!url) return null;
  return createElement('iframe', { title: name, src: url, onError, style: { flex: 1, width: '100%', border: 0 } });
}
