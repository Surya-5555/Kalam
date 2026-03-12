"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles, Shield, Zap, LogOut, User } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function Home() {
  const { user, logout } = useAuth();
  
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-primary/20 relative overflow-hidden font-sans">
      {/* Background Soft Glows & Gradients */}
      <div className="absolute inset-0 bg-white" />
      <div className="absolute top-0 right-0 w-[800px] h-[800px] bg-primary/5 blur-[100px] rounded-full pointer-events-none" />
      <div className="absolute bottom-0 left-[-20%] w-[600px] h-[600px] bg-sky-500/5 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 border-b border-slate-200/50 bg-white/70 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-xl text-slate-900">
            <Sparkles className="size-5 text-primary" />
            <span>Nexus</span>
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
                <Button asChild className="rounded-full shadow-sm hover:shadow-md transition-all">
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
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 border border-slate-200 text-sm font-medium text-slate-600 mb-8 shadow-xs animate-in slide-in-from-bottom-4 duration-500">
          <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          Nexus is now available in Early Access
        </div>

        {/* Hero Title */}
        <h1 className="text-5xl md:text-7xl font-bold tracking-tight mb-8 leading-[1.1] text-slate-900 animate-in slide-in-from-bottom-8 duration-700 fade-in">
          The next generation <br />
          <span className="text-transparent bg-clip-text bg-linear-to-r from-primary via-indigo-500 to-sky-500">
            secure platform
          </span>
        </h1>

        {/* Hero Subtitle */}
        <p className="text-lg md:text-xl text-slate-600 max-w-2xl mb-12 animate-in slide-in-from-bottom-10 duration-1000 fade-in">
          Experience seamless authentication with our beautiful, intuitive, and highly secure infrastructure designed for modern applications.
        </p>

        {/* CTA Buttons */}
        <div className="flex flex-col sm:flex-row items-center gap-4 animate-in slide-in-from-bottom-12 duration-1000 fade-in">
          {user ? (
            <Button asChild size="lg" className="rounded-full h-14 px-8 text-base shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all group">
              <Link href="/dashboard">
                Go to Dashboard
                <ArrowRight className="ml-2 size-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          ) : (
            <Button asChild size="lg" className="rounded-full h-14 px-8 text-base shadow-lg shadow-primary/20 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5 transition-all group">
              <Link href="/login">
                Start Building Now
                <ArrowRight className="ml-2 size-5 group-hover:translate-x-1 transition-transform" />
              </Link>
            </Button>
          )}
          <Button asChild size="lg" variant="outline" className="rounded-full h-14 px-8 text-base border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:text-slate-900 shadow-xs">
            <Link href="#">View Documentation</Link>
          </Button>
        </div>

        {/* Features Preview */}
        <div className="grid md:grid-cols-3 gap-8 mt-32 w-full animate-in slide-in-from-bottom-full duration-1000 fade-in">
          {[
            { icon: Shield, title: "Bank-grade Security", desc: "Top-tier encryption protecting your users' data with zero compromise." },
            { icon: Zap, title: "Lightning Fast", desc: "Optimized global edge network for instant logins anywhere in the world." },
            { icon: Sparkles, title: "Beautiful UI", desc: "Stunning, customizable components built dynamically with Tailwind." }
          ].map((feature, i) => (
            <div key={i} className="p-8 rounded-3xl bg-white border border-slate-100 shadow-xs hover:shadow-xl hover:-translate-y-1 transition-all duration-300 text-left group">
              <div className="size-12 rounded-2xl bg-primary/10 flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300">
                <feature.icon className="size-6 text-primary" />
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
