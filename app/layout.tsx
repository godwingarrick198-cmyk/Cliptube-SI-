import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata={title:"Cliptube SI",description:"AI-powered YouTube clipping platform"};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}