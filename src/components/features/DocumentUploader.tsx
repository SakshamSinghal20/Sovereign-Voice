import { useCallback, useRef, useState } from 'react';
import { FileImage, UploadCloud } from 'lucide-react';
import { ACCEPTED_DOCUMENT_TYPES, MAX_FILE_SIZE_BYTES } from '../../lib/constants';
import { cn } from '../../lib/utils';
import { Button } from '../ui/Button';
import { Spinner } from '../ui/Spinner';

interface DocumentUploaderProps {
  fileName?: string;
  isAnalyzing: boolean;
  onFileSelect: (file: File) => void;
  onTryDemo: () => void;
}

export function DocumentUploader({ fileName, isAnalyzing, onFileSelect, onTryDemo }: DocumentUploaderProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validateAndSelect = useCallback(
    (file: File | undefined) => {
      if (!file) {
        return;
      }

      if (!ACCEPTED_DOCUMENT_TYPES.includes(file.type)) {
        setError('Please upload a JPG, PNG, WEBP, or PDF document.');
        return;
      }

      if (file.size > MAX_FILE_SIZE_BYTES) {
        setError('This file is larger than 10MB. Please choose a smaller image.');
        return;
      }

      setError(null);
      onFileSelect(file);
    },
    [onFileSelect]
  );

  return (
    <section aria-labelledby="upload-title" className="space-y-3">
      <div
        className={cn(
          'flex min-h-[260px] flex-col items-center justify-center rounded-lg border-2 border-dashed bg-white px-5 py-8 text-center shadow-soft transition sm:min-h-[300px]',
          isDragging ? 'scale-[1.01] border-sovereign bg-purple-50' : 'border-slate-300',
          error && 'border-danger bg-red-50'
        )}
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setIsDragging(false);
          validateAndSelect(event.dataTransfer.files[0]);
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="sr-only"
          onChange={(event) => validateAndSelect(event.target.files?.[0])}
        />

        <div className="mb-4 rounded-full bg-gradient-to-r from-saffron/15 to-sovereign/15 p-4">
          {isAnalyzing ? (
            <Spinner className="h-8 w-8 text-sovereign" />
          ) : fileName ? (
            <FileImage className="h-8 w-8 text-success" aria-hidden="true" />
          ) : (
            <UploadCloud className="h-8 w-8 text-sovereign" aria-hidden="true" />
          )}
        </div>

        <h2 id="upload-title" className="text-lg font-bold text-slate-950">
          {fileName ? fileName : 'Upload or drag your document'}
        </h2>
        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-600">
          Supports Aadhaar, PAN, Voter ID, and Passport files. JPG, PNG, WEBP, or PDF up to 10MB.
        </p>

        {error && (
          <p className="mt-3 rounded-md bg-red-100 px-3 py-2 text-sm font-medium text-red-700" role="alert">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <Button type="button" onClick={() => inputRef.current?.click()} disabled={isAnalyzing}>
            Choose file
          </Button>
          <Button type="button" variant="secondary" onClick={onTryDemo} disabled={isAnalyzing}>
            Try Sample Document
          </Button>
        </div>
      </div>
    </section>
  );
}
