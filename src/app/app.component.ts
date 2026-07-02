import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { LinkService } from './link.service';

@Component({
  selector: 'app-root',
  imports: [FormsModule],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent {
  readonly title = 'snip-frontend';
  readonly linkService = inject(LinkService);
  readonly url = signal('');
  readonly linkUrl = computed(() => this.url().trim());
  readonly isValidUrl = computed(() => {
    const value = this.linkUrl();
    if (!value) {
      return false;
    }
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  });

  constructor() {
    this.linkService.loadLinks();
  }

  submit() {
    const value = this.url().trim();
    if (!this.isValidUrl()) {
      this.linkService.error.set('Please enter a valid http or https URL.');
      return;
    }
    this.linkService.createLink(value);
  }
}
