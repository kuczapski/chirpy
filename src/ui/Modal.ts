export class Modal {
  readonly element = document.createElement('dialog');
  private previousFocus: HTMLElement | null = null;
  onCancel: (() => void) | null = null;
  constructor() {
    this.element.className = 'modal';
    this.element.setAttribute('aria-label', 'Chirpy dialog');
    document.body.append(this.element);
    this.element.addEventListener('cancel', event => {
      event.preventDefault();
      if (this.onCancel) this.onCancel(); else this.close();
    });
  }
  show(html: string, onCancel?: () => void): void {
    if (!this.element.open) this.previousFocus = document.activeElement as HTMLElement | null;
    this.element.innerHTML = html;
    this.onCancel = onCancel ?? null;
    if (!this.element.open) this.element.showModal();
    this.element.querySelector<HTMLElement>('[autofocus], button, input, select')?.focus();
  }
  close(): void {
    this.element.close();
    this.onCancel = null;
    this.previousFocus?.focus();
  }
  query<T extends HTMLElement>(selector: string): T {
    const element = this.element.querySelector<T>(selector);
    if (!element) throw new Error(`Missing dialog element: ${selector}`);
    return element;
  }
}
