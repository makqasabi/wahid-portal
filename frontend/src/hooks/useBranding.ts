import { useEffect, useState } from 'react';
import { configApi } from '@/api/client';
import type { BrandingSettings } from '@/types';

/**
 * Public branding config (portal name, tagline, logo, colors) — fetched from
 * the unauthenticated /shared/config endpoint so the login page is branded
 * before sign-in. Falls back to the shipped defaults until loaded.
 */

const FALLBACK: BrandingSettings = {
  portalNameEn: 'Wahid',
  portalNameAr: 'واحد',
  fullNameEn: 'Wahid Operations Portal',
  fullNameAr: 'بوابة واحد للعمليات',
  taglineEn: 'One unified portal for your operations — clear, fast, and accountable.',
  taglineAr: 'بوابة موحدة لعملياتك — وضوح وسرعة ومساءلة.',
  logoUrl: '',
  primaryColor: '#2f80aa',
  emailSignature: '— Wahid Portal',
  emailButtonColor: '#0d6efd',
};

let cached: BrandingSettings | null = null;
let inflight: Promise<BrandingSettings> | null = null;

function fetchBranding(): Promise<BrandingSettings> {
  if (cached) return Promise.resolve(cached);
  if (!inflight) {
    inflight = configApi
      .getPublic()
      .then((d) => {
        cached = d.branding;
        return d.branding;
      })
      .catch(() => {
        inflight = null;
        return FALLBACK;
      });
  }
  return inflight;
}

/** Force a refetch (after the admin edits branding). */
export function invalidateBranding(): void {
  cached = null;
  inflight = null;
}

export function useBranding() {
  const [branding, setBranding] = useState<BrandingSettings>(cached ?? FALLBACK);

  useEffect(() => {
    let mounted = true;
    void fetchBranding().then((b) => {
      if (mounted) setBranding(b);
    });
    return () => {
      mounted = false;
    };
  }, []);

  return branding;
}

/** Portal short name in the active language. */
export function brandName(b: BrandingSettings, lang: string): string {
  return lang.startsWith('ar') ? b.portalNameAr : b.portalNameEn;
}

/** Portal tagline in the active language. */
export function brandTagline(b: BrandingSettings, lang: string): string {
  return lang.startsWith('ar') ? b.taglineAr : b.taglineEn;
}
