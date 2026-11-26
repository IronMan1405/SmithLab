import { useEffect, useRef } from 'react';
import { type KeyCommand, type KeyContext, commandForKey, isTextEntryTarget } from './keyboard';

/** Window-level keyboard shortcuts; inactive while typing in a text field. */
export function useKeyboardShortcuts(context: KeyContext, onCommand: (command: KeyCommand) => void): void {
  const latest = useRef({ context, onCommand });
  latest.current = { context, onCommand };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTextEntryTarget(e.target)) return;
      const command = commandForKey({ key: e.key, shiftKey: e.shiftKey }, latest.current.context);
      if (!command) return;
      e.preventDefault();
      latest.current.onCommand(command);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
