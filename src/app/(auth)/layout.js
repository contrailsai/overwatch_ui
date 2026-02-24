import { Outfit } from "next/font/google";
import "@/app/globals.css";

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

export default async function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full">
      <body className={`${outfit.className} antialiased bg-slate-50 text-slate-900 h-full`}>
        {children}
      </body>
    </html>
  );
}