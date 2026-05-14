import { CheckCircle2, Copy, Volume2 } from 'lucide-react';
import { ANSWER_ACTION_COPY } from '../../lib/constants';
import type { LanguageCode } from '../../types';
import { Button } from '../ui/Button';

interface AnswerDisplayProps {
  answer: string;
  confidence?: number;
  language: LanguageCode;
  onCopy: () => void;
  onReadAloud: () => void;
}

export function AnswerDisplay({ answer, confidence, language, onCopy, onReadAloud }: AnswerDisplayProps) {
  const copy = ANSWER_ACTION_COPY[language];

  return (
    <div className="space-y-3">
      <p className="whitespace-pre-wrap text-sm leading-6 text-slate-800">{answer}</p>
      <div className="flex flex-wrap items-center gap-2">
        {typeof confidence === 'number' && (
          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            {Math.round(confidence * 100)}% {copy.confidence}
          </span>
        )}
        <Button type="button" variant="ghost" className="min-h-9 px-2 text-xs" onClick={onCopy}>
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
          {copy.copy}
        </Button>
        <Button type="button" variant="ghost" className="min-h-9 px-2 text-xs" onClick={onReadAloud}>
          <Volume2 className="h-3.5 w-3.5" aria-hidden="true" />
          {copy.readAloud}
        </Button>
      </div>
    </div>
  );
}
