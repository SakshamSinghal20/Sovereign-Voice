export type LanguageCode = 'en' | 'hi' | 'ta' | 'te' | 'bn';

export interface LanguageOption {
  code: LanguageCode;
  name: string;
  nativeName: string;
  speechCode: string;
  sarvamCode: string;
  flag: string;
}

export interface ParsedDocument {
  fullName?: string;
  documentNumber?: string;
  dateOfBirth?: string;
  address?: string;
  gender?: string;
  documentType?: string;
  issuedDate?: string;
  rawText: string;
  fields: Record<string, string>;
  localizedFields?: Partial<Record<LanguageCode, Record<string, string>>>;
  confidence?: number;
}

export type MessageType = 'text' | 'error' | 'document-ref';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  type: MessageType;
}

export interface AppState {
  uploadedDocument: File | null;
  documentPreview: string | null;
  parsedDocument: ParsedDocument | null;
  isAnalyzing: boolean;
  messages: Message[];
  isLoading: boolean;
  selectedLanguage: LanguageCode;
  isListening: boolean;
  isSpeaking: boolean;
}

export interface ApiAnswer {
  answer: string;
  confidence?: number;
}

export interface ToastMessage {
  id: string;
  tone: 'success' | 'error' | 'info';
  title: string;
  description?: string;
}

export interface SpeechRecognitionEventLike extends Event {
  results: SpeechRecognitionResultList;
}

export interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
