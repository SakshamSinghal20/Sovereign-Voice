import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileCheck2, Lock, MessageCircle, Mic2, ShieldCheck, Sparkles, Upload } from 'lucide-react';
import { DocumentPreview } from './components/features/DocumentPreview';
import { DocumentUploader } from './components/features/DocumentUploader';
import { LanguageSelector } from './components/features/LanguageSelector';
import { Button } from './components/ui/Button';
import { Spinner } from './components/ui/Spinner';
import { ToastViewport } from './components/ui/Toast';
import { getDocumentDisplayFields, hasSarvamApiKey, localizeDocumentFields } from './lib/api';
import { DEMO_MESSAGES, DEMO_PARSED_DOCUMENT } from './lib/constants';
import { cn, createId, dataUrlToFile } from './lib/utils';
import { useDocumentParser } from './hooks/useDocumentParser';
import type { LanguageCode, Message, ToastMessage } from './types';

const DEMO_IMAGE_URL = '/sample-aadhaar.svg';
const ChatInterface = lazy(() =>
  import('./components/features/ChatInterface').then((module) => ({ default: module.ChatInterface }))
);
type ActiveTab = 'upload' | 'chat';
const ANALYSIS_READY_COPY: Record<LanguageCode, string> = {
  en: 'I found the document and extracted the visible details. You can now ask questions in your selected language.',
  hi: 'मैंने दस्तावेज़ पढ़ लिया है और दिख रही जानकारी निकाल ली है। अब आप इसी भाषा में सवाल पूछ सकते हैं।',
  ta: 'ஆவணத்தைப் படித்து தெரியும் விவரங்களை எடுத்துவிட்டேன். இப்போது இந்த மொழியில் கேள்விகள் கேட்கலாம்.',
  te: 'నేను పత్రాన్ని చదివి కనిపిస్తున్న వివరాలను తీసుకున్నాను. ఇప్పుడు ఈ భాషలో ప్రశ్నలు అడగవచ్చు.',
  bn: 'আমি নথিটি পড়ে দৃশ্যমান তথ্য বের করেছি। এখন আপনি এই ভাষায় প্রশ্ন করতে পারেন।'
};

