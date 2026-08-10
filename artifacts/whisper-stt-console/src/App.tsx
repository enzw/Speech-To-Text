import { type ReactNode, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AlertCircle, Check, Clipboard, Cloud, FileAudio, KeyRound, Loader2, Mic2, RefreshCw, Send, ShieldCheck, Upload, Waves, X } from 'lucide-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';
import {
  getGetHealthQueryKey,
  getGetServiceStatusQueryKey,
  getHealthCheckQueryKey,
  useGetHealth,
  useGetServiceStatus,
  useHealthCheck,
  useTranscribeAudio,
} from '@workspace/api-client-react';

const queryClient = new QueryClient();

function getErrorMessage(error: unknown, fallback: string) {
  if (typeof error === 'string') return error;
  if (error && typeof error === 'object') {
    const candidate = error as { message?: string; error?: string; data?: { error?: string } };
    return candidate.data?.error || candidate.error || candidate.message || fallback;
  }
  return fallback;
}

function StatusDot({ tone = 'good' }: { tone?: 'good' | 'warn' | 'bad' | 'idle' }) {
  return <span aria-hidden="true" className={`inline-block size-2 rounded-full ${tone === 'good' ? 'bg-[#71c6aa]' : tone === 'warn' ? 'bg-accent' : tone === 'bad' ? 'bg-[#dd7969]' : 'bg-[#8d9aa4]'}`} />;
}

function DataLabel({ children }: { children: ReactNode }) {
  return <p className="font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">{children}</p>;
}

function Waveform({ active = false }: { active?: boolean }) {
  const bars = Array.from({ length: 56 });
  return (
    <div className={`flex h-11 items-center gap-[3px] overflow-hidden ${active ? 'opacity-100' : 'opacity-80'}`} aria-hidden="true">
      {bars.map((_, index) => {
        const height = 10 + ((index * 17) % 25);
        return <span key={index} className={`waveform-bar w-[3px] rounded-full ${active ? 'bg-accent' : 'bg-primary/40'}`} style={{ height, animationDelay: `${(index % 9) * -0.12}s` }} />;
      })}
    </div>
  );
}

function ConsoleHeader() {
  return (
    <header className="flex flex-col gap-5 border-b border-border px-5 py-5 sm:px-8 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-sidebar-primary text-sidebar-primary-foreground shadow-sm">
          <Mic2 className="size-5" strokeWidth={2.4} />
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-[15px] font-extrabold tracking-[-0.02em] text-foreground">whisper console</h1>
            <span className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">OPS</span>
          </div>
          <p className="font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">speech interface / field lab</p>
        </div>
      </div>
      <div className="flex items-center gap-4 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground">
        <span className="hidden items-center gap-2 sm:flex"><span className="size-1.5 rounded-full bg-accent" />local operator mode</span>
        <span className="hidden text-border sm:block">/</span>
        <span>v0.1.0</span>
      </div>
    </header>
  );
}

