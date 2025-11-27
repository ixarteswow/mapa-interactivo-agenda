// components/MenuButton.tsx
"use client";
import { type FC } from "react";

interface MenuButtonProps {
  onClick: () => void;
}

const MenuButton: FC<MenuButtonProps> = ({ onClick }) => {
  return (
    <button
      onClick={onClick}
      className="fixed top-4 left-4 z-30 bg-gray-800 p-2 rounded-md text-white hover:bg-gray-700 transition-colors"
      aria-label="Abrir menú de direcciones"
    >
      <svg
        suppressHydrationWarning
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        strokeWidth={1.5}
        stroke="currentColor"
        className="w-6 h-6"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
        />
      </svg>
    </button>
  );
};

export default MenuButton;
