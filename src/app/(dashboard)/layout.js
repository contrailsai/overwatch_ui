import { Outfit } from "next/font/google";
import "@/app/globals.css";
import { getClientandProjectDetails } from '@/app/(dashboard)/actions'
import { Sidebar } from '@/components/Sidebar'
// import { AppLayout } from "@/components/AppLayout";

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
  const { user, clientDetails, project } = await getClientandProjectDetails()

  return (
    <html lang="en" className="h-full">
      <body className={`${outfit.className} antialiased bg-slate-50 text-slate-900 h-full`}>
        <div className="flex h-full bg-slate-50 overflow-hidden">
          <Sidebar user={user} clientDetails={clientDetails} project={project} />
          <main className="flex-1 relative overflow-y-auto focus:outline-none">
            {children}
          </main>
        </div>
        {/* <AppLayout>{children}</AppLayout> */}
      </body>
    </html>
  );
}