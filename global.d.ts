// M3E Web Components TypeScript declarations for Next.js / React
import type { HTMLAttributes } from 'react';

type WC<Extra = Record<string, unknown>> = HTMLAttributes<HTMLElement> & Extra & {
  slot?: string;
  ref?: React.Ref<HTMLElement>;
  [key: string]: unknown; // allow any attribute for web components
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'm3e-theme':        WC<{ 'color-scheme'?: string }>;
      'm3e-button':       WC<{ variant?: string; disabled?: boolean; size?: string }>;
      'm3e-icon-button':  WC<{ variant?: string; disabled?: boolean; title?: string; selected?: boolean }>;
      'm3e-icon':         WC<{ name?: string; slot?: string }>;
      'm3e-dialog':       WC<{ dismissible?: boolean; alert?: boolean; open?: boolean }>;
      'm3e-dialog-action':WC<{ 'return-value'?: string }>;
      'm3e-switch':       WC<{ checked?: boolean; icons?: string }>;
      'm3e-tabs':         WC<{ variant?: string; id?: string }>;
      'm3e-tab':          WC<{ selected?: boolean; for?: string }>;
      'm3e-tab-panel':    WC<{ id?: string }>;
      'm3e-chip-set':     WC;
      'm3e-assist-chip':  WC<{ label?: string }>;
      'm3e-button-group': WC<{ variant?: string }>;
      'm3e-nav-rail':     WC;
      'm3e-nav-item':     WC<{ selected?: boolean; href?: string }>;
      'm3e-loading-indicator': WC<{ variant?: string }>;
      'm3e-segmented-button': WC;
      'm3e-seg-button':   WC<{ selected?: boolean }>;
    }
  }
}

export {};
