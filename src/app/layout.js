import { Outfit } from "next/font/google";
import "./globals.css";

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata = {
  title: "Overwatch",
  description: "Threat Detection Dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${outfit.variable}`}>
      <body className={`${outfit.variable} antialiased bg-white text-slate-900`}>
        {children}
      </body>
    </html>
  );
}