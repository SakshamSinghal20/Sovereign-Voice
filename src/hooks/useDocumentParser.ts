import { useCallback, useState } from 'react';
import { analyzeDocumentImage } from '../lib/api';
import type { LanguageCode, ParsedDocument } from '../types';

export function useDocumentParser() {
  const [parsedDocument, setParsedDocument] = useState<ParsedDocument | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyze = useCallback(async (file: File, language: LanguageCode) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const parsed = await analyzeDocumentImage(file, language);
      setParsedDocument(parsed);
      return parsed;
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Unable to analyze document.';
      setError(message);
      throw parseError;
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const reset = useCallback(() => {
    setParsedDocument(null);
    setError(null);
    setIsAnalyzing(false);
  }, []);

  return {
    parsedDocument,
    setParsedDocument,
    isAnalyzing,
    error,
    setError,
    analyze,
    reset
  };
}
