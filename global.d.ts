// M3E Web Components TypeScript declarations
import type { DetailedHTMLProps, HTMLAttributes, Ref } from 'react';

declare global {
  namespace JSX {
    interface IntrinsicElements {
      'm3e-theme': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        'color-scheme'?: string;
      };
      'm3e-button': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: 'filled' | 'outlined' | 'tonal' | 'text';
        disabled?: boolean;
        size?: string;
      };
      'm3e-icon-button': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: string;
        disabled?: boolean;
        title?: string;
      };
      'm3e-icon': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        name?: string;
        slot?: string;
      };
      'm3e-dialog': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        dismissible?: boolean;
        alert?: boolean;
        open?: boolean;
        ref?: Ref<HTMLElement>;
      };
      'm3e-dialog-action': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        'return-value'?: string;
      };
      'm3e-switch': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        checked?: boolean;
        icons?: string;
      };
      'm3e-tabs': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: string;
      };
      'm3e-tab': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        selected?: boolean;
        for?: string;
      };
      'm3e-tab-panel': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      'm3e-chip-set': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      'm3e-assist-chip': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement>;
      'm3e-button-group': DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: string;
      };
    }
  }
}
