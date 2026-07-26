import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
// Guide Mk II labels itself in IBM Plex: Sans for prose, Mono for anything
// that is a reading rather than a sentence.
import '@fontsource-variable/ibm-plex-sans';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './ui/theme.css';
import { App } from './ui/App';
import { startLoop } from './state/store';

startLoop();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
