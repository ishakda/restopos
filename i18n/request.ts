import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

import { LOCALE_COOKIE } from "@/lib/constants";
import { defaultLocale, isValidLocale } from "@/lib/locale";

/**
 * Cookie-based locale (no locale segment in URLs — right choice for an
 * authenticated POS app used on fixed terminals).
 */
export default getRequestConfig(async () => {
  const store = await cookies();
  const cookieLocale = store.get(LOCALE_COOKIE)?.value;
  const locale = isValidLocale(cookieLocale) ? cookieLocale : defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
