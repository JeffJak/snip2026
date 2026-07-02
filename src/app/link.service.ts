import { Injectable, signal } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';

export interface ShortLink {
  code: string;
  url: string;
  shortUrl: string;
  hits: number;
  createdAt: string;
}

@Injectable({ providedIn: 'root' })
export class LinkService {
  private readonly http = inject(HttpClient);
  readonly links = signal<ShortLink[]>([]);
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  loadLinks() {
    this.loading.set(true);
    this.error.set(null);
    this.http.get<ShortLink[]>('http://localhost:3000/api/links').subscribe({
      next: (links) => {
        this.links.set(links);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(error.message || 'Unable to load links.');
      },
    });
  }

  createLink(url: string) {
    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);
    this.http.post<ShortLink>('http://localhost:3000/api/links', { url }).subscribe({
      next: (link) => {
        this.links.update((current) => [link, ...current]);
        this.success.set(link.shortUrl);
        this.loading.set(false);
      },
      error: (error: HttpErrorResponse) => {
        this.loading.set(false);
        this.error.set(error.error?.error || error.message || 'Unable to create link.');
      },
    });
  }
}
