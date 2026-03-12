"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, FileText, Zap, Shield, LogOut, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user, logout } = useAuth();
  
  return (
    <div className="min-h-screen bg-white text-slate-900 selection:bg-slate-200 relative overflow-hidden font-sans">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-slate-200/50 bg-white/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-slate-900">
            <span>Automator</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200">
                  <User className="size-4 text-slate-500" />
                  <span className="text-sm font-medium text-slate-700">{user.name || "User"}</span>
                </div>
                <Button onClick={logout} variant="outline" className="rounded-full shadow-sm hover:shadow-md transition-all border-slate-200 bg-white hover:bg-slate-50 text-slate-700">
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" className="text-sm font-medium text-slate-600 hover:text-slate-900 transition-colors">
                  Log in
                </Link>
                <Button asChild className="rounded-full shadow-none transition-all bg-black hover:bg-slate-800 text-white border-0">
                  <Link href="/login">Get Started</Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 pt-40 pb-24 px-6 max-w-7xl mx-auto flex flex-col items-center text-center">
        {/* Early Access Badge */}
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-sm font-medium text-slate-900 mb-8">
          Automator OCR Extraction System
        </div>

        {/* Hero Title */}
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 leading-[1.1] text-black">
          Transform invoices into <br />
          <span className="text-slate-600">structured data</span> instantly
        </h1>

        {/* Hero Subtitle */}
        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mb-10">
          Automate your accounts payable workflow. Upload PDFs or images, and let our AI model accurately extract supplier details, items, and tax information into clean JSON.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4">
          {user ? (
            <Button asChild size="lg" className="rounded-full h-14 px-8 text-base shadow-none hover:-translate-y-0.5 transition-all bg-black hover:bg-slate-800 text-white border-0">
              <Link href="/dashboard">
                Go to Dashboard
                <ArrowRight className="ml-2 size-5" />
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="rounded-full h-14 px-8 text-base shadow-none hover:-translate-y-0.5 transition-all bg-black hover:bg-slate-800 text-white border-0">
              <Link href="/login">
                Start Processing
                <ArrowRight className="ml-2 size-5" />
              </Link>
            </Button>
          )}
        </div>

        {/* Features Preview */}
        <div className="grid md:grid-cols-3 gap-8 mt-32 w-full">
          {[
            { icon: FileText, title: "Any Format", desc: "Supports digital PDFs, scanned documents, and mobile photos (JPEG/PNG)." },
            { icon: Zap, title: "AI-Powered", desc: "No templates needed. Our LLM understands diverse invoice layouts automatically." },
            { icon: Shield, title: "Verified Extraction", desc: "Built-in business rules validate totals, taxes, and dates for absolute confidence." }
          ].map((feature, i) => (
            <div key={i} className="p-8 rounded-2xl bg-white border border-slate-200 text-left">
              <div className="size-12 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
                <feature.icon className="size-6 text-slate-900" />
              </div>
              <h3 className="text-xl font-semibold mb-3 text-slate-900">{feature.title}</h3>
              <p className="text-slate-600 leading-relaxed">{feature.desc}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}

