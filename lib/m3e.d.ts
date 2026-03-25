// M3E Web Components TypeScript declarations
declare global {
  namespace JSX {
    interface IntrinsicElements {
      'm3e-theme': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'color-scheme'?: string;
      };
      'm3e-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: 'filled' | 'outlined' | 'tonal' | 'text';
        disabled?: boolean;
        size?: string;
      };
      'm3e-icon-button': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: string;
        disabled?: boolean;
        title?: string;
      };
      'm3e-icon': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        name?: string;
        slot?: string;
      };
      'm3e-dialog': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        dismissible?: boolean;
        alert?: boolean;
        open?: boolean;
        ref?: React.Ref<HTMLElement>;
      };
      'm3e-dialog-action': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        'return-value'?: string;
      };
      'm3e-switch': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        checked?: boolean;
        icons?: string;
      };
      'm3e-tabs': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: string;
      };
      'm3e-tab': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        selected?: boolean;
        for?: string;
      };
      'm3e-tab-panel': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'm3e-chip-set': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'm3e-assist-chip': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
      'm3e-button-group': React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement> & {
        variant?: string;
      };
    }
  }
}

export {};
