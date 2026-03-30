// src/app/App.tsx
import { RouterProvider } from 'react-router';
import { router } from './routes';
import { RealtimeProvider } from '@/lib/RealtimeContext';
import { LanguageProvider } from '@/lib/LanguageContext';

export default function App() {
  return (
    <LanguageProvider>
      <RealtimeProvider>
        <RouterProvider router={router} />
      </RealtimeProvider>
    </LanguageProvider>
  );
}
