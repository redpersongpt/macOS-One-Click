import { useCallback, useEffect, useState } from 'react';
import { getVersion } from '@tauri-apps/api/app';
import { save } from '@tauri-apps/plugin-dialog';
import { ExternalLink, FileDown, Loader2, RefreshCw, Settings2, Trash2 } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { Button } from '../components/ui/Button';
import { Badge } from '../components/ui/Badge';
import { api } from '../bridge/invoke';
import { parseError } from '../lib/parseError';

interface SettingsProps {
  open: boolean;
  onClose: () => void;
}

const GITHUB_URL = 'https://github.com/redpersongpt/OpCore-OneClick';

export default function Settings({ open, onClose }: SettingsProps) {
  const [appVersion, setAppVersion] = useState('4.0.0');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [logTail, setLogTail] = useState('');
  const [loadingLog, setLoadingLog] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [clearingCache, setClearingCache] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const loadDiagnostics = useCallback(async () => {
    setLoadingLog(true);
    setError(null);

    try {
      const [version, nextSessionId, tail] = await Promise.all([
        getVersion(),
        api.logGetSessionId(),
        api.logGetTail(200),
      ]);
      setAppVersion(version);
      setSessionId(nextSessionId);
      setLogTail(tail);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoadingLog(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    void loadDiagnostics();
  }, [open, loadDiagnostics]);

  const handleExportDiagnostics = async () => {
    setExporting(true);
    setError(null);
    setStatus(null);

    try {
      const targetPath = await save({
        defaultPath: `opcore-support-${new Date().toISOString().slice(0, 10)}.log`,
      });

      if (!targetPath) {
        return;
      }

      await api.saveSupportLog(targetPath);
      setStatus(`Saved diagnostics to ${targetPath}`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setExporting(false);
    }
  };

  const handleClearCache = async () => {
    setClearingCache(true);
    setError(null);
    setStatus(null);

    try {
      await api.clearAppCache();
      setStatus('Cleared generated builds, cached recovery assets, and local download cache.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setClearingCache(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Settings"
      width="max-w-3xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Close
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <section className="rounded-lg border border-[--border-subtle] bg-[--surface-1] px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.875rem] font-medium text-[--text-primary]">Application</p>
              <p className="text-[0.75rem] text-[--text-tertiary] mt-1">
                Inspect diagnostics, export support logs, and clear cached build artifacts.
              </p>
            </div>
            <Badge variant="info" size="sm" dot>
              v{appVersion}
            </Badge>
          </div>
          {sessionId && (
            <p className="mt-3 text-[0.6875rem] font-mono text-[--text-tertiary]">
              Session {sessionId}
            </p>
          )}
        </section>

        <section className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-lg border border-[--border-subtle] bg-[--surface-1] px-4 py-3">
            <p className="text-[0.8125rem] font-medium text-[--text-primary]">Diagnostics</p>
            <p className="text-[0.6875rem] text-[--text-tertiary] mt-1 leading-snug">
              Export the current session logs and environment details for debugging.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="primary"
                onClick={handleExportDiagnostics}
                loading={exporting}
                leadingIcon={!exporting ? <FileDown size={14} /> : undefined}
              >
                Export Diagnostics
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-[--border-subtle] bg-[--surface-1] px-4 py-3">
            <p className="text-[0.8125rem] font-medium text-[--text-primary]">Cache</p>
            <p className="text-[0.6875rem] text-[--text-tertiary] mt-1 leading-snug">
              Remove generated EFIs, cached recovery downloads, and local resource downloads.
            </p>
            <div className="mt-4 flex gap-2">
              <Button
                variant="secondary"
                onClick={handleClearCache}
                loading={clearingCache}
                leadingIcon={!clearingCache ? <Trash2 size={14} /> : undefined}
              >
                Clear Cache
              </Button>
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-[--border-subtle] bg-[--surface-1] overflow-hidden">
          <div className="flex items-center justify-between border-b border-[--border-subtle] px-4 py-3">
            <div>
              <p className="text-[0.8125rem] font-medium text-[--text-primary]">Log Viewer</p>
              <p className="text-[0.6875rem] text-[--text-tertiary] mt-0.5">
                Last 200 lines from the active log file.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void loadDiagnostics()}
              leadingIcon={loadingLog ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
            >
              Refresh
            </Button>
          </div>
          <div className="max-h-[320px] overflow-auto px-4 py-3">
            <pre className="whitespace-pre-wrap break-words font-mono text-[0.6875rem] leading-5 text-[--text-secondary]">
              {loadingLog ? 'Loading logs...' : logTail || 'No log output available.'}
            </pre>
          </div>
        </section>

        <section className="rounded-lg border border-[--border-subtle] bg-[--surface-1] px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[0.8125rem] font-medium text-[--text-primary]">About</p>
              <p className="text-[0.6875rem] text-[--text-tertiary] mt-1 leading-snug">
                OpCore-OneClick is a Tauri-based Hackintosh EFI generator built around
                OpenCore.
              </p>
            </div>
            <Settings2 size={16} className="text-[--text-tertiary] shrink-0" />
          </div>
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-[0.75rem] text-[--color-blue-6] hover:text-[--color-blue-5]"
          >
            Project on GitHub
            <ExternalLink size={13} />
          </a>
        </section>

        {status && (
          <div className="rounded-lg border border-[--color-green-3] bg-[--color-green-1] px-4 py-3 text-[0.75rem] text-[--color-green-7]">
            {status}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-[--color-red-3] bg-[--color-red-1] px-4 py-3 text-[0.75rem] text-[--color-red-7]">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
