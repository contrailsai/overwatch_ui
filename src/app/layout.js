import { Outfit } from "next/font/google";
import "./globals.css";
import { AppLayout } from "@/components/AppLayout";

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
  description: "Threat Detection Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className={`${outfit.className} antialiased bg-white text-slate-900`}>
        <AppLayout>{children}</AppLayout>
      </body>
    </html>
  );
}