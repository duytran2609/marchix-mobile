import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

export type PdfPreviewProps = { bytes: Uint8Array; name: string; onError: () => void };

export function PdfPreview({ bytes, onError }: PdfPreviewProps) {
  const [document, setDocument] = useState<{ uri: string; Viewer: typeof import('react-native-pdf').default }>();
  useEffect(() => {
    const file = new File(Paths.cache, `preview-${Date.now()}-${Math.random().toString(36).slice(2)}.pdf`);
    let active = true;
    let writing = true;
    async function load() {
      try {
        const { default: Viewer } = await import('react-native-pdf');
        if (!active) return;
        file.create();
        await file.write(bytes);
        if (active) setDocument({ uri: file.uri, Viewer });
      } catch {
        if (active) onError();
      } finally {
        writing = false;
        if (!active && file.exists) file.delete();
      }
    }
    void load();
    return () => {
      active = false;
      if (!writing && file.exists) file.delete();
    };
  }, [bytes, onError]);
  return document ? <document.Viewer source={{ uri: document.uri }} style={{ flex: 1, width: '100%' }} trustAllCerts={false}
    enableAnnotationRendering={false} onPressLink={() => undefined} onError={onError} /> : <ActivityIndicator />;
}