function ServiceRail() {
  const service = useGetServiceStatus({ query: { queryKey: getGetServiceStatusQueryKey(), staleTime: 30000 } });
  const health = useGetHealth({ query: { queryKey: getGetHealthQueryKey(), staleTime: 30000 } });
  const healthz = useHealthCheck({ query: { queryKey: getHealthCheckQueryKey(), staleTime: 30000 } });
  const refresh = () => {
    void service.refetch();
    void health.refetch();
    void healthz.refetch();
  };
  const serviceUp = service.data?.status?.toLowerCase() === 'ok' || service.data?.status?.toLowerCase() === 'healthy';
  const healthUp = health.data?.status?.toLowerCase() === 'ok' || health.data?.status?.toLowerCase() === 'healthy';
  const healthzUp = healthz.data?.status?.toLowerCase() === 'ok' || healthz.data?.status?.toLowerCase() === 'healthy';
  const anyError = service.isError || health.isError || healthz.isError;
  return (
    <aside className="flex flex-col bg-sidebar px-5 py-6 text-sidebar-foreground sm:px-7 lg:min-h-[calc(100dvh-81px)] lg:w-[286px] lg:shrink-0">
      <div className="mb-8 flex items-center justify-between">
        <DataLabel>service telemetry</DataLabel>
        <button data-testid="button-refresh-health" onClick={refresh} className="rounded-md p-1.5 text-sidebar-foreground/60 transition hover:bg-sidebar-accent hover:text-sidebar-foreground" aria-label="Refresh service health">
          <RefreshCw className={`size-3.5 ${service.isFetching || health.isFetching || healthz.isFetching ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <div className="relative space-y-3">
        <div className="signal-line absolute left-[5px] top-4 h-32 w-px origin-top" />
        <TelemetryRow label="gateway" value={service.isLoading ? 'checking' : service.data?.service || 'unavailable'} tone={service.isError ? 'bad' : service.data ? 'good' : 'idle'} testId="status-gateway" />
        <TelemetryRow label="api health" value={health.isLoading ? 'checking' : health.data?.status || 'unavailable'} tone={health.isError ? 'bad' : healthUp ? 'good' : health.data ? 'warn' : 'idle'} testId="status-api-health" />
        <TelemetryRow label="health probe" value={healthz.isLoading ? 'checking' : healthz.data?.status || 'unavailable'} tone={healthz.isError ? 'bad' : healthzUp ? 'good' : healthz.data ? 'warn' : 'idle'} testId="status-health-probe" />
      </div>
      <div className="mt-8 rounded-xl border border-sidebar-border bg-sidebar-accent/55 p-4">
        <div className="mb-3 flex items-center justify-between">
          <DataLabel>signal path</DataLabel>
          <StatusDot tone={anyError ? 'bad' : serviceUp || healthUp || healthzUp ? 'good' : 'idle'} />
        </div>
        <Waveform active={!anyError} />
        <p data-testid="text-signal-description" className="mt-2 text-xs leading-relaxed text-sidebar-foreground/60">A direct path from edge audio to readable text. No jobs, queues, or saved recordings.</p>
      </div>
      <div className="mt-auto hidden border-t border-sidebar-border pt-5 lg:block">
        <div className="flex items-start gap-2.5 text-sidebar-foreground/55">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-sidebar-primary" />
          <p className="text-[11px] leading-relaxed">API keys stay in this session and travel only with your transcription request.</p>
        </div>
      </div>
    </aside>
  );
}

function TelemetryRow({ label, value, tone, testId }: { label: string; value: string; tone: 'good' | 'warn' | 'bad' | 'idle'; testId: string }) {
  return (
    <div className="relative z-10 flex items-center justify-between rounded-lg border border-sidebar-border bg-sidebar px-3 py-3">
      <div className="flex items-center gap-3">
        <StatusDot tone={tone} />
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-sidebar-foreground/60">{label}</span>
      </div>
      <span data-testid={testId} className={`font-mono text-[10px] uppercase ${tone === 'bad' ? 'text-[#dd7969]' : tone === 'good' ? 'text-sidebar-primary' : tone === 'warn' ? 'text-accent' : 'text-sidebar-foreground/45'}`}>{value}</span>
    </div>
  );
}

function FileDropzone({ file, onFile }: { file: File | null; onFile: (file: File | null) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const acceptFile = (candidate?: File) => {
    if (candidate) onFile(candidate);
  };
  return (
    <div
      className={`group relative rounded-xl border border-dashed p-5 transition sm:p-7 ${dragging ? 'border-primary bg-primary/5' : 'border-input bg-background/35 hover:border-primary/70 hover:bg-card'}`}
      onDragEnter={(event) => { event.preventDefault(); setDragging(true); }}
      onDragOver={(event) => event.preventDefault()}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => { event.preventDefault(); setDragging(false); acceptFile(event.dataTransfer.files[0]); }}
    >
      <input ref={inputRef} data-testid="input-audio-file" type="file" accept="audio/*,.wav,.mp3,.m4a,.ogg,.webm" className="sr-only" onChange={(event) => acceptFile(event.target.files?.[0])} />
      {!file ? (
        <button data-testid="button-choose-audio" type="button" onClick={() => inputRef.current?.click()} className="flex w-full flex-col items-center justify-center py-5 text-center">
          <span className="mb-4 flex size-12 items-center justify-center rounded-2xl border border-border bg-card text-primary shadow-sm transition group-hover:-translate-y-0.5"><Upload className="size-5" /></span>
          <span className="text-sm font-bold text-foreground">Drop an audio sample here</span>
          <span className="mt-1.5 text-xs text-muted-foreground">or choose a file from this device</span>
          <span className="mt-4 font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">WAV · MP3 · M4A · OGG · WEBM</span>
        </button>
      ) : (
        <div className="flex items-center gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileAudio className="size-5" /></div>
          <div className="min-w-0 flex-1">
            <p data-testid="text-selected-file" className="truncate text-sm font-bold text-foreground">{file.name}</p>
            <p data-testid="text-selected-file-meta" className="mt-1 font-mono text-[10px] uppercase tracking-[0.09em] text-muted-foreground">{(file.size / 1024 / 1024).toFixed(2)} MB · {file.type || 'audio file'}</p>
            <div className="mt-3"><Waveform /></div>
          </div>
          <button data-testid="button-remove-audio" type="button" onClick={() => onFile(null)} className="self-start rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive" aria-label="Remove selected audio"><X className="size-4" /></button>
        </div>
      )}
    </div>
  );
}

function ApiKeyField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [visible, setVisible] = useState(false);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <label htmlFor="api-key" className="flex items-center gap-2 text-xs font-bold text-foreground"><KeyRound className="size-3.5 text-primary" /> API key</label>
         <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">required to send</span>
      </div>
      <div className="relative">
        <input id="api-key" data-testid="input-api-key" type={visible ? 'text' : 'password'} value={value} onChange={(event) => onChange(event.target.value)} placeholder="whisper_live_••••••••" className="h-11 w-full rounded-lg border border-input bg-background px-3 pr-20 font-mono text-xs text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary focus:ring-2 focus:ring-primary/15" />
        <button data-testid="button-toggle-api-key" type="button" onClick={() => setVisible((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-2 py-1.5 font-mono text-[9px] uppercase tracking-[0.08em] text-muted-foreground transition hover:bg-muted hover:text-foreground">{visible ? 'hide' : 'reveal'}</button>
      </div>
    </div>
  );
}

function ResultPanel({ text, onClear }: { text: string; onClear: () => void }) {
  const [copied, setCopied] = useState(false);
  const copyText = async () => {
    await navigator.clipboard?.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <section className="rise-in rounded-xl border border-primary/30 bg-primary/[0.045] p-5 sm:p-6" data-testid="panel-transcription-result">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-2.5"><span className="flex size-7 items-center justify-center rounded-full bg-primary text-primary-foreground"><Check className="size-4" /></span><div><DataLabel>transcription ready</DataLabel><p data-testid="status-transcription-success" className="mt-1 text-xs font-semibold text-primary">Audio decoded successfully</p></div></div>
        <button data-testid="button-clear-result" type="button" onClick={onClear} className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground transition hover:text-foreground">clear</button>
      </div>
      <div className="rounded-lg border border-border bg-card px-4 py-4 sm:px-5">
        <p data-testid="text-transcription-result" className="text-[15px] leading-7 tracking-[-0.01em] text-foreground">{text}</p>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <span className="font-mono text-[9px] uppercase tracking-[0.13em] text-muted-foreground">{text.split(/\s+/).filter(Boolean).length} words · returned by whisper</span>
        <button data-testid="button-copy-transcription" type="button" onClick={copyText} className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 font-mono text-[10px] uppercase tracking-[0.1em] text-foreground transition hover:border-primary hover:text-primary">{copied ? <Check className="size-3.5" /> : <Clipboard className="size-3.5" />}{copied ? 'copied' : 'copy text'}</button>
      </div>
    </section>
  );
}

function CurlSnippet({ apiKey }: { apiKey: string }) {
  const [copied, setCopied] = useState(false);
  const curl = `curl -X POST /api/transcribe \\\n+  -H "X-API-Key: ${apiKey || 'your_api_key'}" \\\n+  -F "file=@sample.wav"`;
  const copy = async () => {
    await navigator.clipboard?.writeText(curl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };
  return (
    <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div><DataLabel>for your device</DataLabel><h2 className="mt-1.5 text-sm font-bold text-foreground">Integration cURL</h2></div>
        <button data-testid="button-copy-curl" type="button" onClick={copy} className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground transition hover:border-primary hover:text-primary">{copied ? <Check className="size-3" /> : <Clipboard className="size-3" />}{copied ? 'copied' : 'copy'}</button>
      </div>
      <pre data-testid="code-curl-example" className="overflow-x-auto rounded-lg bg-sidebar px-4 py-4 font-mono text-[10px] leading-6 text-sidebar-foreground/80"><code><span className="text-[#71c6aa]">curl</span> -X POST /api/transcribe \{'\n'}  -H <span className="text-accent">"X-API-Key: {apiKey || 'your_api_key'}"</span> \{'\n'}  -F <span className="text-accent">"file=@sample.wav"</span></code></pre>
      <p className="mt-3 flex items-center gap-2 text-[11px] leading-relaxed text-muted-foreground"><Cloud className="size-3.5 shrink-0" /> Send multipart audio from an ESP8266 gateway or any HTTP client.</p>
    </section>
  );
}

function Workbench() {
  const [apiKey, setApiKey] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState('');
  const transcribe = useTranscribeAudio({ request: { headers: apiKey ? { 'X-API-Key': apiKey } : {} } });
  const canSubmit = Boolean(file) && !transcribe.isPending;
  const requestState = transcribe.isPending ? 'sending' : result ? 'complete' : transcribe.isError ? 'error' : 'ready';
  const errorText = getErrorMessage(transcribe.error, 'The service could not transcribe this sample. Check the key and try again.');
  const submit = () => {
    if (!file) return;
    setResult('');
    transcribe.mutate({ data: { file } }, {
      onSuccess: (response) => setResult(response.text),
    });
  };
  const reset = () => {
    setFile(null);
    setResult('');
    transcribe.reset();
  };
  return (
    <main className="console-grid min-w-0 flex-1">
      <div className="mx-auto max-w-[980px] px-5 py-8 sm:px-8 sm:py-10 lg:px-12">
        <div className="rise-in mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-primary"><span className="h-px w-7 bg-primary" /> capture station / 01</div>
            <h2 className="max-w-[600px] text-[clamp(2rem,4.5vw,3.4rem)] font-extrabold leading-[1.03] tracking-[-0.065em] text-foreground">Turn field audio<br /><span className="text-primary">into signal.</span></h2>
            <p className="mt-4 max-w-[530px] text-sm leading-6 text-muted-foreground">A small, direct workspace for testing the Whisper service before it hears from your Wemos board.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground"><StatusDot tone={requestState === 'error' ? 'bad' : requestState === 'complete' ? 'good' : 'idle'} /><span data-testid="status-request-state">{requestState}</span></div>
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.08fr)_minmax(300px,.92fr)]">
          <div className="rise-in rise-in-delay-1 space-y-5">
            <section className="rounded-xl border border-border bg-card p-5 shadow-[0_12px_35px_hsl(216_31%_16%_/_0.04)] sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div><DataLabel>01 / credentials</DataLabel><h2 className="mt-1.5 text-sm font-bold text-foreground">Identify your request</h2></div>
                <span className="font-mono text-[10px] text-muted-foreground">x-api-key</span>
              </div>
              <ApiKeyField value={apiKey} onChange={setApiKey} />
            </section>
            <section className="rounded-xl border border-border bg-card p-5 shadow-[0_12px_35px_hsl(216_31%_16%_/_0.04)] sm:p-6">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div><DataLabel>02 / source audio</DataLabel><h2 className="mt-1.5 text-sm font-bold text-foreground">Choose a sample to decode</h2></div>
                <span className="font-mono text-[10px] text-muted-foreground">multipart/form-data</span>
              </div>
              <FileDropzone file={file} onFile={setFile} />
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="max-w-[270px] text-[11px] leading-relaxed text-muted-foreground">Keep samples short while testing. Your audio is sent once and is not stored by this console.</p>
                <button data-testid="button-transcribe-audio" type="button" disabled={!canSubmit} onClick={submit} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-xs font-bold text-primary-foreground shadow-sm transition hover:-translate-y-0.5 hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0">{transcribe.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}{transcribe.isPending ? 'sending sample' : 'transcribe audio'}</button>
              </div>
            </section>
            {transcribe.isError && (
              <div data-testid="status-transcription-error" role="alert" className="rise-in flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive"><AlertCircle className="mt-0.5 size-4 shrink-0" /><div className="flex-1"><p className="font-bold">Transcription did not complete</p><p className="mt-1 text-xs leading-relaxed text-destructive/80">{errorText}</p></div><button data-testid="button-dismiss-error" type="button" onClick={() => transcribe.reset()} aria-label="Dismiss error"><X className="size-4" /></button></div>
            )}
            {result && <ResultPanel text={result} onClear={() => setResult('')} />}
            {!result && !transcribe.isError && !transcribe.isPending && <div data-testid="status-transcription-empty" className="flex items-center gap-3 rounded-xl border border-dashed border-border bg-background/30 px-4 py-4 text-xs text-muted-foreground"><Waves className="size-4 text-primary/60" /><span>Your decoded words will appear here after the first request.</span></div>}
          </div>
          <div className="rise-in rise-in-delay-2 space-y-5">
            <CurlSnippet apiKey={apiKey} />
            <section className="rounded-xl border border-border bg-card p-5 sm:p-6">
              <div className="mb-4 flex items-center justify-between"><div><DataLabel>request notes</DataLabel><h2 className="mt-1.5 text-sm font-bold text-foreground">What this station checks</h2></div><FileAudio className="size-4 text-primary" /></div>
              <ul className="space-y-3 text-xs leading-relaxed text-muted-foreground">
                <li className="flex gap-2.5"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />API key is attached as <code className="font-mono text-[10px] text-foreground">X-API-Key</code>.</li>
                <li className="flex gap-2.5"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />Audio is posted to the service as a file part.</li>
                <li className="flex gap-2.5"><span className="mt-1 size-1.5 shrink-0 rounded-full bg-primary" />The response is shown without transformation.</li>
              </ul>
            </section>
            {(file || result) && <button data-testid="button-reset-workbench" type="button" onClick={reset} className="w-full rounded-lg border border-border bg-transparent px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.13em] text-muted-foreground transition hover:border-destructive/40 hover:text-destructive">reset station</button>}
          </div>
        </div>
      </div>
    </main>
  );
}

function Home() {
  return <div className="min-h-[100dvh] bg-background"><ConsoleHeader /><div className="flex min-h-[calc(100dvh-81px)] flex-col lg:flex-row"><ServiceRail /><Workbench /></div></div>;
}

function Router() {
  return <RoutedErrorBoundary><Switch><Route path="/" component={Home} /><Route component={NotFound} /></Switch></RoutedErrorBoundary>;
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={queryClient}><TooltipProvider><WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}><Router /></WouterRouter><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;