'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useConsentimento } from '@/lib/cookieConsent';
import { META_PIXEL_ID, pixelAtivo, rotaPermitePixel, trackMetaEvent } from '@/lib/metaPixel';

/**
 * Carrega o pixel da Meta só nas páginas públicas, só com NEXT_PUBLIC_META_PIXEL_ID e só
 * depois que o visitante aceita os cookies de Marketing.
 * A primeira PageView sai do próprio snippet; as seguintes (navegação sem recarregar)
 * saem daqui.
 */
export function MetaPixel() {
  const pathname = usePathname();
  const primeira = useRef(true);
  const consentimento = useConsentimento();
  const permitido = pixelAtivo() && rotaPermitePixel(pathname) && consentimento?.marketing === true;

  useEffect(() => {
    if (!permitido) return;
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    trackMetaEvent('PageView');
  }, [pathname, permitido]);

  if (!permitido) return null;

  return (
    <Script id="meta-pixel" strategy="afterInteractive">
      {`!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${META_PIXEL_ID}');fbq('track','PageView');`}
    </Script>
  );
}
