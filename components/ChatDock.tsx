"use client";
import { forwardRef } from "react";

interface ChatDockProps {
  onClick: () => void;
}

// Barra minimizada del chat (visible en desktop)
const ChatDock = forwardRef<HTMLButtonElement, ChatDockProps>(({ onClick }, ref) => {
  return (
    <button
      ref={ref}
      onClick={onClick}
      className="hidden md:flex fixed bottom-5 right-5 z-50 items-center gap-2 bg-gray-800/90 hover:bg-gray-700 text-white border border-gray-700 rounded-full pl-3 pr-3 py-2 shadow-lg backdrop-blur-sm"
      aria-label="Abrir chat"
      title="Abrir chat"
    >
      <svg suppressHydrationWarning xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.76c0 1.6 1.123 2.994 2.707 3.227 1.068.157 2.148.279 3.238.364.466.037.893.281 1.153.671L12 21l2.652-3.978c.26-.39.687-.634 1.153-.67 1.09-.086 2.17-.208 3.238-.365 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.344 48.344 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" />
      </svg>
      <span className="text-sm font-medium">Chat</span>
    </button>
  );
});
ChatDock.displayName = "ChatDock";

export default ChatDock;
