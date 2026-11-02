"use client";
import { useEffect, useRef, useState } from "react";

interface InstallPrompt extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

// Capture before Settings is opened: Chromium may emit this only once per page.
export function useAppInstall() {
  const prompt = useRef<InstallPrompt | null>(null);
  const [available, setAvailable] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => {
    const ready = (event: Event) => {
      event.preventDefault(); prompt.current = event as InstallPrompt; setAvailable(true);
    };
    const installed = () => {
      prompt.current = null; setAvailable(false);
      setMessage("App installed. Check storage protection again; installation alone does not confirm protection.");
    };
    window.addEventListener("beforeinstallprompt", ready);
    window.addEventListener("appinstalled", installed);
    return () => {
      window.removeEventListener("beforeinstallprompt", ready);
      window.removeEventListener("appinstalled", installed);
    };
  }, []);
  async function install() {
    const event = prompt.current;
    if (!event) return;
    prompt.current = null; setAvailable(false);
    try {
      await event.prompt();
      const choice = await event.userChoice;
      setMessage(choice.outcome === "accepted"
        ? "Installation accepted. After it finishes, check storage protection again."
        : "Installation cancelled. You can install later from the browser's app menu.");
    } catch {
      setMessage("Installation could not be started. Use the install icon beside the website address or your browser's app menu.");
    }
  }
  return { available, message, install };
}