function App() {
  const [uploadedDocument, setUploadedDocument] = useState<File | null>(null);
  const [documentPreview, setDocumentPreview] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<LanguageCode>('en');
  const [messages, setMessages] = useState<Message[]>([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('upload');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const { parsedDocument, setParsedDocument, isAnalyzing, error, setError, analyze, reset } = useDocumentParser();

  const fileName = uploadedDocument?.name ?? (isDemoMode ? 'sample-aadhaar.svg' : '');
  const canAnalyze = Boolean(uploadedDocument && documentPreview && !parsedDocument);
  const isApiConfigured = hasSarvamApiKey();
  const displayFields = useMemo(
    () => (parsedDocument ? Object.entries(getDocumentDisplayFields(parsedDocument, selectedLanguage)).slice(0, 7) : []),
    [parsedDocument, selectedLanguage]
  );

  const notify = useCallback((toast: Omit<ToastMessage, 'id'>) => {
    const nextToast = { ...toast, id: createId('toast') };
    setToasts((current) => [...current.slice(-2), nextToast]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== nextToast.id));
    }, 4200);
  }, []);

  useEffect(() => {
    return () => {
      if (documentPreview?.startsWith('blob:')) {
        URL.revokeObjectURL(documentPreview);
      }
    };
  }, [documentPreview]);

  useEffect(() => {
    if (!parsedDocument || parsedDocument.localizedFields?.[selectedLanguage]) {
      return;
    }

    let isCancelled = false;
    void localizeDocumentFields(parsedDocument, selectedLanguage).then((localizedDocument) => {
      if (!isCancelled) {
        setParsedDocument(localizedDocument);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [parsedDocument, selectedLanguage, setParsedDocument]);

  const welcomeMessage = useMemo<Message>(
    () => ({
      id: createId('msg'),
      role: 'assistant',
      content: DEMO_MESSAGES[selectedLanguage],
      timestamp: new Date(),
      type: 'document-ref'
    }),
    [selectedLanguage]
  );

  function selectFile(file: File) {
    if (documentPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(documentPreview);
    }

    setUploadedDocument(file);
    setDocumentPreview(URL.createObjectURL(file));
    setParsedDocument(null);
    setMessages([]);
    setError(null);
    setIsDemoMode(false);
    setZoom(1);
    setRotation(0);
    setActiveTab('upload');
    notify({
      tone: 'success',
      title: 'Document ready',
      description: 'Preview loaded. Analyze the document when it looks clear.'
    });
  }

  async function startDemoMode() {
    const response = await fetch(DEMO_IMAGE_URL);
    const blob = await response.blob();
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result);
      const demoFile = dataUrlToFile(dataUrl, 'sample-aadhaar.svg');
      setUploadedDocument(demoFile);
      setDocumentPreview(DEMO_IMAGE_URL);
      setParsedDocument(DEMO_PARSED_DOCUMENT);
      setMessages([welcomeMessage]);
      setIsDemoMode(true);
      setZoom(1);
      setRotation(0);
      setError(null);
      setActiveTab('chat');
      notify({
        tone: 'info',
        title: 'Demo mode loaded',
        description: 'Using a fictional Aadhaar-style sample with mock citizen data.'
      });
    };
    reader.readAsDataURL(blob);
  }

  async function analyzeCurrentDocument() {
    if (!uploadedDocument) {
      return;
    }

    try {
      const parsed = await analyze(uploadedDocument, selectedLanguage);
      const message: Message = {
        id: createId('msg'),
        role: 'assistant',
        content: ANALYSIS_READY_COPY[selectedLanguage],
        timestamp: new Date(),
        type: 'document-ref'
      };
      setMessages([message]);
      setActiveTab('chat');
      notify({
        tone: isApiConfigured ? 'success' : 'info',
        title: isApiConfigured ? 'Analysis complete' : 'Demo analysis complete',
        description: isApiConfigured
          ? 'Sarvam extracted the visible fields. You can ask questions now.'
          : 'No Sarvam key detected, so mock data was used.'
      });
    } catch {
      setMessages([
        {
          id: createId('msg'),
          role: 'assistant',
          content: 'I could not analyze this image yet. Check your API key, image clarity, and network connection, then retry.',
          timestamp: new Date(),
          type: 'error'
        }
      ]);
      notify({
        tone: 'error',
        title: 'Analysis failed',
        description: 'Check the file clarity, network connection, and Sarvam key, then retry.'
      });
    }
  }

  function clearDocument() {
    if (documentPreview?.startsWith('blob:')) {
      URL.revokeObjectURL(documentPreview);
    }

    setUploadedDocument(null);
    setDocumentPreview(null);
    setMessages([]);
    setIsChatLoading(false);
    setZoom(1);
    setRotation(0);
    setIsDemoMode(false);
    reset();
    notify({
      tone: 'info',
      title: 'Document cleared'
    });
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#fff7ed_0%,#f8fafc_36%,#f8fafc_100%)]">
      <ToastViewport toasts={toasts} onDismiss={(id) => setToasts((current) => current.filter((item) => item.id !== id))} />
      <header className="sticky top-0 z-20 border-b border-white/70 bg-white/88 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-saffron to-sovereign text-white shadow-soft">
              <Mic2 className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-lg font-extrabold tracking-normal text-slate-950">Sovereign Voice</h1>
              <p className="truncate text-xs font-medium text-slate-600">Your documents, in your language</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant={isDemoMode ? 'primary' : 'secondary'}
              className="hidden sm:inline-flex"
              onClick={isDemoMode ? clearDocument : () => void startDemoMode()}
            >
              {isDemoMode ? 'Use My Document' : 'Try Demo'}
            </Button>
            <LanguageSelector value={selectedLanguage} onChange={setSelectedLanguage} />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
        {!isApiConfigured && (
          <div className="mb-4 flex gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <p>
              <span className="font-bold">Running in demo mode.</span> Add `VITE_SARVAM_API_KEY` for real document
              analysis and Sarvam-powered answers.
            </p>
          </div>
        )}

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-orange-100 bg-white/86 p-3 shadow-sm">
            <ShieldCheck className="h-5 w-5 text-success" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-800">Client-side first</p>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-orange-100 bg-white/86 p-3 shadow-sm">
            <FileCheck2 className="h-5 w-5 text-sovereign" aria-hidden="true" />
            <p className="text-sm font-semibold text-slate-800">Aadhaar, PAN, Voter ID</p>
          </div>
          <Button
            type="button"
            variant={isDemoMode ? 'primary' : 'secondary'}
            className="sm:hidden"
            onClick={isDemoMode ? clearDocument : () => void startDemoMode()}
          >
            {isDemoMode ? 'Use My Document' : 'Try Demo'}
          </Button>
        </section>

        <section className="mb-5 grid gap-3 md:grid-cols-3" aria-label="Submission highlights">
          <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-950">
              <Sparkles className="h-4 w-4 text-saffron" aria-hidden="true" />
              Multilingual AI
            </div>
            <p className="text-sm leading-6 text-slate-600">Ask in Hindi, Tamil, Telugu, Bengali, or English and get answers in the same language.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-950">
              <Lock className="h-4 w-4 text-success" aria-hidden="true" />
              Privacy aware
            </div>
            <p className="text-sm leading-6 text-slate-600">No login or database. Documents are only processed for the current session.</p>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white/90 p-4 shadow-sm">
            <div className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-950">
              <FileCheck2 className="h-4 w-4 text-sovereign" aria-hidden="true" />
              Submission ready
            </div>
            <p className="text-sm leading-6 text-slate-600">Supports image uploads and PDFs, with mobile-first controls for evaluator demos.</p>
          </div>
        </section>

        <nav className="mb-4 grid grid-cols-2 rounded-lg border border-slate-200 bg-white p-1 shadow-sm lg:hidden" aria-label="Main sections">
          {[
            { id: 'upload' as const, label: 'Upload', icon: Upload },
            { id: 'chat' as const, label: 'Chat', icon: MessageCircle }
          ].map((item) => {
            const Icon = item.icon;

            return (
              <button
                key={item.id}
                type="button"
                className={cn(
                  'flex min-h-11 items-center justify-center gap-2 rounded-md text-sm font-bold transition',
                  activeTab === item.id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100'
                )}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)]">
          <div className={cn('space-y-4', activeTab === 'upload' ? 'block' : 'hidden lg:block')}>
            {!documentPreview ? (
              <DocumentUploader isAnalyzing={isAnalyzing} onFileSelect={selectFile} onTryDemo={() => void startDemoMode()} />
            ) : (
              <DocumentPreview
                previewUrl={documentPreview}
                fileName={fileName}
                fileType={uploadedDocument?.type ?? ''}
                zoom={zoom}
                rotation={rotation}
                onZoomIn={() => setZoom((value) => Math.min(value + 0.15, 1.9))}
                onZoomOut={() => setZoom((value) => Math.max(value - 0.15, 0.65))}
                onRotateLeft={() => setRotation((value) => value - 90)}
                onRotateRight={() => setRotation((value) => value + 90)}
                onClear={clearDocument}
              />
            )}

            {documentPreview && (
              <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-soft">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-sm font-bold text-slate-950">Analysis status</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      {isAnalyzing
                        ? 'Analyzing document with Sarvam. This can take a few moments for real IDs.'
                        : parsedDocument
                          ? 'Ready for questions.'
                          : 'Preview is ready. Analyze when the document looks clear.'}
                    </p>
                  </div>
                  <Button type="button" onClick={() => void analyzeCurrentDocument()} disabled={!canAnalyze || isAnalyzing || isDemoMode}>
                    {isAnalyzing && <Spinner className="h-4 w-4" />}
                    {isAnalyzing ? 'Analyzing document...' : 'Analyze Document'}
                  </Button>
                </div>

                {error && (
                  <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm font-medium text-red-700" role="alert">
                    {error}
                  </p>
                )}

                {parsedDocument && (
                  <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
                    {displayFields.map(([key, value]) => (
                      <div key={key} className="rounded-md bg-slate-50 px-3 py-2">
                        <p className="text-xs font-semibold uppercase text-slate-500">{key}</p>
                        <p className="mt-1 font-semibold text-slate-900">{value}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className={cn(activeTab === 'chat' ? 'block' : 'hidden lg:block')}>
            <Suspense
              fallback={
                <div className="grid min-h-[560px] place-items-center rounded-lg border border-slate-200 bg-white shadow-soft">
                  <Spinner className="text-sovereign" />
                </div>
              }
            >
              <ChatInterface
                parsedDocument={parsedDocument}
                language={selectedLanguage}
                messages={messages}
                isLoading={isChatLoading}
                onMessagesChange={setMessages}
                onLoadingChange={setIsChatLoading}
                onNotify={notify}
              />
            </Suspense>
          </div>
        </div>
      </div>
    </main>
  );
}

export default App;
