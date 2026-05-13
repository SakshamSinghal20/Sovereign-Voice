import { RotateCcw, RotateCw, Trash2, ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

interface DocumentPreviewProps {
  previewUrl: string;
  fileName: string;
  fileType: string;
  zoom: number;
  rotation: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onRotateLeft: () => void;
  onRotateRight: () => void;
  onClear: () => void;
}

export function DocumentPreview({
  previewUrl,
  fileName,
  fileType,
  zoom,
  rotation,
  onZoomIn,
  onZoomOut,
  onRotateLeft,
  onRotateRight,
  onClear
}: DocumentPreviewProps) {
  const isPdf = fileType === 'application/pdf';

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-bold text-slate-950">Document preview</h2>
          <p className="truncate text-xs text-slate-500">{fileName}</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          className="h-10 min-h-10 w-10 px-0"
          aria-label="Remove document"
          onClick={onClear}
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <div className="flex min-h-[280px] items-center justify-center overflow-auto bg-slate-100 p-4 sm:min-h-[360px]">
        {isPdf ? (
          <iframe
            title={`Preview of ${fileName}`}
            src={previewUrl}
            className="h-[520px] w-full max-w-[720px] rounded-md border border-slate-200 bg-white shadow-sm transition-transform"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          />
        ) : (
          <img
            src={previewUrl}
            alt={`Preview of ${fileName}`}
            className="max-h-[520px] max-w-full rounded-md border border-slate-200 bg-white object-contain shadow-sm transition-transform"
            style={{ transform: `scale(${zoom}) rotate(${rotation}deg)` }}
          />
        )}
      </div>

      <div className="grid grid-cols-4 gap-2 border-t border-slate-200 p-3">
        <Button type="button" variant="secondary" aria-label="Zoom out" onClick={onZoomOut}>
          <ZoomOut className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="secondary" aria-label="Zoom in" onClick={onZoomIn}>
          <ZoomIn className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="secondary" aria-label="Rotate left" onClick={onRotateLeft}>
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="secondary" aria-label="Rotate right" onClick={onRotateRight}>
          <RotateCw className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
    </Card>
  );
}
