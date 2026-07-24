import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource-variable/inter';
import '@fontsource-variable/bricolage-grotesque';
import './ui/theme.css';
import { App } from './ui/App';
import { startLoop } from './state/store';

startLoop();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
