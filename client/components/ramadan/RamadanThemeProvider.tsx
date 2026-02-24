/**
 * RamadanThemeProvider — Context React pour le thème Ramadan 2026
 *
 * Wrapper léger qui expose `isRamadan` via context.
 * Permet aux composants enfants de détecter le thème Ramadan
 * sans prop-drilling.
 */

import { createContext, useContext, type ReactNode } from "react";

type RamadanThemeContextValue = {
  isRamadan: boolean;
};

const RamadanThemeContext = createContext<RamadanThemeContextValue>({
  isRamadan: false,
});

export function RamadanThemeProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <RamadanThemeContext.Provider value={{ isRamadan: active }}>
      {children}
    </RamadanThemeContext.Provider>
  );
}

/**
 * Hook pour savoir si le thème Ramadan est actif.
 * @returns `true` si on est dans un <RamadanThemeProvider active={true}>
 */
export function useRamadanTheme(): boolean {
  return useContext(RamadanThemeContext).isRamadan;
}
