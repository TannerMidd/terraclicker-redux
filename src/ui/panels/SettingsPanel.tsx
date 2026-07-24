import { useRef, useState } from 'react';
import { exportToClipboard, hardReset, importFromText, saveNow, useGame } from '../../state/store';
import { useSettings, type Quality } from '../settings';

export function SettingsPanel() {
  const settings = useSettings();
  const persistenceBlocked = useGame((game) => game.persistenceBlocked);
  const [copied, setCopied] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const importRef = useRef<HTMLTextAreaElement>(null);

  return (
    <div>
      <div className="panel-h">Sirius Cybernetics Preferences Division</div>

      <div className="set-row">
        <div>
          Sound
          <div className="s-desc">Genuine synthesized personalities. No files were harmed.</div>
        </div>
        <button className="btn" onClick={() => settings.setAudio(!settings.audio)}>
          {settings.audio ? 'On' : 'Off'}
        </button>
      </div>

      <div className="set-row">
        <div>
          Render quality
          <div className="s-desc">Auto detects your ship&rsquo;s capabilities.</div>
        </div>
        <select
          className="btn"
          value={settings.quality}
          onChange={(e) => settings.setQuality(e.target.value as Quality)}
          style={{ background: 'var(--panel-solid)' }}
        >
          <option value="auto">Auto</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>

      <div className="set-row">
        <div>
          Save now
          <div className="s-desc">
            {persistenceBlocked
              ? 'Autosave is paused to protect rejected save data. Use recovery, import, or reset.'
              : 'Autosaves every 10 seconds. This button is for comfort.'}
          </div>
        </div>
        <button
          className="btn"
          disabled={persistenceBlocked}
          onClick={() => {
            saveNow();
          }}
        >
          {persistenceBlocked ? 'Paused' : 'Save'}
        </button>
      </div>

      <div className="set-row">
        <div>
          Save recovery
          <div className="s-desc">Inspect and export the main save and both backup slots without running the game.</div>
        </div>
        {/* Relative to the app's base — the site lives under a subpath on Pages. */}
        <a className="btn" href={`${import.meta.env.BASE_URL}recovery.html`}>
          Open
        </a>
      </div>

      <div className="set-row">
        <div>
          Export save
          <div className="s-desc">Copies a portable save string to your clipboard.</div>
        </div>
        <button
          className="btn"
          onClick={() => {
            void navigator.clipboard?.writeText(exportToClipboard()).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? 'Share and Enjoy ✓' : 'Copy'}
        </button>
      </div>

      <div className="set-row" style={{ display: 'block' }}>
        <div style={{ marginBottom: 8 }}>
          Import save
          <div className="s-desc">Paste a TC2 string. Your current universe will be replaced without ceremony.</div>
        </div>
        <textarea ref={importRef} className="import-area" placeholder="TC2:…" />
        {importErr && <div className="s-desc" style={{ color: 'var(--danger)' }}>{importErr}</div>}
        <button
          className="btn"
          style={{ marginTop: 8 }}
          onClick={() => {
            const err = importFromText(importRef.current?.value ?? '');
            setImportErr(err);
            if (!err && importRef.current) importRef.current.value = '';
          }}
        >
          Import
        </button>
      </div>

      <div className="set-row">
        <div>
          Erase universe
          <div className="s-desc">
            {resetArmed
              ? 'Are you certain? This is the plunger the demolition orders mention.'
              : 'Deletes the save. Magrathea keeps no copies. Neither will you.'}
          </div>
        </div>
        {resetArmed ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <button className="btn" onClick={() => setResetArmed(false)}>
              No
            </button>
            <button
              className="btn danger"
              onClick={() => {
                setResetArmed(false);
                hardReset();
              }}
            >
              Demolish
            </button>
          </div>
        ) : (
          <button className="btn danger" onClick={() => setResetArmed(true)}>
            Erase
          </button>
        )}
      </div>

      <p className="panel-sub" style={{ marginTop: 16 }}>
        TerraClicker Redux · a Hitchhiker-flavored incremental · saves locally, works offline ·
        the number 42 renders gold and no explanation will ever be given.
      </p>
    </div>
  );
}
