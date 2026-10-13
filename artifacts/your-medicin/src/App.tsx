import { useEffect, useRef, useState, type DragEvent } from 'react';
import { createWorker, type Worker } from 'tesseract.js';
import {
  AlertCircle, ArrowUpRight, Check, CheckCircle2, Clipboard, FileImage,
  FileText, ImagePlus, LockKeyhole, RotateCcw, ShieldCheck, UploadCloud,
} from 'lucide-react';
import { extractMedicineCandidates, type MedicineCandidate } from '@/lib/ocr';

const MAX_FILE_SIZE = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png'];

type Status = 'idle' | 'processing' | 'done' | 'error';

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const previewUrlRef = useRef<string | null>(null);
  const runIdRef = useRef(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [progress, setProgress] = useState(0);
  const [progressLabel, setProgressLabel] = useState('Preparing secure, on-device reading');
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [candidates, setCandidates] = useState<MedicineCandidate[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => () => {
    runIdRef.current += 1;
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    void workerRef.current?.terminate();
  }, []);

  const clearPreview = () => {
    setPreviewUrl((oldUrl) => {
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      previewUrlRef.current = null;
      return null;
    });
  };

  const resetFlow = () => {
    runIdRef.current += 1;
    void workerRef.current?.terminate();
    workerRef.current = null;
    clearPreview();
    setFileName('');
    setStatus('idle');
    setProgress(0);
    setError('');
    setCandidates([]);
    setCopied(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const runOcr = async (imageUrl: string) => {
    const runId = ++runIdRef.current;
    setStatus('processing');
    setError('');
    setProgress(0);
    setProgressLabel('Preparing secure, on-device reading');
    setCandidates([]);
    let worker: Worker | null = null;
    try {
      worker = await createWorker('eng', 1, {
        logger: (message) => {
          if (runId !== runIdRef.current) return;
          if (message.status) setProgressLabel(message.status === 'recognizing text' ? 'Reading text in your image' : 'Preparing secure, on-device reading');
          if (typeof message.progress === 'number') setProgress(Math.round(message.progress * 100));
        },
      });
      if (runId !== runIdRef.current) {
        await worker.terminate();
        return;
      }
      workerRef.current = worker;
      const { data } = await worker.recognize(imageUrl);
      if (runId !== runIdRef.current) return;
      const ocrLines = data.blocks?.flatMap((block) =>
        block.paragraphs.flatMap((paragraph) =>
          paragraph.lines.map((line) => ({ text: line.text, confidence: line.confidence })),
        ),
      ) ?? data.text.split(/\r?\n/).map((text) => ({ text, confidence: data.confidence }));
      const found = extractMedicineCandidates(ocrLines);
      setCandidates(found);
      setStatus('done');
      setProgress(100);
    } catch {
      if (runId === runIdRef.current) {
        setStatus('error');
        setError('We couldn’t read this image. Try a sharper, well-lit photo with the prescription fully in frame.');
      }
    } finally {
      if (worker) {
        await worker.terminate();
        if (workerRef.current === worker) workerRef.current = null;
      }
    }
  };

  const acceptFile = (file?: File) => {
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';
    setError('');
    const isImageType = ACCEPTED_TYPES.includes(file.type) || /\.(jpe?g|png)$/i.test(file.name);
    if (!isImageType) {
      setError('That file type is not supported. Choose a JPG, JPEG, or PNG image.');
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      setError('This image is larger than 5 MB. Choose a smaller image to continue.');
      return;
    }
    if (file.size === 0) {
      setError('This image appears to be empty. Choose another file.');
      return;
    }
    resetFlow();
    const localUrl = URL.createObjectURL(file);
    previewUrlRef.current = localUrl;
    setPreviewUrl(localUrl);
    setFileName(file.name);
    void runOcr(localUrl);
  };

  const copyCandidates = async () => {
    if (!candidates.length) return;
    try {
      await navigator.clipboard.writeText(candidates.map((candidate) => candidate.name).join('\n'));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Clipboard access is unavailable in this browser. You can select and copy each result.');
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    acceptFile(event.dataTransfer.files?.[0]);
  };

  return (
    <main className="app-shell min-h-[100dvh]">
      <header className="mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8 lg:px-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[#e0eee7] text-[#286d64]">
            <FileText size={21} strokeWidth={2.1} />
          </div>
          <div>
            <div data-testid="text-product-title" className="serif text-[17px] font-extrabold tracking-[-.055em] text-[#243d40]">YOUR MEDICIN</div>
            <div className="text-[10px] font-semibold uppercase tracking-[.18em] text-[#748681]">Private prescription reader</div>
          </div>
        </div>
        <div className="hidden items-center gap-2 rounded-full border border-[#dce7df] bg-white/70 px-3.5 py-2 text-xs font-medium text-[#476a62] sm:flex">
          <LockKeyhole size={14} />
          <span>Stays on your device</span>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1180px] gap-10 px-5 pb-14 pt-7 sm:px-8 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-[72px] lg:px-10 lg:pt-[54px]">
        <section className="min-w-0">
          <div className="rise-in mb-8 max-w-[680px]">
            <div className="mb-4 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[.17em] text-[#52766d]">
              <span className="h-px w-7 bg-[#739b8b]" /> A little more clarity
            </div>
            <h1 className="serif max-w-[640px] text-[clamp(2.5rem,6vw,4.65rem)] font-bold leading-[1.03] tracking-[-.065em] text-[#243b3d]">
              Make sense of the <span className="text-[#4b8175]">handwriting.</span>
            </h1>
            <p className="mt-5 max-w-[540px] text-[15px] leading-7 text-[#62736f] sm:text-[16px]">
              See possible medicine names from a prescription image, privately and right here in your browser.
            </p>
          </div>

          <div className="overflow-hidden rounded-[24px] border border-[#dce6df] bg-white shadow-[0_15px_45px_rgba(48,76,69,.07)]">
            <div className="flex items-center justify-between border-b border-[#e8eeea] px-5 py-4 sm:px-7">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#edf4ef] text-[#4b776d]"><ImagePlus size={18}/></div>
                <div>
                  <h2 className="text-sm font-bold text-[#2c4646]">Prescription image</h2>
                  <p className="mt-0.5 text-xs text-[#83918c]">JPG, JPEG or PNG · up to 5 MB</p>
                </div>
              </div>
              {previewUrl && <button type="button" data-testid="button-upload-another-top" onClick={resetFlow} className="text-xs font-semibold text-[#39756a] hover:text-[#224c45]">Start over</button>}
            </div>

            <div className="grid gap-5 p-5 sm:p-7 md:grid-cols-[minmax(0,1fr)_minmax(210px,.78fr)]">
              <div
                data-testid="dropzone-prescription"
                className={`drop-zone flex min-h-[220px] cursor-pointer flex-col items-center justify-center rounded-[18px] border border-dashed border-[#b9cec2] bg-[#f6f9f6] px-5 py-6 text-center ${isDragging ? 'dragging' : ''} ${previewUrl ? 'md:min-h-[280px]' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={(event) => { event.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={onDrop}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); fileInputRef.current?.click(); } }}
                aria-label="Choose a prescription image or drop one here"
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,.jpg,.jpeg,.png"
                  className="hidden"
                  data-testid="input-prescription-image"
                  onChange={(event) => acceptFile(event.currentTarget.files?.[0])}
                />
                {previewUrl ? (
                  <img data-testid="image-prescription-preview" src={previewUrl} alt="Local preview of selected prescription" className="max-h-[260px] max-w-full rounded-lg object-contain" />
                ) : (
                  <>
                    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-[18px] bg-[#e7f0e9] text-[#4b8175]"><UploadCloud size={25}/></div>
                    <p className="text-sm font-bold text-[#36514d]">Drop your image here</p>
                    <p className="mt-1.5 text-xs text-[#82918b]">or <span className="font-semibold text-[#39756a] underline underline-offset-2">browse files</span></p>
                    <p className="mt-4 text-[11px] text-[#94a099]">Your image is never uploaded or saved</p>
                  </>
                )}
              </div>

              <div className="flex min-h-[220px] flex-col justify-between rounded-[18px] bg-[#f2f6f2] p-5 sm:p-6">
                <div>
                  <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-full bg-white text-[#578278]"><ShieldCheck size={18}/></div>
                  <h3 className="text-sm font-bold text-[#34504b]">{previewUrl ? 'Image ready to read' : 'Private by design'}</h3>
                  <p className="mt-2 text-xs leading-5 text-[#71827c]">
                    {previewUrl ? fileName : 'OCR runs in your browser. The prescription image is not sent to a server or stored.'}
                  </p>
                </div>
                <div className="mt-5 border-t border-[#dfe8e1] pt-4">
                  <div className="flex items-center gap-2 text-[11px] font-semibold text-[#52766d]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#74a18e]" />
                    Free, open-source OCR
                  </div>
                  <p className="mt-2 text-[11px] leading-4 text-[#87938d]">Printed text works best. Handwriting may be misread.</p>
                </div>
              </div>
            </div>

            {error && (
              <div data-testid="status-error" role="alert" className="mx-5 mb-5 flex items-start gap-3 rounded-xl border border-[#edd0c9] bg-[#fff5f2] px-4 py-3 text-sm text-[#8b4d43] sm:mx-7">
                <AlertCircle size={17} className="mt-0.5 shrink-0" /><span>{error}</span>
              </div>
            )}

            {status === 'processing' && (
              <div data-testid="status-ocr-progress" role="status" aria-live="polite" className="mx-5 mb-6 rounded-xl bg-[#f4f7f4] px-4 py-4 sm:mx-7">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="font-semibold text-[#42675e]">{progressLabel}</span><span className="tabular-nums text-[#72837d]">{progress}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-[#dce8df]"><div className="progress-fill h-full rounded-full bg-[#4c897b]" style={{ width: `${Math.max(3, progress)}%` }}/></div>
                <p className="mt-2 text-[11px] text-[#88958f]">This can take a little while. Your image stays on this device.</p>
              </div>
            )}
          </div>

          {status === 'done' && (
            <section data-testid="results-section" className="rise-in mt-7 overflow-hidden rounded-[22px] border border-[#dce6df] bg-white shadow-[0_10px_30px_rgba(48,76,69,.05)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eeea] px-5 py-4 sm:px-6">
                <div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 size={17} className="text-[#548477]"/>
                    <h2 className="text-sm font-bold text-[#304b47]">Possible medicine names</h2>
                  </div>
                  <p className="ml-[25px] mt-1 text-xs text-[#82918b]">Please review each name carefully.</p>
                </div>
                {candidates.length > 0 && <button type="button" data-testid="button-copy-all" onClick={copyCandidates} className="inline-flex items-center gap-2 rounded-lg border border-[#dce7df] px-3 py-2 text-xs font-semibold text-[#47756b] transition-colors hover:bg-[#f1f6f2]">
                  {copied ? <Check size={14}/> : <Clipboard size={14}/>} {copied ? 'Copied' : 'Copy all'}
                </button>}
              </div>

              {candidates.length ? (
                <>
                  <ul className="divide-y divide-[#edf1ed] px-5 sm:px-6">
                    {candidates.map((candidate, index) => (
                      <li data-testid={`result-candidate-${candidate.id}`} key={candidate.id} className="flex items-center gap-3 py-4">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#edf4ef] text-[11px] font-bold text-[#598075]">{String(index + 1).padStart(2, '0')}</span>
                        <span data-testid={`text-candidate-name-${candidate.id}`} className="min-w-0 flex-1 break-words text-sm font-semibold text-[#334b48]">{candidate.name}</span>
                        <span data-testid={`status-candidate-${candidate.id}`} className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${candidate.needsReview ? 'bg-[#fff0d7] text-[#88632c]' : 'bg-[#e8f3ed] text-[#4a7768]'}`}>
                          {candidate.needsReview ? `Review · ${candidate.confidence}%` : `${candidate.confidence}% confidence`}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <div data-testid="notice-manual-review" className="mx-5 mb-5 mt-2 flex gap-3 rounded-xl bg-[#fbf5e9] px-4 py-3.5 sm:mx-6">
                    <AlertCircle size={17} className="mt-0.5 shrink-0 text-[#a3783f]"/>
                    <p className="text-xs leading-[1.6] text-[#725e3d]"><strong>Manual review is essential.</strong> Handwriting and unclear text can be misread. Confirm every name with a pharmacist or clinician before acting.</p>
                  </div>
                </>
              ) : (
                <div data-testid="status-no-candidates" className="px-6 py-9 text-center">
                  <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f1f5f1] text-[#6d8980]"><FileImage size={20}/></div>
                  <h3 className="text-sm font-bold text-[#39524e]">No possible medicine names found</h3>
                  <p className="mx-auto mt-2 max-w-[360px] text-xs leading-5 text-[#7d8c86]">Try a clearer, well-lit image with the medicine lines in focus. This reader may not recognize handwriting.</p>
                </div>
              )}
              <div className="border-t border-[#e8eeea] px-5 py-4 sm:px-6">
                <button type="button" data-testid="button-upload-another" onClick={resetFlow} className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#d7e4dc] bg-[#f9fbf9] px-4 py-3 text-sm font-bold text-[#47776c] transition-colors hover:bg-[#eef5ef]">
                  <RotateCcw size={15}/> Upload another image
                </button>
              </div>
            </section>
          )}

          {status === 'error' && (
            <div data-testid="status-ocr-error" role="alert" className="rise-in mt-6 flex items-start justify-between gap-4 rounded-2xl border border-[#edd0c9] bg-[#fff7f4] p-5">
              <div className="flex gap-3"><AlertCircle size={18} className="mt-0.5 text-[#a85f51]"/><div><h2 className="text-sm font-bold text-[#73473e]">Reading didn’t finish</h2><p className="mt-1 text-xs leading-5 text-[#8c6258]">{error || 'Please try another image.'}</p></div></div>
              <button data-testid="button-retry" type="button" onClick={() => { if (previewUrl) void runOcr(previewUrl); }} className="shrink-0 rounded-lg border border-[#e3c9c2] px-3 py-2 text-xs font-bold text-[#87574c]">Retry</button>
            </div>
          )}
        </section>

        <aside className="self-start lg:pt-[104px]">
          <div className="relative overflow-hidden rounded-[22px] bg-[#315f59] px-6 py-6 text-[#f4f5e9]">
            <div className="absolute -right-10 -top-12 h-40 w-40 rounded-full border border-white/10" />
            <div className="absolute -right-2 -top-4 h-24 w-24 rounded-full border border-white/10" />
            <div className="relative">
              <div className="mb-5 flex h-10 w-10 items-center justify-center rounded-[14px] bg-white/10 text-[#d6e7d8]"><ShieldCheck size={20}/></div>
              <p className="text-[10px] font-bold uppercase tracking-[.2em] text-[#c8ddd0]">A helpful first look</p>
              <h2 className="serif mt-2 text-[25px] font-bold leading-[1.12] tracking-[-.04em]">Clarity, with care.</h2>
              <p className="mt-3 text-xs leading-[1.7] text-[#d2e0d8]">This tool can help read printed text. It cannot verify what a prescription means or what you should take.</p>
              <div className="my-5 h-px bg-white/15"/>
              <ul className="space-y-3 text-xs text-[#e2ece5]">
                <li className="flex gap-2.5"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#b4d8bd]"/>The image never leaves your device</li>
                <li className="flex gap-2.5"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#b4d8bd]"/>No account, upload, or saved history</li>
                <li className="flex gap-2.5"><CheckCircle2 size={15} className="mt-0.5 shrink-0 text-[#b4d8bd]"/>Only possible medicine names are shown</li>
              </ul>
            </div>
          </div>

          <div className="mt-5 rounded-[20px] border border-[#e1e8e1] bg-[#f8f8f1] p-5">
            <div className="mb-3 flex items-center gap-2">
              <AlertCircle size={16} className="text-[#a1743b}"/>
              <h2 className="text-xs font-bold uppercase tracking-[.1em] text-[#6e5a3c]">Please keep in mind</h2>
            </div>
            <p className="text-xs leading-[1.7] text-[#776d5a]">OCR can misread handwriting, spelling, or numbers. Always verify the medicine name and instructions with your pharmacist or clinician.</p>
            <p className="mt-3 border-t border-[#ebe4d5] pt-3 text-[11px] font-semibold text-[#776d5a]">Not medical advice.</p>
          </div>
          <p className="mt-5 flex items-center gap-1.5 text-[11px] text-[#82918b]"><span>Powered by on-device open-source OCR</span><ArrowUpRight size={12}/></p>
        </aside>
      </div>

      <footer className="mx-auto flex max-w-[1180px] flex-col gap-2 border-t border-[#dfe8e1] px-5 py-5 text-[11px] text-[#85938d] sm:flex-row sm:items-center sm:justify-between sm:px-8 lg:px-10">
        <span>YOUR MEDICIN is a reading aid, not a substitute for professional advice.</span>
        <span className="inline-flex items-center gap-1.5"><LockKeyhole size={12}/> Images stay on your device</span>
      </footer>
    </main>
  );
}

export default App;
