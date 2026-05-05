import ChatWindow from '@/components/ChatWindow';
import Sidebar from '@/components/Sidebar';
import SetupWizard from '@/components/Setup/SetupWizard';
import ThemeProvider from '@/components/theme/Provider';
import Loader from '@/components/ui/Loader';
import type { UIConfigSections } from '@/lib/config/types';
import { ChatProvider } from '@/lib/hooks/useChat';
import LibraryPage from '@/pages/LibraryPage';
import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Toaster } from 'sonner';

function MainRoutes() {
  return (
    <ChatProvider>
      <Sidebar>
        <Routes>
          <Route path="/" element={<ChatWindow />} />
          <Route path="/c/:chatId" element={<ChatWindow />} />
          <Route path="/library" element={<LibraryPage />} />
        </Routes>
      </Sidebar>
      <Toaster
        toastOptions={{
          unstyled: true,
          classNames: {
            toast:
              'bg-light-secondary dark:bg-dark-secondary dark:text-white/70 text-black-70 rounded-lg p-4 flex flex-row items-center space-x-2',
          },
        }}
      />
    </ChatProvider>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);
  const [setupComplete, setSetupComplete] = useState(true);
  const [configSections, setConfigSections] = useState<UIConfigSections | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      const maxAttempts = 10;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const r = await fetch('/api/config');
          if (!r.ok) {
            throw new Error(`HTTP ${r.status}`);
          }
          const d = (await r.json()) as {
            values?: { setupComplete: boolean };
            fields?: UIConfigSections;
          };
          if (!d?.fields || !d?.values) {
            throw new Error('Invalid config response shape');
          }
          if (cancelled) return;
          setSetupComplete(Boolean(d.values.setupComplete));
          setConfigSections(d.fields);
          return;
        } catch (e) {
          if (attempt === maxAttempts) {
            if (!cancelled) setSetupComplete(true);
            return;
          }
          await new Promise((res) => setTimeout(res, 350 * attempt));
        }
      }
    };

    void load().finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen w-full bg-light-primary dark:bg-dark-primary">
        <Loader />
      </div>
    );
  }

  return (
    <ThemeProvider>
      <BrowserRouter>
        {!setupComplete && configSections ? (
          <SetupWizard configSections={configSections} />
        ) : (
          <MainRoutes />
        )}
      </BrowserRouter>
    </ThemeProvider>
  );
}
