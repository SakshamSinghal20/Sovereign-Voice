import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { LANGUAGES } from '../lib/constants';
import type { LanguageCode } from '../types';

const CHUNK_LIMIT = 180;

export function useTextToSpeech(language: LanguageCode) {
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const keepAliveRef = useRef<number | null>(null);

  const isSupported = useMemo(() => typeof window !== 'undefined' && 'speechSynthesis' in window, []);

  const clearKeepAlive = useCallback(() => {
    if (keepAliveRef.current !== null) {
      window.clearInterval(keepAliveRef.current);
      keepAliveRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isSupported) {
      return undefined;
    }

    const loadVoices = () => {
      setVoices(window.speechSynthesis.getVoices());
    };

    loadVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', loadVoices);

    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', loadVoices);
    };
  }, [isSupported]);

  const stop = useCallback(() => {
    if (!isSupported) {
      return;
    }

    clearKeepAlive();
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [clearKeepAlive, isSupported]);

  const speak = useCallback(
    (text: string) => {
      const speechText = normalizeSpeechText(text);
      if (!isSupported || !speechText) {
        return false;
      }

      const selectedLanguage = LANGUAGES.find((item) => item.code === language);
      const lang = selectedLanguage?.speechCode ?? 'en-IN';
      const availableVoices = voices.length ? voices : window.speechSynthesis.getVoices();
      const voice = pickVoice(availableVoices, lang);
      const chunks = chunkSpeechText(speechText);
      let chunkIndex = 0;

      clearKeepAlive();
      window.speechSynthesis.cancel();
      setIsSpeaking(true);

      const speakNext = () => {
        const chunk = chunks[chunkIndex];
        if (!chunk) {
          clearKeepAlive();
          setIsSpeaking(false);
          return;
        }

        chunkIndex += 1;
        const utterance = new SpeechSynthesisUtterance(chunk);
        utterance.lang = voice?.lang ?? lang;
        utterance.voice = voice ?? null;
        utterance.rate = 0.9;
        utterance.pitch = 1;
        utterance.onend = speakNext;
        utterance.onerror = () => {
          clearKeepAlive();
          setIsSpeaking(false);
        };

        window.speechSynthesis.speak(utterance);
        window.speechSynthesis.resume();
      };

      keepAliveRef.current = window.setInterval(() => {
        if (window.speechSynthesis.speaking && window.speechSynthesis.paused) {
          window.speechSynthesis.resume();
        }
      }, 3000);

      speakNext();
      return true;
    },
    [clearKeepAlive, isSupported, language, voices]
  );

  useEffect(() => stop, [stop]);

  return {
    isSupported,
    isSpeaking,
    speak,
    stop
  };
}

function pickVoice(voices: SpeechSynthesisVoice[], language: string) {
  const languagePrefix = language.split('-')[0];
  const exact = voices.find((voice) => voice.lang.toLowerCase() === language.toLowerCase());
  const regional = voices.find(
    (voice) => voice.lang.toLowerCase().startsWith(`${languagePrefix}-`) && /india|in\b/i.test(voice.name)
  );
  const sameLanguage = voices.find((voice) => voice.lang.toLowerCase().startsWith(languagePrefix));

  return exact ?? regional ?? sameLanguage ?? null;
}

function normalizeSpeechText(text: string) {
  return text
    .replace(/[*_`#>]/g, '')
    .replace(/\[(.*?)\]\((.*?)\)/g, '$1')
    .replace(/\bPAN\b/g, 'P A N')
    .replace(/\bUIDAI\b/g, 'U I D A I')
    .replace(/\s+/g, ' ')
    .trim();
}

function chunkSpeechText(text: string) {
  const chunks: string[] = [];
  let remaining = text.trim();

  while (remaining.length > CHUNK_LIMIT) {
    const slice = remaining.slice(0, CHUNK_LIMIT);
    const breakIndex = Math.max(slice.lastIndexOf('।'), slice.lastIndexOf('.'), slice.lastIndexOf(','), slice.lastIndexOf(' '));
    const end = breakIndex > 40 ? breakIndex + 1 : CHUNK_LIMIT;
    chunks.push(remaining.slice(0, end).trim());
    remaining = remaining.slice(end).trim();
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}
