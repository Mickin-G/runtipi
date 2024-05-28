'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useSocket } from '@/lib/socket/useSocket';
import { useSocketEmit } from '@/lib/socket/useSocketEmit';
import clsx from 'clsx';
import styles from './LogsTerminal.module.scss';

export const LogsTerminal = ({ appId }: { appId: string }) => {
  let nextId = 0;
  const [logs, setLogs] = useState<{ id: number; text: string }[]>([]);
  const [follow, setFollow] = useState<boolean>(true);
  const [maxLines, setMaxLines] = useState<number>(300);
  const [wrapLines, setWrapLines] = useState<boolean>(false);
  const ref = useRef<HTMLPreElement>(null);

  useSocketEmit({ type: 'viewLogs', data: { appId }, emitOnDisconnect: 'stopLogs' });

  useEffect(() => {
    if (ref.current && follow) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [logs, follow, wrapLines]);

  useSocket({
    selector: { type: 'logs', data: { property: 'appId', value: appId } },
    onCleanup: () => setLogs([]),
    onEvent: (_, data) => {
      setLogs((prevLogs) => {
        const newLogs = [...prevLogs, ...data.lines.map((line) => ({ id: nextId++, text: line.trim() }))];
        if (newLogs.length > maxLines) {
          return newLogs.slice(newLogs.length - maxLines);
        }
        return newLogs;
      });
    },
  });

  const updateMaxLines = (lines: number) => {
    const linesToKeep = Math.max(1, lines);
    setMaxLines(linesToKeep);
    setLogs(logs.slice(logs.length - linesToKeep));
  };

  return (
    <div>
      <div className="container">
        <div className="row">
          <div className="col">
            <label className="form-check form-switch mt-1" htmlFor="follow-logs">
              <input id="follow-logs" className="form-check-input" type="checkbox" checked={follow} onChange={() => setFollow(!follow)} />
              <span className="form-check-label">Follow logs</span>
            </label>
          </div>
          <div className="col">
            <label className="form-check form-switch mt-1" htmlFor="follow-logs">
              <input id="follow-logs" className="form-check-input" type="checkbox" checked={wrapLines} onChange={() => setWrapLines(!wrapLines)} />
              <span className="form-check-label">Wrap lines</span>
            </label>
          </div>
          <div className="col">
            <div className="input-group mb-2">
              <span className="input-group-text">Max lines:</span>
              <input
                id="max-lines"
                type="number"
                className="form-control"
                value={maxLines}
                onChange={(e) => updateMaxLines(parseInt(e.target.value, 10))}
              />
            </div>
          </div>
        </div>
      </div>
      <pre id="log-terminal" className={clsx('mt-2', styles.logTerminal, { [styles.wrapLines || '']: wrapLines })} ref={ref}>
        {logs.map((log) => (
          <React.Fragment key={log.id}>
            {log.text}
            <br />
          </React.Fragment>
        ))}
      </pre>
    </div>
  );
};

