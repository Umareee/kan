import "~/styles/globals.css";
import "~/utils/i18n";

import type { NextPage, Viewport } from "next";
import type { AppProps, AppType } from "next/app";
import type { ReactElement, ReactNode } from "react";
import { Plus_Jakarta_Sans } from "next/font/google";
import { ThemeProvider } from "next-themes";

import { FontSizeProvider } from "~/providers/font-size";
import { KeyboardShortcutProvider } from "~/providers/keyboard-shortcuts";
import { LinguiProviderWrapper } from "~/providers/lingui";
import { ModalProvider } from "~/providers/modal";
import { PopupProvider } from "~/providers/popup";
import { api } from "~/utils/api";

const jakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  display: "swap",
});

export const metadata = {
  title: "Kan",
  description: "The open source Trello alternative",
  icons: [{ rel: "icon", url: "/favicon.ico" }],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export type NextPageWithLayout<P = {}, IP = P> = NextPage<P, IP> & {
  getLayout?: (page: ReactElement) => ReactNode;
};

type AppPropsWithLayout = AppProps & {
  Component: NextPageWithLayout;
};

const MyApp: AppType = ({ Component, pageProps }: AppPropsWithLayout) => {
  const getLayout = Component.getLayout ?? ((page) => page);

  return (
    <>
      <style jsx global>{`
        html {
          font-family: ${jakarta.style.fontFamily};
        }
        body {
          position: relative;
        }
      `}</style>
      <script src="/__ENV.js" />
      <main className="font-sans">
        <KeyboardShortcutProvider>
          <LinguiProviderWrapper>
            <FontSizeProvider>
              <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
                <ModalProvider>
                  <PopupProvider>
                    {getLayout(<Component {...pageProps} />)}
                  </PopupProvider>
                </ModalProvider>
              </ThemeProvider>
            </FontSizeProvider>
          </LinguiProviderWrapper>
        </KeyboardShortcutProvider>
      </main>
    </>
  );
};

export default api.withTRPC(MyApp);
