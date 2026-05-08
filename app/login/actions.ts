"use server";

import { authenticateUser, encrypt } from "@/lib/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export async function loginAction(prevState: any, formData: FormData) {
  const username = formData.get("username") as string;
  const password = formData.get("password") as string;

  if (!username || !password) {
    return { error: "Por favor, completa todos los campos." };
  }

  const user = authenticateUser(username, password);

  if (!user) {
    return { error: "Usuario o contraseña incorrectos." };
  }

  const expires = new Date(Date.now() + 10 * 60 * 60 * 1000); // 10 horas
  const session = await encrypt({ ...user, expires });

  const cookieStore = await cookies();
  cookieStore.set("session", session, {
    expires,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
  });

  redirect("/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete("session");
  redirect("/login");
}
