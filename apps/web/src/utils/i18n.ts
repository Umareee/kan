import { i18n } from "@lingui/core";

import type { Locale } from "~/locales";
import { defaultLocale } from "~/locales";
import { messages as enMessages } from "~/locales/en/messages";

const loadMessages = async (_locale: Locale) => {
  return enMessages;
};

let isInitialized = false;
const loadedLocales = new Set<string>();

export function initializeI18n(locale: Locale = defaultLocale) {
  if (!isInitialized) {
    i18n.load(defaultLocale, enMessages);
    i18n.activate(defaultLocale);
    loadedLocales.add(defaultLocale);
    isInitialized = true;
  }

  return i18n;
}

export async function activateLocale(locale: Locale) {
  if (!loadedLocales.has(locale)) {
    const messages = await loadMessages(locale);
    i18n.load(locale, messages);
    loadedLocales.add(locale);
  }

  i18n.activate(locale);
  return i18n;
}

initializeI18n();

export { i18n };
