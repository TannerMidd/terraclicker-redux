/**
 * ST · Settings.
 *
 * Written in the register of a requisition form, because that is what it is.
 * Every row is a statement of what the switch does and then the switch, in the
 * same place on every line — a settings drawer where the controls wander about
 * is a settings drawer people stop reading.
 *
 * The destructive one is last, red, and asks twice.
 */
import { useRef, useState } from 'react';
import {
  exportToClipboard,
  hardReset,
  importFromText,
  saveNow,
  useGame,
} from '../../../state/store';
import { useSettings, type Quality } from '../../settings';

export function Settings() {
  const settings = useSettings();
  const persistenceBlocked = useGame((game) => game.persistenceBlocked);
  const [copied, setCopied] = useState(false);
  const [importErr, setImportErr] = useState<string | null>(null);
  const [resetArmed, setResetArmed] = useState(false);
  const importRef = useRef<HTMLTextAreaElement>(null);

  return (
    <>
      <div className="dr-sec">
        <span className="dr-sec-k">Sirius Cybernetics preferences division</span>
        <span className="dr-rule" />
      </div>

      <div className="dr-set">
        <span>
          <b>Sound</b>
          <em>Genuine synthesized personalities. No files were harmed.</em>
        </span>
        <button className="dr-btn" onClick={() => settings.setAudio(!settings.audio)}>
          {settings.audio ? 'ON' : 'OFF'}
        </button>
      </div>

      <div className="dr-set">
        <span>
          <b>Render quality</b>
          <em>Auto detects your ship’s capabilities.</em>
        </span>
        <select
          className="dr-btn"
          value={settings.quality}
          onChange={(e) => settings.setQuality(e.target.value as Quality)}
        >
          <option value="auto">AUTO</option>
          <option value="high">HIGH</option>
          <option value="medium">MEDIUM</option>
          <option value="low">LOW</option>
        </select>
      </div>

      <div className="dr-set">
        <span>
          <b>Save now</b>
          <em>
            {persistenceBlocked
              ? 'Autosave is paused to protect rejected save data. Use recovery, import, or reset.'
              : 'Autosaves every 10 seconds. This button is for comfort.'}
          </em>
        </span>
        <button className="dr-btn" disabled={persistenceBlocked} onClick={() => saveNow()}>
          {persistenceBlocked ? 'PAUSED' : 'SAVE'}
        </button>
      </div>

      <div className="dr-set">
        <span>
          <b>Save recovery</b>
          <em>Inspect and export the main save and both backup slots without running the game.</em>
        </span>
        {/* Relative to the app's base — the site lives under a subpath on Pages. */}
        <a className="dr-btn" href={`${import.meta.env.BASE_URL}recovery.html`}>OPEN</a>
      </div>

      <div className="dr-set">
        <span>
          <b>Export save</b>
          <em>Copies a portable save string to your clipboard.</em>
        </span>
        <button
          className="dr-btn"
          onClick={() => {
            void navigator.clipboard?.writeText(exportToClipboard()).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
        >
          {copied ? 'SHARE AND ENJOY ✓' : 'COPY'}
        </button>
      </div>

      <div className="dr-set block">
        <span>
          <b>Import save</b>
          <em>Paste a TC2 string. Your current universe will be replaced without ceremony.</em>
        </span>
        <textarea ref={importRef} className="dr-import" placeholder="TC2:…" />
        {importErr && <div className="dr-err">{importErr}</div>}
        <button
          className="dr-btn"
          onClick={() => {
            const err = importFromText(importRef.current?.value ?? '');
            setImportErr(err);
            if (!err && importRef.current) importRef.current.value = '';
          }}
        >
          IMPORT
        </button>
      </div>

      <div className="dr-set danger">
        <span>
          <b>Erase universe</b>
          <em>
            {resetArmed
              ? 'Are you certain? This is the plunger the demolition orders mention.'
              : 'Deletes the save. Magrathea keeps no copies. Neither will you.'}
          </em>
        </span>
        {resetArmed ? (
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="dr-btn" onClick={() => setResetArmed(false)}>NO</button>
            <button
              className="dr-btn red"
              onClick={() => {
                setResetArmed(false);
                hardReset();
              }}
            >
              DEMOLISH
            </button>
          </span>
        ) : (
          <button className="dr-btn red" onClick={() => setResetArmed(true)}>ERASE</button>
        )}
      </div>

      <p className="dr-note">
        TerraClicker Redux · a Hitchhiker-flavored incremental · saves locally, works offline ·
        the number 42 renders gold and no explanation will ever be given.
      </p>
    </>
  );
}
