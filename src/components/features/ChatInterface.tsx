import { FormEvent, useEffect, useRef, useState } from 'react';
import { Mic, MicOff, SendHorizontal, Sparkles } from 'lucide-react';
import { askQuestionAboutDocument } from '../../lib/api';
import { SAMPLE_QUESTIONS } from '../../lib/constants';
import { cn, createId, formatTime } from '../../lib/utils';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import type { LanguageCode, Message, ParsedDocument, ToastMessage } from '../../types';
import { AnswerDisplay } from './AnswerDisplay';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface ChatInterfaceProps {
  parsedDocument: ParsedDocument | null;
  language: LanguageCode;
  messages: Message[];
  isLoading: boolean;
  onMessagesChange: (messages: Message[]) => void;
  onLoadingChange: (value: boolean) => void;
  onNotify?: (toast: Omit<ToastMessage, 'id'>) => void;
}

export function ChatInterface({
  parsedDocument,
  language,
  messages,
  isLoading,
  onMessagesChange,
  onLoadingChange,
  onNotify
}: ChatInterfaceProps) {
  const [input, setInput] = useState('');
  const listRef = useRef<HTMLDivElement | null>(null);
  const { speak, isSpeaking, stop } = useTextToSpeech(language);
  const { isSupported, isListening, error, startListening, stopListening } = useSpeechRecognition(language, (value) => {
    setInput((current) => (current ? `${current} ${value}` : value));
  });

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, isLoading]);

  async function submitQuestion(event?: FormEvent<HTMLFormElement>, quickQuestion?: string) {
    event?.preventDefault();
    const question = (quickQuestion ?? input).trim();

    if (!question || !parsedDocument || isLoading) {
      return;
    }

    const userMessage: Message = {
      id: createId('msg'),
      role: 'user',
      content: question,
      timestamp: new Date(),
      type: 'text'
    };

    onMessagesChange([...messages, userMessage]);
    setInput('');
    onLoadingChange(true);

    try {
      const response = await askQuestionAboutDocument(question, parsedDocument, language);
      const assistantMessage: Message = {
        id: createId('msg'),
        role: 'assistant',
        content: response.answer,
        timestamp: new Date(),
        type: 'document-ref'
      };

      onMessagesChange([...messages, userMessage, assistantMessage]);
      onNotify?.({
        tone: 'success',
        title: 'Answer ready'
      });
    } catch (chatError) {
      const assistantMessage: Message = {
        id: createId('msg'),
        role: 'assistant',
        content: chatError instanceof Error ? chatError.message : 'Unable to answer that question.',
        timestamp: new Date(),
        type: 'error'
      };
      onMessagesChange([...messages, userMessage, assistantMessage]);
      onNotify?.({
        tone: 'error',
        title: 'Could not answer',
        description: assistantMessage.content
      });
    } finally {
      onLoadingChange(false);
    }
  }

  return (
    <Card className="flex min-h-[560px] flex-col overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-950">
            <Sparkles className="h-4 w-4 text-saffron" aria-hidden="true" />
            Ask your document
          </h2>
          <p className="text-xs text-slate-500">
            {parsedDocument ? 'Document ready' : 'Upload and analyze a document to begin'}
          </p>
        </div>
        {isSpeaking && (
          <Button type="button" variant="secondary" className="min-h-9 px-3 text-xs" onClick={stop}>
            Stop audio
          </Button>
        )}
      </div>

      <div
        ref={listRef}
        className="flex-1 space-y-4 overflow-y-auto bg-slate-50 px-4 py-4"
        aria-live="polite"
        aria-label="Conversation history"
      >
        {messages.map((message) => (
          <article
            key={message.id}
            className={cn('flex', message.role === 'user' ? 'justify-end' : 'justify-start')}
          >
            <div
              className={cn(
                'max-w-[88%] rounded-lg px-4 py-3 text-sm shadow-sm',
                message.role === 'user'
                  ? 'bg-gradient-to-r from-saffron to-sovereign text-white'
                  : 'border border-slate-200 bg-white text-slate-900',
                message.type === 'error' && 'border-red-200 bg-red-50 text-red-700'
              )}
            >
              {message.role === 'assistant' && message.type !== 'error' ? (
                <AnswerDisplay
                  answer={message.content}
                  confidence={parsedDocument?.confidence}
                  onCopy={() => {
                    void navigator.clipboard?.writeText(message.content);
                    onNotify?.({ tone: 'success', title: 'Copied answer' });
                  }}
                  onReadAloud={() => speak(message.content)}
                />
              ) : (
                <p className="whitespace-pre-wrap leading-6">{message.content}</p>
              )}
              <time className={cn('mt-2 block text-[11px]', message.role === 'user' ? 'text-white/75' : 'text-slate-400')}>
                {formatTime(message.timestamp)}
              </time>
            </div>
          </article>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
              <div className="flex gap-1" aria-label="AI is typing">
                <span className="h-2 w-2 animate-bounce rounded-full bg-sovereign [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-sovereign [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-sovereign" />
              </div>
            </div>
          </div>
        )}
      </div>

      {parsedDocument && (
        <div className="border-t border-slate-200 bg-white p-3">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            {SAMPLE_QUESTIONS[language].map((question) => (
              <button
                type="button"
                key={question}
                className="shrink-0 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 hover:border-sovereign/50"
                onClick={() => void submitQuestion(undefined, question)}
              >
                {question}
              </button>
            ))}
          </div>

          <form className="flex items-end gap-2" onSubmit={(event) => void submitQuestion(event)}>
            <textarea
              value={input}
              onChange={(event) => setInput(event.target.value.slice(0, 600))}
              rows={1}
              placeholder="Ask in your language..."
              className="min-h-11 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-3 text-sm outline-none transition focus:border-sovereign"
              disabled={isLoading}
            />
            <Button
              type="button"
              variant={isListening ? 'danger' : 'secondary'}
              className="h-11 min-h-11 w-11 px-0"
              aria-label={isListening ? 'Stop voice input' : 'Start voice input'}
              onClick={isListening ? stopListening : startListening}
              disabled={!isSupported}
            >
              {isListening ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
            </Button>
            <Button type="submit" className="h-11 min-h-11 w-11 px-0" aria-label="Send question" disabled={isLoading}>
              <SendHorizontal className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>

          <div className="mt-2 flex justify-between gap-3 text-xs text-slate-500">
            <span>{isListening ? 'Listening...' : error ?? 'Voice uses your selected language when supported.'}</span>
            <span>{input.length}/600</span>
          </div>
        </div>
      )}
    </Card>
  );
}
