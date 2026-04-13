import { Outfit } from "next/font/google";
import "@/app/globals.css";
import { GoogleAnalytics } from '@next/third-parties/google'
import { PostHogProvider } from '@/components/PostHogProvider'
import { PostHogPageView } from '@/components/PostHogPageView'
import { Suspense } from 'react'

const outfit = Outfit({
    subsets: ["latin"],
    variable: "--font-outfit",
    display: "swap",
    weight: ["300", "400", "500", "600", "700"],
});

export const metadata = {
    title: {
        template: '%s | Overwatch',
        default: 'Overwatch',
    },
    description: "Page Not Found",
};

export default async function RootLayout({ children }) {

    const isProd = process.env.NODE_ENV === 'production'
    const gaId = process.env.NEXT_PUBLIC_GA_ID

    return (
        <html lang="en" className="h-full">
            <head>
                <meta property="og:image" content="/logo.png" />
                <link rel="icon" href="/logo.png" />
                {/* Google tag (gtag.js) */}
                {isProd && gaId && (
                    <GoogleAnalytics id={gaId} />
                )}
            </head>
            <body className={`${outfit.className} antialiased bg-slate-50 text-slate-900 h-full`}>
                <PostHogProvider>
                    <Suspense fallback={null}>
                        <PostHogPageView />
                    </Suspense>
                    {children}
                </PostHogProvider>
            </body>
        </html>
    );
}