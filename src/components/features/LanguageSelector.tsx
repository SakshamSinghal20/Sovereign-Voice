import { Globe2 } from 'lucide-react';
import { LANGUAGES } from '../../lib/constants';
import type { LanguageCode } from '../../types';

interface LanguageSelectorProps {
  value: LanguageCode;
  onChange: (language: LanguageCode) => void;
}

export function LanguageSelector({ value, onChange }: LanguageSelectorProps) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-800 shadow-sm">
      <Globe2 className="h-4 w-4 text-sovereign" aria-hidden="true" />
      <span className="sr-only">Choose language</span>
      <select
        className="min-h-9 bg-transparent text-sm outline-none"
        value={value}
        onChange={(event) => onChange(event.target.value as LanguageCode)}
        aria-label="Selected language"
      >
        {LANGUAGES.map((language) => (
          <option key={language.code} value={language.code}>
            {language.flag} {language.nativeName}
          </option>
        ))}
      </select>
    </label>
  );
}
