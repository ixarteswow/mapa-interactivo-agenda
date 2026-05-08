import { jwtVerify, SignJWT } from "jose";

// Clave secreta para firmar los JWT. En producción debería venir de process.env.JWT_SECRET
const secretKey = process.env.JWT_SECRET || "secreto_super_seguro_mapa_interactivo_2026";
const key = new TextEncoder().encode(secretKey);

export type Role = "admin" | "user";

export interface SessionPayload {
  username: string;
  role: Role;
  expires: Date;
}

// Definición de usuarios (Simulación de Base de Datos)
// En un entorno real, las contraseñas deberían estar encriptadas (ej. bcrypt)
const USERS = [
  {
    username: process.env.ADMIN_USER || "admin",
    password: process.env.ADMIN_PASSWORD || "admin_master_key",
    role: "admin" as Role,
  },
  {
    username: process.env.GUEST_USER || "invitado",
    password: process.env.GUEST_PASSWORD || "invitado_master_key",
    role: "user" as Role,
  },
];

export async function encrypt(payload: any) {
  return await new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("10h from now")
    .sign(key);
}

export async function decrypt(input: string): Promise<any> {
  try {
    const { payload } = await jwtVerify(input, key, {
      algorithms: ["HS256"],
    });
    return payload;
  } catch (error) {
    return null;
  }
}

export function authenticateUser(username: string, password: string) {
  const user = USERS.find(
    (u) => u.username === username && u.password === password
  );
  if (!user) return null;
  
  return {
    username: user.username,
    role: user.role,
  };
}
