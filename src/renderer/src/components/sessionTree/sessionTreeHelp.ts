/**
 * Opening the session tree explanation from anywhere.
 *
 * The dialog itself is rendered once, at `App` level (`SessionTreeHelpDialog`),
 * because the buttons that open it live in transient places: inside tooltips and
 * inside the tree dialog itself.
 */
import { createContext, useContext } from 'react';

export interface SessionTreeHelpHandle {
  openHelp: () => void;
}

export const SessionTreeHelpContext = createContext<SessionTreeHelpHandle>({
  openHelp: () => {},
});

export function useSessionTreeHelp(): SessionTreeHelpHandle {
  return useContext(SessionTreeHelpContext);
}
