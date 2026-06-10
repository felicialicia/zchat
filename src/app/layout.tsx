import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "ZChat - Chat Internal Tim",
  description: "Aplikasi chat internal real-time dengan dukungan AI Assistant",
  keywords: ["ZChat", "chat", "internal", "real-time", "AI", "Next.js", "TypeScript"],
  authors: [{ name: "Z.ai Team" }],
  manifest: "/manifest.json",
  icons: {
    icon: "https://z-cdn.chatglm.cn/z-ai/static/logo.svg",
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "ZChat",
  },
  openGraph: {
    title: "ZChat - Chat Internal Tim",
    description: "Aplikasi chat internal real-time dengan dukungan AI Assistant",
    url: "https://chat.z.ai",
    siteName: "ZChat",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ZChat - Chat Internal Tim",
    description: "Aplikasi chat internal real-time dengan dukungan AI Assistant",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
