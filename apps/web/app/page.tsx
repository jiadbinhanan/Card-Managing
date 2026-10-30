"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!isMounted) return;

        if (session?.user) {
          router.replace("/dashboard");
        } else {
          router.replace("/login");
        }
      } catch (err) {
        if (isMounted) router.replace("/login");
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-[#030014] flex flex-col items-center justify-center p-6 text-slate-50 font-sans">
      <div className="relative flex flex-col items-center">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-tr from-[#0ea5e9] to-[#a855f7] p-0.5 shadow-[0_0_30px_rgba(14,165,233,0.3)] mb-4 animate-pulse flex items-center justify-center">
          <div className="w-full h-full bg-[#030014] rounded-2xl flex items-center justify-center">
            <span className="text-xl font-black bg-gradient-to-r from-[#0ea5e9] to-[#a855f7] bg-clip-text text-transparent">C</span>
          </div>
        </div>
        <Loader2 className="w-5 h-5 text-[#0ea5e9] animate-spin" />
      </div>
    </div>
  );
}

