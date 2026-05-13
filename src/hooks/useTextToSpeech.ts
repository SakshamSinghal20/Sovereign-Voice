import { useCallback, useMemo, useState } from 'react';
import { LANGUAGES } from '../lib/constants';
import type { LanguageCode } from '../types';

export function useTextToSpeech(language: LanguageCode) {
  const [isSpeaking, setIsSpeaking] = useState(false);

  const isSupported = useMemo(() => typeof window !== 'undefined' && 'speechSynthesis' in window, []);

  const stop = useCallback(() => {
    if (!isSupported) {
      return;
    }

    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [isSupported]);

  const speak = useCallback(
    (text: string) => {
      if (!isSupported || !text.trim()) {
        return;
      }

      window.speechSynthesis.cancel();
      const selectedLanguage = LANGUAGES.find((item) => item.code === language);
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = selectedLanguage?.speechCode ?? 'en-IN';
      utterance.rate = 0.92;
      utterance.pitch = 1;
      utterance.onend = () => setIsSpeaking(false);
      utterance.onerror = () => setIsSpeaking(false);
      setIsSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [isSupported, language]
  );

  return {
    isSupported,
    isSpeaking,
    speak,
    stop
  };
}
